"""Adoption applications: submitting, spam protection, tracking, staff decisions, emails."""
import re

import main
from conftest import apply_payload


def test_submit_returns_tracking_code_and_emails_applicant(client, outbox):
    r = client.post("/api/applications", json=apply_payload())
    assert r.status_code == 201
    code = r.json()["tracking_code"]
    assert re.fullmatch(r"PH-[A-Z2-9]{6}", code)
    assert r.json()["email_enabled"] is False  # no SMTP settings in tests, so the site must not promise an email
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "asha@example.com"
    assert "Luna" in mail["subject"]
    assert code in mail["text"]
    assert f"https://shelter.example/track?code={code}" in mail["text"]


def test_staff_are_notified_when_an_address_is_configured(client, outbox, monkeypatch):
    monkeypatch.setenv("STAFF_NOTIFY_EMAIL", "team@shelter.example")
    client.post("/api/applications", json=apply_payload())
    assert sorted(m["to"] for m in outbox) == ["asha@example.com", "team@shelter.example"]


def test_invalid_details_are_rejected(client):
    bad = apply_payload(applicant_name="A", email="not-an-email", phone="1")
    r = client.post("/api/applications", json=bad)
    assert r.status_code == 422
    assert len(r.json()["detail"]) == 3


def test_unknown_or_adopted_pet(client, admin):
    assert client.post("/api/applications", json=apply_payload(pet_id=999)).status_code == 404
    client.post("/api/applications", json=apply_payload())
    client.patch("/api/applications/1", json={"status": "approved"}, headers=admin)
    late = client.post("/api/applications", json=apply_payload(email="late@example.com"))
    assert late.status_code == 400


def test_honeypot_looks_like_success_but_saves_nothing(client, admin, outbox):
    r = client.post("/api/applications", json=apply_payload(website="http://spam.example"))
    assert r.status_code == 201
    assert client.get("/api/applications", headers=admin).json() == []
    assert outbox == []


def test_form_filled_in_too_fast_is_refused_but_normal_speed_passes(client):
    assert client.post("/api/applications", json=apply_payload(fill_time_ms=800)).status_code == 429
    assert client.post("/api/applications", json=apply_payload(fill_time_ms=45000)).status_code == 201


def test_same_person_cannot_apply_twice_for_the_same_pet(client):
    assert client.post("/api/applications", json=apply_payload()).status_code == 201
    again = client.post("/api/applications", json=apply_payload(email="ASHA@example.com"))
    assert again.status_code == 409
    assert "already applied" in again.json()["detail"]
    # a different pet is fine
    assert client.post("/api/applications", json=apply_payload(pet_id=1)).status_code == 201


def test_applications_are_rate_limited_per_address(client):
    for i in range(5):
        r = client.post("/api/applications", json=apply_payload(pet_id=1 + i, email=f"p{i}@example.com"))
        assert r.status_code == 201
    sixth = client.post("/api/applications", json=apply_payload(pet_id=6, email="p6@example.com"))
    assert sixth.status_code == 429


# ---------- tracking ----------
def test_track_with_code_and_email(client):
    code = client.post("/api/applications", json=apply_payload()).json()["tracking_code"]
    r = client.post("/api/applications/track", json={"code": code.lower(), "email": " Asha@Example.com "})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pending"
    assert body["pet_name"] == "Luna"
    assert body["decided_at"] is None


def test_track_does_not_reveal_whether_the_code_exists(client):
    code = client.post("/api/applications", json=apply_payload()).json()["tracking_code"]
    wrong_email = client.post("/api/applications/track", json={"code": code, "email": "other@example.com"})
    wrong_code = client.post("/api/applications/track", json={"code": "PH-AAAAAA", "email": "asha@example.com"})
    assert wrong_email.status_code == wrong_code.status_code == 404
    assert wrong_email.json() == wrong_code.json()


def test_track_attempts_are_rate_limited(client):
    for _ in range(10):
        assert client.post("/api/applications/track", json={"code": "PH-AAAAAA", "email": "a@b.co"}).status_code == 404
    assert client.post("/api/applications/track", json={"code": "PH-AAAAAA", "email": "a@b.co"}).status_code == 429


# ---------- staff decisions ----------
def test_approving_marks_pet_adopted_and_emails_the_applicant(client, admin, outbox):
    code = client.post("/api/applications", json=apply_payload()).json()["tracking_code"]
    outbox.clear()
    assert client.patch("/api/applications/1", json={"status": "approved"}, headers=admin).status_code == 200
    pet = client.get("/api/pets/2").json()
    assert pet["status"] == "adopted" and pet["adopted_at"]
    assert len(outbox) == 1
    assert outbox[0]["to"] == "asha@example.com"
    assert "approved" in outbox[0]["text"]
    tracked = client.post("/api/applications/track", json={"code": code, "email": "asha@example.com"}).json()
    assert tracked["status"] == "approved" and tracked["decided_at"]


def test_rejecting_sends_a_kind_email_and_keeps_pet_available(client, admin, outbox):
    client.post("/api/applications", json=apply_payload())
    outbox.clear()
    client.patch("/api/applications/1", json={"status": "rejected"}, headers=admin)
    assert client.get("/api/pets/2").json()["status"] == "available"
    assert len(outbox) == 1 and "not able to move forward" in outbox[0]["text"]


def test_undoing_a_decision_reopens_the_pet_without_emailing(client, admin, outbox):
    client.post("/api/applications", json=apply_payload())
    client.patch("/api/applications/1", json={"status": "approved"}, headers=admin)
    outbox.clear()
    client.patch("/api/applications/1", json={"status": "pending"}, headers=admin)
    pet = client.get("/api/pets/2").json()
    assert pet["status"] == "available" and pet["adopted_at"] is None
    assert outbox == []


def test_setting_the_same_status_twice_sends_one_email(client, admin, outbox):
    client.post("/api/applications", json=apply_payload())
    outbox.clear()
    for _ in range(2):
        client.patch("/api/applications/1", json={"status": "approved"}, headers=admin)
    assert len(outbox) == 1


def test_invalid_status_and_missing_application(client, admin):
    client.post("/api/applications", json=apply_payload())
    assert client.patch("/api/applications/1", json={"status": "maybe"}, headers=admin).status_code == 400
    assert client.patch("/api/applications/99", json={"status": "approved"}, headers=admin).status_code == 404


def test_staff_list_shows_tracking_code_and_pet_name(client, admin):
    client.post("/api/applications", json=apply_payload())
    row = client.get("/api/applications", headers=admin).json()[0]
    assert row["pet_name"] == "Luna"
    assert row["tracking_code"].startswith("PH-")


def test_an_email_failure_never_breaks_the_request(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("smtp down")

    # send_email swallows its own errors; simulate the SMTP layer failing underneath it
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_FROM", "x@shelter.example")
    monkeypatch.setattr(main.mailer.smtplib, "SMTP", boom)
    assert client.post("/api/applications", json=apply_payload()).status_code == 201
