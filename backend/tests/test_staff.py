"""Staff features: login, pets and photos, volunteers, dashboard, uploads."""
from unittest.mock import AsyncMock

import httpx
import pytest

import main
from conftest import apply_payload

HTTPS = "https://res.cloudinary.com/demo/image/upload/v1/"


# ---------- login and protection ----------
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/applications"),
        ("patch", "/api/applications/1"),
        ("get", "/api/volunteers"),
        ("patch", "/api/volunteers/1"),
        ("get", "/api/admin/dashboard"),
        ("post", "/api/pets"),
        ("put", "/api/pets/1"),
        ("delete", "/api/pets/1"),
        ("post", "/api/uploads"),
    ],
)
def test_staff_routes_need_login(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_wrong_password_and_login_rate_limit(client):
    for _ in range(8):
        assert client.post("/api/admin/login", json={"password": "nope"}).status_code == 401
    # After 8 failures even the right password is held back for a while
    assert client.post("/api/admin/login", json={"password": "admin123"}).status_code == 429


# ---------- pets and photos ----------
def pet_body(**kw):
    body = {"name": "Rocky", "species": "dog", "breed": "Pug", "age_years": 3, "size": "small"}
    body.update(kw)
    return body


def test_create_update_delete_pet(client, admin):
    r = client.post("/api/pets", json=pet_body(energy_level="low", special_needs="Needs a quiet home"), headers=admin)
    assert r.status_code == 201
    pet = r.json()
    assert pet["energy_level"] == "low" and pet["special_needs"] == "Needs a quiet home"
    up = client.put(f"/api/pets/{pet['id']}", json=pet_body(age_years=4), headers=admin).json()
    assert up["age_years"] == 4
    assert client.delete(f"/api/pets/{pet['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/pets/{pet['id']}").status_code == 404


def test_cover_photo_is_always_the_first_of_the_gallery(client, admin):
    a, b, c = (HTTPS + n for n in ("a.jpg", "b.jpg", "c.jpg"))
    pet = client.post("/api/pets", json=pet_body(image_url=b, photos=[a, b, c, a]), headers=admin).json()
    assert pet["image_url"] == b
    assert pet["photos"] == [b, a, c]  # cover first, duplicates removed


def test_gallery_without_cover_uses_first_photo_as_cover(client, admin):
    a, b = HTTPS + "a.jpg", HTTPS + "b.jpg"
    pet = client.post("/api/pets", json=pet_body(photos=[a, b]), headers=admin).json()
    assert pet["image_url"] == a


def test_removing_all_photos_clears_the_cover(client, admin):
    a = HTTPS + "a.jpg"
    pet = client.post("/api/pets", json=pet_body(photos=[a]), headers=admin).json()
    cleared = client.put(f"/api/pets/{pet['id']}", json=pet_body(), headers=admin).json()
    assert cleared["image_url"] == "" and cleared["photos"] == []


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x.example/a.jpg"])
def test_only_web_links_are_accepted_as_photos(client, admin, bad):
    assert client.post("/api/pets", json=pet_body(image_url=bad), headers=admin).status_code == 422
    assert client.post("/api/pets", json=pet_body(photos=[bad]), headers=admin).status_code == 422


def test_gallery_is_capped(client, admin):
    photos = [f"{HTTPS}{i}.jpg" for i in range(main.MAX_PHOTOS + 1)]
    assert client.post("/api/pets", json=pet_body(photos=photos), headers=admin).status_code == 422


def test_pet_field_validation(client, admin):
    assert client.post("/api/pets", json=pet_body(species="dragon"), headers=admin).status_code == 422
    assert client.post("/api/pets", json=pet_body(energy_level="extreme"), headers=admin).status_code == 422
    assert client.post("/api/pets", json=pet_body(age_years=-1), headers=admin).status_code == 422


def test_adoption_date_follows_the_status(client, admin):
    pet = client.post("/api/pets", json=pet_body(status="adopted"), headers=admin).json()
    assert pet["adopted_at"]
    back = client.put(f"/api/pets/{pet['id']}", json=pet_body(status="available"), headers=admin).json()
    assert back["adopted_at"] is None


def test_deleting_a_pet_removes_its_applications(client, admin):
    client.post("/api/applications", json=apply_payload())
    client.delete("/api/pets/2", headers=admin)
    assert client.get("/api/applications", headers=admin).json() == []


# ---------- volunteers ----------
def volunteer_body(**kw):
    body = {"name": "Ravi Kumar", "email": "ravi@example.com", "phone": "9876543210",
            "interests": ["Dog walking", "Events"], "availability": "Weekends"}
    body.update(kw)
    return body


def test_volunteer_signup_flow(client, admin, outbox, monkeypatch):
    monkeypatch.setenv("STAFF_NOTIFY_EMAIL", "team@shelter.example")
    assert client.post("/api/volunteers", json=volunteer_body()).status_code == 201
    assert sorted(m["to"] for m in outbox) == ["ravi@example.com", "team@shelter.example"]
    rows = client.get("/api/volunteers", headers=admin).json()
    assert rows[0]["name"] == "Ravi Kumar" and rows[0]["status"] == "new"
    assert rows[0]["interests"] == ["Dog walking", "Events"]
    assert client.patch(f"/api/volunteers/{rows[0]['id']}", json={"status": "contacted"}, headers=admin).status_code == 200
    assert client.get("/api/volunteers", headers=admin).json()[0]["status"] == "contacted"


def test_volunteer_validation_honeypot_and_status(client, admin, outbox):
    assert client.post("/api/volunteers", json=volunteer_body(email="bad", phone="1")).status_code == 422
    assert client.post("/api/volunteers", json=volunteer_body(website="http://spam.example")).status_code == 201
    assert client.get("/api/volunteers", headers=admin).json() == []
    assert outbox == []
    client.post("/api/volunteers", json=volunteer_body())
    assert client.patch("/api/volunteers/1", json={"status": "archived"}, headers=admin).status_code == 400
    assert client.patch("/api/volunteers/99", json={"status": "new"}, headers=admin).status_code == 404


def test_volunteer_signups_are_rate_limited(client):
    for i in range(5):
        assert client.post("/api/volunteers", json=volunteer_body(email=f"v{i}@example.com")).status_code == 201
    assert client.post("/api/volunteers", json=volunteer_body(email="v9@example.com")).status_code == 429


# ---------- dashboard ----------
def test_dashboard_numbers(client, admin):
    client.post("/api/applications", json=apply_payload())
    client.post("/api/applications", json=apply_payload(pet_id=1, email="b@example.com"))
    client.post("/api/applications", json=apply_payload(pet_id=3, email="c@example.com"))
    client.patch("/api/applications/1", json={"status": "approved"}, headers=admin)
    client.patch("/api/applications/2", json={"status": "rejected"}, headers=admin)
    client.post("/api/volunteers", json=volunteer_body())

    d = client.get("/api/admin/dashboard", headers=admin).json()
    assert d["pets"] == {"available": 6, "pending": 1, "adopted": 1, "total": 8}
    assert d["applications"] == {"pending": 1, "approved": 1, "rejected": 1, "this_month": 3}
    assert d["adoptions_this_month"] == 1
    assert d["avg_days_to_adopt"] is not None and d["avg_days_to_adopt"] < 1
    assert d["new_volunteers"] == 1
    # Luna (a cat) was adopted, so only Whiskers is left among the cats; all four dogs are still waiting
    assert d["by_species"]["dog"] == 4 and d["by_species"]["cat"] == 1
    assert len(d["monthly_adoptions"]) == 6 and d["monthly_adoptions"][-1]["count"] == 1
    assert len(d["longest_waiting"]) == 3


def test_dashboard_with_no_adoptions_has_no_average(client, admin):
    d = client.get("/api/admin/dashboard", headers=admin).json()
    assert d["avg_days_to_adopt"] is None and d["adoptions_this_month"] == 0


# ---------- Cloudinary uploads ----------
def test_signature_matches_cloudinary_documentation():
    sig = main.cloudinary_signature(
        {"eager": "w_400,h_300,c_pad|w_260,h_200,c_crop", "public_id": "sample_image", "timestamp": "1315060510"}, "abcd"
    )
    assert sig == "bfd09f95f331f558cbd1320e67aa8d488770583e"


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


class FakeResponse:
    def __init__(self, status=200, body=None):
        self.status_code, self._body, self.text = status, body or {}, str(body)

    def json(self):
        return self._body


@pytest.fixture
def cloudinary(monkeypatch):
    monkeypatch.setattr(main, "CLOUDINARY_CLOUD_NAME", "democloud")
    monkeypatch.setattr(main, "CLOUDINARY_API_KEY", "key123")
    monkeypatch.setattr(main, "CLOUDINARY_API_SECRET", "secret456")


def upload(client, admin, name="a.jpg", data=JPEG, ctype="image/jpeg"):
    return client.post("/api/uploads", files={"file": (name, data, ctype)}, headers=admin)


def test_upload_not_configured_gives_helpful_message(client, admin):
    r = upload(client, admin)
    assert r.status_code == 503 and "CLOUDINARY_CLOUD_NAME" in r.json()["detail"]


def test_upload_rejects_wrong_type_fake_image_and_big_file(client, admin, cloudinary):
    assert upload(client, admin, "a.gif", b"GIF89a" + b"0" * 50, "image/gif").status_code == 400
    assert upload(client, admin, "a.png", b"plain text", "image/png").status_code == 400
    assert upload(client, admin, "big.jpg", JPEG + b"0" * main.MAX_UPLOAD_BYTES).status_code == 413


def test_upload_success_signs_request_and_hides_secret(client, admin, cloudinary, monkeypatch):
    ok = FakeResponse(200, {"secure_url": "https://res.cloudinary.com/democloud/image/upload/v1/pets/abc.jpg",
                            "public_id": "pets/abc"})
    post = AsyncMock(return_value=ok)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    r = upload(client, admin)
    assert r.status_code == 200
    assert r.json()["url"] == "https://res.cloudinary.com/democloud/image/upload/f_auto,q_auto,w_1200,c_limit/v1/pets/abc.jpg"
    args, kwargs = post.call_args
    assert args[0] == "https://api.cloudinary.com/v1_1/democloud/image/upload"
    sent = kwargs["data"]
    assert sent["signature"] == main.cloudinary_signature({"folder": sent["folder"], "timestamp": sent["timestamp"]}, "secret456")
    assert "secret456" not in str(kwargs)


def test_upload_failures_become_502_without_leaking_secrets(client, admin, cloudinary, monkeypatch):
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=FakeResponse(401, {"error": "Invalid Signature"})))
    r = upload(client, admin)
    assert r.status_code == 502 and "secret456" not in r.text
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(side_effect=httpx.ConnectError("boom")))
    assert upload(client, admin).status_code == 502
