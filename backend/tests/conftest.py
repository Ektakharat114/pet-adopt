"""Shared test setup: a throw-away database and no real email, uploads or secrets."""
import os
import sys
import tempfile
from pathlib import Path

# Settings must be in place before `main` is imported. Empty strings (rather than removing the
# variables) also stop python-dotenv from filling them in from a developer's real .env file.
_db_file = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(
    DATABASE_URL=f"sqlite:///{_db_file}",
    SITE_URL="https://shelter.example",
    ADMIN_PASSWORD="admin123",
    SMTP_HOST="",
    SMTP_FROM="",
    STAFF_NOTIFY_EMAIL="",
    CLOUDINARY_CLOUD_NAME="",
    CLOUDINARY_API_KEY="",
    CLOUDINARY_API_SECRET="",
    CENTRE_NAME="Test Shelter",
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import main  # noqa: E402


@pytest.fixture
def client():
    """A fresh, seeded database and clean limits for every test."""
    SQLModel.metadata.drop_all(main.engine)
    main.admin_tokens.clear()
    main.limiter.reset()
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def admin(client):
    token = client.post("/api/admin/login", json={"password": "admin123"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""
    sent = []

    def fake_send(to, subject, text, html_body=None):
        sent.append({"to": to, "subject": subject, "text": text, "html": html_body})
        return True

    monkeypatch.setattr(main.mailer, "send_email", fake_send)
    return sent


def apply_payload(**overrides):
    data = {
        "pet_id": 2,
        "applicant_name": "Asha Verma",
        "email": "asha@example.com",
        "phone": "9820012345",
        "address": "Mumbai",
        "message": "I would love to adopt.",
    }
    data.update(overrides)
    return data
