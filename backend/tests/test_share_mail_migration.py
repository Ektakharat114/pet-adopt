"""Share previews, sitemap, email sending and upgrading an older database."""
import sqlite3
from email import message_from_bytes

from sqlalchemy import create_engine, inspect
from sqlmodel import Session

import mailer
import main


# ---------- share preview ----------
def test_share_page_has_preview_tags_and_redirects_people(client, admin):
    pet = client.post("/api/pets", json={
        "name": "Rocky", "species": "dog", "breed": "Pug", "description": "A snorer & a cuddler.",
        "photos": ["https://res.cloudinary.com/demo/image/upload/rocky.jpg"],
    }, headers=admin).json()
    page = client.get(f"/share/pets/{pet['id']}")
    assert page.status_code == 200
    html = page.text
    assert 'property="og:title" content="Meet Rocky, a Pug looking for a home | Test Shelter"' in html
    assert 'property="og:image" content="https://res.cloudinary.com/demo/image/upload/rocky.jpg"' in html
    assert f"https://shelter.example/pets/{pet['id']}" in html
    assert "A snorer &amp; a cuddler." in html
    assert 'http-equiv="refresh"' in html


def test_share_page_escapes_hostile_names(client, admin):
    pet = client.post("/api/pets", json={"name": '"><script>alert(1)</script>', "species": "cat"}, headers=admin).json()
    html = client.get(f"/share/pets/{pet['id']}").text
    assert "<script>" not in html


def test_share_page_for_missing_pet(client):
    assert client.get("/share/pets/999").status_code == 404


def test_sitemap_lists_open_pets_only(client, admin):
    client.post("/api/applications", json={"pet_id": 2, "applicant_name": "Asha Verma", "email": "a@example.com", "phone": "9820012345"})
    client.patch("/api/applications/1", json={"status": "approved"}, headers=admin)
    r = client.get("/sitemap.xml")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/xml")
    assert "https://shelter.example/pets/1<" in r.text
    assert "https://shelter.example/pets/2<" not in r.text  # Luna was adopted
    assert "https://shelter.example/support<" in r.text


# ---------- email sending ----------
def test_email_is_skipped_quietly_when_smtp_is_not_configured():
    assert mailer.is_configured() is False
    assert mailer.send_email("a@b.co", "Hi", "text") is False


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.calls, self.sent = host, port, [], []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def send_message(self, msg):
        self.sent.append(msg)


def test_email_goes_out_over_starttls_with_login_and_a_clean_subject(monkeypatch):
    FakeSMTP.instances.clear()
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "Test Shelter <hello@shelter.example>")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "pw")
    assert mailer.send_email("asha@example.com", "Hello\r\nBcc: evil@example.com", "Body", "<p>Body</p>") is True
    server = FakeSMTP.instances[0]
    assert (server.host, server.port) == ("smtp.example.com", 587)
    assert server.calls == ["starttls", ("login", "mailer", "pw")]
    msg = server.sent[0]
    assert msg["To"] == "asha@example.com"
    assert msg["Subject"] == "Hello Bcc: evil@example.com"  # one line, no injected header
    assert msg["Bcc"] is None
    assert message_from_bytes(msg.as_bytes()).is_multipart()


def test_email_templates_escape_user_supplied_html():
    centre = {"name": "Test Shelter", "email": "", "phone": ""}
    _, _, html = mailer.application_received(centre, "<b>Eve</b>", "Luna", "PH-ABC234", "https://x.example/track")
    assert "<b>Eve</b>" not in html and "&lt;b&gt;Eve&lt;/b&gt;" in html


# ---------- upgrading an older database ----------
def test_old_database_is_upgraded_in_place(tmp_path):
    path = tmp_path / "old.db"
    raw = sqlite3.connect(path)
    raw.executescript(
        """
        CREATE TABLE pet (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, species VARCHAR NOT NULL,
            breed VARCHAR, age_years FLOAT, gender VARCHAR, size VARCHAR, description VARCHAR,
            image_url VARCHAR, good_with_kids BOOLEAN, vaccinated BOOLEAN, status VARCHAR, created_at DATETIME);
        CREATE TABLE application (id INTEGER PRIMARY KEY, pet_id INTEGER, applicant_name VARCHAR, email VARCHAR,
            phone VARCHAR, address VARCHAR, has_other_pets BOOLEAN, message VARCHAR, status VARCHAR, created_at DATETIME);
        INSERT INTO pet VALUES (1,'Old Buddy','dog','Lab',3.0,'male','large','Good boy','',1,1,'available','2026-01-01 00:00:00');
        INSERT INTO application VALUES (1,1,'Asha','asha@example.com','9820012345','','0','hi','pending','2026-01-02 00:00:00');
        """
    )
    raw.commit()
    raw.close()

    engine = create_engine(f"sqlite:///{path}")
    main.SQLModel.metadata.create_all(engine)  # adds the new volunteer table only
    main.ensure_columns(engine)
    cols = {c["name"] for c in inspect(engine).get_columns("pet")}
    assert {"photos", "energy_level", "special_needs", "good_with_dogs", "good_with_cats", "adopted_at"} <= cols

    with Session(engine) as s:
        main.backfill_tracking_codes(s)
        pet = s.get(main.Pet, 1)
        assert pet.name == "Old Buddy" and pet.photos == [] and pet.energy_level == "medium"
        assert pet.good_with_dogs is True and pet.adopted_at is None
        row = s.get(main.Application, 1)
        assert row.tracking_code.startswith("PH-")
    main.ensure_columns(engine)  # running it again changes nothing
