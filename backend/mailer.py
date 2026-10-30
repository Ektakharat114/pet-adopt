"""Outgoing email over SMTP.

Until SMTP_HOST and SMTP_FROM are set, send_email() does nothing (it only logs), so the
site works fine without email. Failures are logged and never break a request.
"""
import html
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

log = logging.getLogger("petadopt.mail")


def _settings() -> dict:
    return {
        "host": os.getenv("SMTP_HOST", ""),
        "port": int(os.getenv("SMTP_PORT", "587") or 587),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_addr": os.getenv("SMTP_FROM", ""),
        "security": os.getenv("SMTP_SECURITY", "starttls").lower(),  # starttls | ssl | none
    }


def is_configured() -> bool:
    cfg = _settings()
    return bool(cfg["host"] and cfg["from_addr"])


def _one_line(value: str) -> str:
    return " ".join(str(value).split())


def send_email(to: str, subject: str, text: str, html_body: Optional[str] = None) -> bool:
    cfg = _settings()
    if not (cfg["host"] and cfg["from_addr"]):
        log.info("Email skipped (SMTP not configured): %r to %s", subject, to)
        return False
    try:
        msg = EmailMessage()
        msg["From"] = cfg["from_addr"]
        msg["To"] = to
        msg["Subject"] = _one_line(subject)
        msg.set_content(text)
        if html_body:
            msg.add_alternative(html_body, subtype="html")
        context = ssl.create_default_context()
        if cfg["security"] == "ssl":
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15, context=context)
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
        with server:
            if cfg["security"] == "starttls":
                server.starttls(context=context)
            if cfg["user"]:
                server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        return True
    except Exception as exc:  # never let a mail problem break a request
        log.warning("Could not send email %r to %s: %s", subject, to, exc)
        return False


# ---------- message templates: each returns (subject, text, html) ----------
def _page(centre_name: str, heading: str, paragraphs: list[str], button: Optional[tuple[str, str]] = None) -> str:
    body = "".join(
        f'<p style="margin:0 0 14px;line-height:1.55">{html.escape(p)}</p>' for p in paragraphs
    )
    cta = ""
    if button:
        label, url = button
        cta = (
            f'<p style="margin:22px 0"><a href="{html.escape(url, quote=True)}" '
            'style="background:#e2682b;color:#fff;text-decoration:none;font-weight:600;'
            f'padding:11px 20px;border-radius:10px;display:inline-block">{html.escape(label)}</a></p>'
        )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#2b2118;max-width:560px;margin:0 auto;padding:24px">'
        f'<h2 style="margin:0 0 16px;font-family:Georgia,serif">{html.escape(heading)}</h2>'
        f"{body}{cta}"
        f'<p style="margin:26px 0 0;color:#7a6a5c;font-size:13px">{html.escape(centre_name)}</p></div>'
    )


def _contact_lines(centre: dict) -> list[str]:
    lines = []
    if centre.get("phone"):
        lines.append(f"Phone: {centre['phone']}")
    if centre.get("email"):
        lines.append(f"Email: {centre['email']}")
    return lines


def application_received(centre: dict, name: str, pet: str, code: str, track_url: str):
    subject = f"We received your application for {pet}"
    paras = [
        f"Hi {name},",
        f"Thank you for applying to adopt {pet}. Our team will review your application and get in touch.",
        f"Your tracking code is {code}. You can use it with your email address to check your application's status at any time.",
    ]
    text = "\n\n".join(paras + [f"Track your application: {track_url}"] + _contact_lines(centre) + [centre["name"]])
    return subject, text, _page(centre["name"], "Application received", paras, ("Track your application", track_url))


def application_decision(centre: dict, name: str, pet: str, approved: bool, code: str, track_url: str, browse_url: str):
    if approved:
        subject = f"Good news about {pet}"
        paras = [
            f"Hi {name},",
            f"Your application to adopt {pet} has been approved. Our team will contact you shortly to arrange a meeting and the adoption paperwork.",
            f"Your tracking code is {code}.",
        ]
        button = ("View your application", track_url)
    else:
        subject = f"Your application for {pet}"
        paras = [
            f"Hi {name},",
            f"Thank you for applying to adopt {pet}. After careful review, we are not able to move forward with this application. This is not a reflection on you, and many other animals are still waiting for a home.",
            "You are welcome to browse our available pets and apply again.",
        ]
        button = ("Meet our pets", browse_url)
    text = "\n\n".join(paras + [f"{button[0]}: {button[1]}"] + _contact_lines(centre) + [centre["name"]])
    return subject, text, _page(centre["name"], subject, paras, button)


def staff_new_application(centre_name: str, applicant: str, email: str, phone: str, pet: str, message: str):
    subject = f"New adoption application for {pet}"
    lines = [
        f"{applicant} applied to adopt {pet}.",
        f"Email: {email}",
        f"Phone: {phone}",
        f"Message: {message or '(none)'}",
        "Review it in the staff dashboard.",
    ]
    return subject, "\n".join(lines), _page(centre_name, subject, lines)


def volunteer_thanks(centre: dict, name: str):
    subject = f"Thanks for offering to volunteer at {centre['name']}"
    paras = [
        f"Hi {name},",
        "Thank you for offering your time. A member of our team will get in touch about next steps.",
    ]
    text = "\n\n".join(paras + _contact_lines(centre) + [centre["name"]])
    return subject, text, _page(centre["name"], "Thank you for volunteering", paras)


def staff_new_volunteer(centre_name: str, name: str, email: str, phone: str, interests: list[str]):
    subject = f"New volunteer sign-up: {name}"
    lines = [
        f"{name} would like to volunteer.",
        f"Email: {email}",
        f"Phone: {phone}",
        f"Interested in: {', '.join(interests) or '(not specified)'}",
        "See the Volunteers tab in the staff dashboard.",
    ]
    return subject, "\n".join(lines), _page(centre_name, subject, lines)
