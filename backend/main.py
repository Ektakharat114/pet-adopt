"""Paws & Hearts Adoption Centre - FastAPI backend."""
import calendar
import hashlib
import html
import logging
import os
import secrets
import time
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional
from xml.sax.saxutils import escape as xml_escape

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, EmailStr, Field as PField, field_validator
from sqlalchemy import JSON, Column, inspect, text
from sqlmodel import Field, Session, SQLModel, create_engine, select

import mailer
from ratelimit import RateLimiter

try:  # optional: read settings from backend/.env when python-dotenv is installed
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

log = logging.getLogger("petadopt")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "petadopt/pets")
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTOS = 10
MIN_FILL_MS = 3000  # a person needs a few seconds to fill in the form

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./petadopt.db")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
# Public address of the website (used in emails, share pages and the sitemap)
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173").rstrip("/")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
admin_tokens: set[str] = set()
limiter = RateLimiter()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands datetimes back without a timezone; treat those as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def centre_info() -> dict:
    return {
        "name": os.getenv("CENTRE_NAME", "Paws & Hearts Adoption Centre"),
        "email": os.getenv("CENTRE_EMAIL", ""),
        "phone": os.getenv("CENTRE_PHONE", ""),
        "address": os.getenv("CENTRE_ADDRESS", ""),
        "upi_id": os.getenv("DONATE_UPI_ID", ""),
        "bank_details": os.getenv("DONATE_BANK_DETAILS", ""),
    }


def staff_email() -> str:
    return os.getenv("STAFF_NOTIFY_EMAIL", "")


def _is_http_url(value: str) -> bool:
    return value.startswith(("http://", "https://")) and len(value) <= 1000


# ---------- Models ----------
class Pet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    species: str  # dog, cat, rabbit, bird, other
    breed: str = ""
    age_years: float = 1.0
    gender: str = "unknown"
    size: str = "medium"
    energy_level: str = "medium"  # low | medium | high
    description: str = ""
    special_needs: str = ""
    image_url: str = ""  # cover photo (always the first of `photos`)
    photos: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    good_with_kids: bool = True
    good_with_dogs: bool = True
    good_with_cats: bool = True
    vaccinated: bool = True
    status: str = "available"  # available | pending | adopted
    adopted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class PetIn(BaseModel):
    name: str = PField(min_length=1, max_length=80)
    species: Literal["dog", "cat", "rabbit", "bird", "other"]
    breed: str = PField("", max_length=80)
    age_years: float = PField(1.0, ge=0, le=40)
    gender: Literal["male", "female", "unknown"] = "unknown"
    size: Literal["small", "medium", "large"] = "medium"
    energy_level: Literal["low", "medium", "high"] = "medium"
    description: str = PField("", max_length=2000)
    special_needs: str = PField("", max_length=300)
    image_url: str = ""
    photos: list[str] = PField(default_factory=list)
    good_with_kids: bool = True
    good_with_dogs: bool = True
    good_with_cats: bool = True
    vaccinated: bool = True
    status: Literal["available", "pending", "adopted"] = "available"

    @field_validator("image_url")
    @classmethod
    def _check_cover(cls, v: str) -> str:
        v = v.strip()
        if v and not _is_http_url(v):
            raise ValueError("Photo links must start with http:// or https://")
        return v

    @field_validator("photos")
    @classmethod
    def _check_photos(cls, v: list[str]) -> list[str]:
        cleaned = [u.strip() for u in v if u and u.strip()]
        if any(not _is_http_url(u) for u in cleaned):
            raise ValueError("Photo links must start with http:// or https://")
        if len(cleaned) > MAX_PHOTOS:
            raise ValueError(f"A pet can have up to {MAX_PHOTOS} photos.")
        return cleaned


class Application(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pet_id: int = Field(foreign_key="pet.id")
    applicant_name: str
    email: str
    phone: str
    address: str = ""
    has_other_pets: bool = False
    message: str = ""
    status: str = "pending"  # pending | approved | rejected
    tracking_code: str = Field(default="", index=True)
    decided_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class ApplicationIn(BaseModel):
    pet_id: int
    applicant_name: str = PField(min_length=2, max_length=120)
    email: EmailStr
    phone: str = PField(min_length=7, max_length=30)
    address: str = PField("", max_length=300)
    has_other_pets: bool = False
    message: str = PField("", max_length=2000)
    website: str = ""  # honeypot: hidden from people, bots fill it in
    fill_time_ms: Optional[int] = None  # how long the form was open, measured in the browser


class TrackIn(BaseModel):
    code: str = PField(max_length=40)
    email: str = PField(max_length=200)


class Volunteer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str
    phone: str
    interests: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    availability: str = ""
    message: str = ""
    status: str = "new"  # new | contacted
    created_at: datetime = Field(default_factory=utcnow)


class VolunteerIn(BaseModel):
    name: str = PField(min_length=2, max_length=120)
    email: EmailStr
    phone: str = PField(min_length=7, max_length=30)
    interests: list[str] = PField(default_factory=list, max_length=10)
    availability: str = PField("", max_length=60)
    message: str = PField("", max_length=2000)
    website: str = ""  # honeypot

    @field_validator("interests")
    @classmethod
    def _short_interests(cls, v: list[str]) -> list[str]:
        return [i.strip()[:60] for i in v if i and i.strip()]


class StatusIn(BaseModel):
    status: str


class LoginIn(BaseModel):
    password: str


# ---------- Setup ----------
SEED = [
    dict(name="Buddy", species="dog", breed="Labrador Retriever", age_years=3, gender="male", size="large",
         energy_level="high", description="Buddy is a friendly, energetic lab who loves fetch and long walks. Great with kids."),
    dict(name="Luna", species="cat", breed="Siamese", age_years=2, gender="female", size="small",
         energy_level="low", description="Luna is a calm, affectionate lap cat who enjoys window-watching and gentle play."),
    dict(name="Max", species="dog", breed="German Shepherd", age_years=5, gender="male", size="large",
         energy_level="high", good_with_kids=False, good_with_dogs=False, good_with_cats=False,
         description="Loyal and intelligent. Max needs an active home with a fenced yard."),
    dict(name="Bella", species="dog", breed="Indie", age_years=1, gender="female", size="medium",
         energy_level="high", description="A playful rescue pup who is already house-trained and learning basic commands."),
    dict(name="Whiskers", species="cat", breed="Tabby", age_years=4, gender="male", size="small",
         energy_level="low", special_needs="Takes a small thyroid tablet each day, easy to hide in food.",
         description="Whiskers is a mellow guy who loves naps in sunny spots and chin scratches."),
    dict(name="Thumper", species="rabbit", breed="Holland Lop", age_years=1, gender="male", size="small",
         energy_level="medium", good_with_dogs=False, good_with_cats=False,
         description="Gentle and curious bunny who enjoys fresh greens and exploring."),
    dict(name="Kiwi", species="bird", breed="Budgerigar", age_years=2, gender="female", size="small",
         energy_level="medium", good_with_dogs=False, good_with_cats=False,
         description="A cheerful budgie who loves to chirp and is learning to whistle tunes."),
    dict(name="Coco", species="dog", breed="Beagle", age_years=2, gender="female", size="medium",
         energy_level="medium", status="pending",
         description="Sweet-natured beagle with a great nose and an even better personality."),
]

# Columns added after the first release. Existing SQLite files get them on startup.
MIGRATION_DEFAULTS = {
    ("pet", "photos"): "'[]'",
    ("pet", "energy_level"): "'medium'",
    ("pet", "special_needs"): "''",
    ("pet", "good_with_dogs"): "1",
    ("pet", "good_with_cats"): "1",
    ("application", "tracking_code"): "''",
}


def ensure_columns(db_engine) -> None:
    """Add any missing columns to existing SQLite tables (new installs don't need this).
    For PostgreSQL or MySQL use a real migration tool such as Alembic."""
    if db_engine.dialect.name != "sqlite":
        return
    insp = inspect(db_engine)
    with db_engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                ddl_type = col.type.compile(db_engine.dialect)
                default = MIGRATION_DEFAULTS.get((table.name, col.name))
                clause = f" DEFAULT {default}" if default is not None else ""
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl_type}{clause}'))


CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I to avoid mix-ups


def new_tracking_code(session: Session) -> str:
    while True:
        code = "PH-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not session.exec(select(Application).where(Application.tracking_code == code)).first():
            return code


def backfill_tracking_codes(session: Session) -> None:
    rows = session.exec(select(Application).where(Application.tracking_code == "")).all()
    for row in rows:
        row.tracking_code = new_tracking_code(session)
        session.add(row)
        session.commit()


def seed(session: Session):
    if session.exec(select(Pet)).first():
        return
    for p in SEED:
        pet = Pet(**{k: v for k, v in p.items() if k != "status"})
        set_status(pet, p.get("status", "available"))
        session.add(pet)
    session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    SQLModel.metadata.create_all(engine)
    ensure_columns(engine)
    with Session(engine) as s:
        backfill_tracking_codes(s)
        seed(s)
    yield


app = FastAPI(title="Paws & Hearts Adoption API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_session():
    with Session(engine) as session:
        yield session


def require_admin(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    if token not in admin_tokens:
        raise HTTPException(401, "Admin authentication required")


def rate_limited(name: str, limit: int, window_seconds: int):
    """Dependency: allow `limit` requests per `window_seconds` from one IP address."""

    def dep(request: Request):
        ip = request.client.host if request.client else "unknown"
        if not limiter.check(f"{name}:{ip}", limit, window_seconds):
            raise HTTPException(429, "Too many attempts. Please wait a little while and try again.")

    return dep


def set_status(pet: Pet, status: str) -> None:
    """Change a pet's status and keep the adoption date in step with it."""
    if status == "adopted" and pet.status != "adopted":
        pet.adopted_at = utcnow()
    elif status != "adopted":
        pet.adopted_at = None
    pet.status = status


def pet_fields(data: PetIn) -> dict:
    """Pet columns from a form: the cover (image_url) is always the first photo."""
    d = data.model_dump()
    photos = list(d["photos"])
    cover = d["image_url"]
    if cover:
        photos = [cover] + [u for u in photos if u != cover]
    photos = list(dict.fromkeys(photos))[:MAX_PHOTOS]
    d["photos"] = photos
    d["image_url"] = photos[0] if photos else ""
    return d


# ---------- Public routes ----------
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/centre")
def centre():
    return centre_info()


@app.get("/api/pets", response_model=list[Pet])
def list_pets(
    species: Optional[str] = None,
    status: Optional[str] = None,
    size: Optional[str] = None,
    energy: Optional[str] = None,
    kids: Optional[bool] = Query(None, description="Only pets that are good with children"),
    dogs: Optional[bool] = Query(None, description="Only pets that are good with dogs"),
    cats: Optional[bool] = Query(None, description="Only pets that are good with cats"),
    ids: Optional[str] = Query(None, description="Comma-separated pet ids"),
    q: Optional[str] = Query(None, description="Search name or breed"),
    session: Session = Depends(get_session),
):
    stmt = select(Pet)
    if species:
        stmt = stmt.where(Pet.species == species)
    if status:
        stmt = stmt.where(Pet.status == status)
    if size:
        stmt = stmt.where(Pet.size == size)
    if energy:
        stmt = stmt.where(Pet.energy_level == energy)
    if kids:
        stmt = stmt.where(Pet.good_with_kids == True)  # noqa: E712
    if dogs:
        stmt = stmt.where(Pet.good_with_dogs == True)  # noqa: E712
    if cats:
        stmt = stmt.where(Pet.good_with_cats == True)  # noqa: E712
    if ids is not None:
        wanted = [int(i) for i in ids.split(",") if i.strip().isdigit()][:50]
        stmt = stmt.where(Pet.id.in_(wanted))
    pets = session.exec(stmt.order_by(Pet.created_at.desc(), Pet.id.desc())).all()
    if q:
        ql = q.lower()
        pets = [p for p in pets if ql in p.name.lower() or ql in p.breed.lower()]
    return pets


@app.get("/api/pets/{pet_id}", response_model=Pet)
def get_pet(pet_id: int, session: Session = Depends(get_session)):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(404, "Pet not found")
    return pet


@app.get("/api/stats")
def stats(session: Session = Depends(get_session)):
    pets = session.exec(select(Pet)).all()
    return {
        "total": len(pets),
        "available": sum(p.status == "available" for p in pets),
        "adopted": sum(p.status == "adopted" for p in pets),
    }


@app.post("/api/applications", status_code=201, dependencies=[Depends(rate_limited("apply", 5, 3600))])
def submit_application(data: ApplicationIn, background: BackgroundTasks, session: Session = Depends(get_session)):
    if data.website.strip():
        # Honeypot filled in: a bot. Pretend it worked, save nothing.
        return {"id": 0, "tracking_code": "PH-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6)),
                "email_enabled": mailer.is_configured(), "message": "Application received! We'll be in touch soon."}
    if data.fill_time_ms is not None and data.fill_time_ms < MIN_FILL_MS:
        raise HTTPException(429, "That was quick! Please check your details and submit again.")
    pet = session.get(Pet, data.pet_id)
    if not pet:
        raise HTTPException(404, "Pet not found")
    if pet.status == "adopted":
        raise HTTPException(400, "This pet has already been adopted")
    email = data.email.strip().lower()
    existing = session.exec(
        select(Application).where(Application.pet_id == pet.id, Application.status == "pending")
    ).all()
    if any(a.email.lower() == email for a in existing):
        raise HTTPException(409, f"You have already applied for {pet.name}. Use your tracking code to check its status.")

    row = Application(
        pet_id=pet.id,
        applicant_name=data.applicant_name.strip(),
        email=email,
        phone=data.phone.strip(),
        address=data.address.strip(),
        has_other_pets=data.has_other_pets,
        message=data.message.strip(),
        tracking_code=new_tracking_code(session),
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    centre_data = centre_info()
    subject, body, html_body = mailer.application_received(
        centre_data, row.applicant_name, pet.name, row.tracking_code, f"{SITE_URL}/track?code={row.tracking_code}"
    )
    background.add_task(mailer.send_email, row.email, subject, body, html_body)
    if staff_email():
        s_subject, s_body, s_html = mailer.staff_new_application(
            centre_data["name"], row.applicant_name, row.email, row.phone, pet.name, row.message
        )
        background.add_task(mailer.send_email, staff_email(), s_subject, s_body, s_html)
    return {"id": row.id, "tracking_code": row.tracking_code, "email_enabled": mailer.is_configured(),
            "message": "Application received! We'll be in touch soon."}


@app.post("/api/applications/track", dependencies=[Depends(rate_limited("track", 10, 600))])
def track_application(data: TrackIn, session: Session = Depends(get_session)):
    code = data.code.strip().upper()
    row = session.exec(select(Application).where(Application.tracking_code == code)).first()
    if not row or row.email.lower() != data.email.strip().lower():
        raise HTTPException(404, "We couldn't find an application with those details. Check the code and email address.")
    pet = session.get(Pet, row.pet_id)
    return {
        "tracking_code": row.tracking_code,
        "status": row.status,
        "pet_id": row.pet_id,
        "pet_name": pet.name if pet else "(removed)",
        "pet_image": pet.image_url if pet else "",
        "pet_species": pet.species if pet else "other",
        "submitted_at": aware(row.created_at),
        "decided_at": aware(row.decided_at),
    }


@app.post("/api/volunteers", status_code=201, dependencies=[Depends(rate_limited("volunteer", 5, 3600))])
def submit_volunteer(data: VolunteerIn, background: BackgroundTasks, session: Session = Depends(get_session)):
    thanks = {"message": "Thank you! We'll be in touch about volunteering soon."}
    if data.website.strip():
        return thanks  # honeypot
    row = Volunteer(
        name=data.name.strip(), email=data.email.strip().lower(), phone=data.phone.strip(),
        interests=data.interests, availability=data.availability.strip(), message=data.message.strip(),
    )
    session.add(row)
    session.commit()
    centre_data = centre_info()
    subject, body, html_body = mailer.volunteer_thanks(centre_data, row.name)
    background.add_task(mailer.send_email, row.email, subject, body, html_body)
    if staff_email():
        s_subject, s_body, s_html = mailer.staff_new_volunteer(
            centre_data["name"], row.name, row.email, row.phone, row.interests
        )
        background.add_task(mailer.send_email, staff_email(), s_subject, s_body, s_html)
    return thanks


# ---------- Share previews and SEO ----------
@app.get("/share/pets/{pet_id}", response_class=HTMLResponse)
def share_pet(pet_id: int, session: Session = Depends(get_session)):
    """Link to share on WhatsApp, Facebook, etc. Chat apps don't run JavaScript, so this page
    carries the preview title, text and photo, then sends people on to the real pet page."""
    pet = session.get(Pet, pet_id)
    if not pet:
        return HTMLResponse("<h1>Pet not found</h1>", status_code=404)
    name = centre_info()["name"]
    target = f"{SITE_URL}/pets/{pet.id}"
    kind = pet.breed or pet.species
    title = f"Meet {pet.name}, a {kind} looking for a home | {name}"
    desc = (pet.description or f"{pet.name} is waiting for a loving home.")[:200]
    image = pet.image_url if _is_http_url(pet.image_url or "") else ""
    e = lambda s: html.escape(s, quote=True)  # noqa: E731
    image_tags = (
        f'<meta property="og:image" content="{e(image)}"><meta name="twitter:image" content="{e(image)}">' if image else ""
    )
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="{e(name)}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(target)}">{image_tags}
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{e(target)}">
<meta http-equiv="refresh" content="0; url={e(target)}">
</head><body><p>Taking you to <a href="{e(target)}">{e(pet.name)}'s page</a>…</p></body></html>"""
    return HTMLResponse(page)


@app.get("/sitemap.xml")
def sitemap(session: Session = Depends(get_session)):
    urls = [(f"{SITE_URL}/", None), (f"{SITE_URL}/pets", None), (f"{SITE_URL}/support", None), (f"{SITE_URL}/track", None)]
    for p in session.exec(select(Pet).where(Pet.status != "adopted")).all():
        urls.append((f"{SITE_URL}/pets/{p.id}", aware(p.created_at).date().isoformat()))
    items = "".join(
        f"<url><loc>{xml_escape(u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>" for u, d in urls
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    return Response(xml, media_type="application/xml")


# ---------- Admin routes ----------
@app.post("/api/admin/login", dependencies=[Depends(rate_limited("login", 8, 900))])
def admin_login(data: LoginIn):
    if not secrets.compare_digest(data.password, ADMIN_PASSWORD):
        raise HTTPException(401, "Incorrect password")
    token = secrets.token_urlsafe(32)
    admin_tokens.add(token)
    return {"token": token}


def cloudinary_signature(params: dict, api_secret: str) -> str:
    """Cloudinary signed-upload signature: sorted name=value pairs joined by '&',
    API secret appended with no separator, SHA-1 hex digest. `file`, `api_key`,
    `cloud_name` and `resource_type` are never part of the signed string."""
    to_sign = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return hashlib.sha1((to_sign + api_secret).encode()).hexdigest()


def looks_like_image(data: bytes) -> bool:
    """Check magic bytes so a renamed non-image can't pass on the Content-Type alone."""
    return (
        data.startswith(b"\xff\xd8\xff")  # JPEG
        or data.startswith(b"\x89PNG\r\n\x1a\n")  # PNG
        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")  # WebP
    )


@app.post("/api/uploads", dependencies=[Depends(require_admin)])
async def upload_photo(file: UploadFile = File(...)):
    """Staff-only: send a pet photo to Cloudinary and return its delivery URL."""
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        raise HTTPException(
            503,
            "Photo uploads are not set up yet. Add CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to the backend settings.",
        )
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Choose a JPG, PNG or WebP image.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Photo must be under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    if not looks_like_image(data):
        raise HTTPException(400, "That file doesn't look like a valid image.")

    params = {"folder": CLOUDINARY_FOLDER, "timestamp": int(time.time())}
    form = {
        **params,
        "api_key": CLOUDINARY_API_KEY,
        "signature": cloudinary_signature(params, CLOUDINARY_API_SECRET),
    }
    url = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                url, data=form, files={"file": (file.filename or "pet-photo", data, file.content_type)}
            )
    except httpx.HTTPError as exc:
        log.warning("Cloudinary request failed: %s", exc)
        raise HTTPException(502, "Could not reach the photo service. Please try again.")
    if res.status_code != 200:
        log.warning("Cloudinary rejected upload (%s): %s", res.status_code, res.text[:300])
        raise HTTPException(502, "The photo service rejected the upload. Check the Cloudinary settings.")

    info = res.json()
    # Serve an optimized copy: automatic format and quality, capped at 1200px wide.
    delivery = info["secure_url"].replace("/image/upload/", "/image/upload/f_auto,q_auto,w_1200,c_limit/", 1)
    return {"url": delivery, "public_id": info.get("public_id", "")}


@app.post("/api/pets", response_model=Pet, status_code=201, dependencies=[Depends(require_admin)])
def create_pet(data: PetIn, session: Session = Depends(get_session)):
    fields = pet_fields(data)
    status = fields.pop("status")
    pet = Pet(**fields)
    set_status(pet, status)
    session.add(pet)
    session.commit()
    session.refresh(pet)
    return pet


@app.put("/api/pets/{pet_id}", response_model=Pet, dependencies=[Depends(require_admin)])
def update_pet(pet_id: int, data: PetIn, session: Session = Depends(get_session)):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(404, "Pet not found")
    fields = pet_fields(data)
    status = fields.pop("status")
    for k, v in fields.items():
        setattr(pet, k, v)
    set_status(pet, status)
    session.add(pet)
    session.commit()
    session.refresh(pet)
    return pet


@app.delete("/api/pets/{pet_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_pet(pet_id: int, session: Session = Depends(get_session)):
    pet = session.get(Pet, pet_id)
    if not pet:
        raise HTTPException(404, "Pet not found")
    for a in session.exec(select(Application).where(Application.pet_id == pet_id)).all():
        session.delete(a)
    session.delete(pet)
    session.commit()


@app.get("/api/applications", dependencies=[Depends(require_admin)])
def list_applications(session: Session = Depends(get_session)):
    rows = session.exec(select(Application).order_by(Application.created_at.desc(), Application.id.desc())).all()
    out = []
    for a in rows:
        pet = session.get(Pet, a.pet_id)
        out.append({**a.model_dump(), "pet_name": pet.name if pet else "(deleted)"})
    return out


@app.patch("/api/applications/{app_id}", dependencies=[Depends(require_admin)])
def update_application(
    app_id: int, data: StatusIn, background: BackgroundTasks, session: Session = Depends(get_session)
):
    if data.status not in {"pending", "approved", "rejected"}:
        raise HTTPException(400, "Invalid status")
    row = session.get(Application, app_id)
    if not row:
        raise HTTPException(404, "Application not found")
    previous = row.status
    row.status = data.status
    if previous != data.status:
        row.decided_at = utcnow() if data.status in {"approved", "rejected"} else None
    session.add(row)
    pet = session.get(Pet, row.pet_id)
    if pet:
        if data.status == "approved":
            set_status(pet, "adopted")
        elif data.status == "pending" and pet.status == "adopted":
            set_status(pet, "available")
        session.add(pet)
    session.commit()

    if previous != data.status and data.status in {"approved", "rejected"} and pet:
        subject, body, html_body = mailer.application_decision(
            centre_info(), row.applicant_name, pet.name, data.status == "approved", row.tracking_code,
            f"{SITE_URL}/track?code={row.tracking_code}", f"{SITE_URL}/pets",
        )
        background.add_task(mailer.send_email, row.email, subject, body, html_body)
    return {"ok": True}


@app.get("/api/volunteers", dependencies=[Depends(require_admin)])
def list_volunteers(session: Session = Depends(get_session)):
    return session.exec(select(Volunteer).order_by(Volunteer.created_at.desc(), Volunteer.id.desc())).all()


@app.patch("/api/volunteers/{vol_id}", dependencies=[Depends(require_admin)])
def update_volunteer(vol_id: int, data: StatusIn, session: Session = Depends(get_session)):
    if data.status not in {"new", "contacted"}:
        raise HTTPException(400, "Invalid status")
    row = session.get(Volunteer, vol_id)
    if not row:
        raise HTTPException(404, "Volunteer not found")
    row.status = data.status
    session.add(row)
    session.commit()
    return {"ok": True}


@app.get("/api/admin/dashboard", dependencies=[Depends(require_admin)])
def dashboard(session: Session = Depends(get_session)):
    now = utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pets = session.exec(select(Pet)).all()
    apps = session.exec(select(Application)).all()
    volunteers = session.exec(select(Volunteer)).all()

    adopted = [p for p in pets if p.adopted_at]
    stays = [
        max((aware(p.adopted_at) - aware(p.created_at)).total_seconds() / 86400, 0) for p in adopted
    ]

    months, y, m = [], now.year, now.month
    for _ in range(6):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()
    per_month = Counter((aware(p.adopted_at).year, aware(p.adopted_at).month) for p in adopted)

    waiting = sorted((p for p in pets if p.status == "available"), key=lambda p: aware(p.created_at))[:3]
    return {
        "pets": {s: sum(p.status == s for p in pets) for s in ("available", "pending", "adopted")} | {"total": len(pets)},
        "applications": {
            "pending": sum(a.status == "pending" for a in apps),
            "approved": sum(a.status == "approved" for a in apps),
            "rejected": sum(a.status == "rejected" for a in apps),
            "this_month": sum(aware(a.created_at) >= month_start for a in apps),
        },
        "adoptions_this_month": sum(aware(p.adopted_at) >= month_start for p in adopted),
        "avg_days_to_adopt": round(sum(stays) / len(stays), 1) if stays else None,
        "by_species": dict(Counter(p.species for p in pets if p.status != "adopted")),
        "monthly_adoptions": [
            {"month": f"{yy}-{mm:02d}", "label": calendar.month_abbr[mm], "count": per_month.get((yy, mm), 0)}
            for yy, mm in months
        ],
        "longest_waiting": [
            {"id": p.id, "name": p.name, "species": p.species, "days": (now - aware(p.created_at)).days}
            for p in waiting
        ],
        "new_volunteers": sum(v.status == "new" for v in volunteers),
    }
