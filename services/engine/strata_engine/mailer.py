"""Mailer: the ONLY place real email may leave the machine (owner override, docs/NIGHT_BUILD.md).

- With SMTP configured (env SMTP_USER + SMTP_PASSWORD, e.g. Gmail + app password) mail is sent over STARTTLS in a
  background thread so requests never block.
- Without SMTP config (keyless demo), or for non-routable addresses (*.local, *.test, *.demo, example.*), mail is NOT
  sent: it is recorded in the in-app outbox and the engine log.
- Every mail is recorded in the state collection ``outbox`` as {to, subject, sent_via, at, status, error?, preview}.
  Codes are never stored in plain text: runs of 4+ digits are masked in the subject and preview.
- Secrets (SMTP password, codes, tokens) are never logged.

``auth.py`` imports this module; this module imports ``auth`` lazily (inside functions) to avoid a circular import.
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException

from . import state

router = APIRouter(tags=["mail"])
log = logging.getLogger("strata.mail")

OUTBOX = "outbox"
_BLOCKED_SUFFIXES = (".local", ".localhost", ".test", ".demo", ".invalid", ".example")
_DIGITS = re.compile(r"\d{4,}")

# E-mail clients do not support CSS variables, so templates carry their own tiny palette (kept here, in one place).
_EMAIL_TOKENS = {"ink": "#1f2a37", "muted": "#5b6675", "line": "#e3e7ec", "bg": "#f6f7f9", "card": "#ffffff",
                 "accent": "#1f5f8b"}
LEVEL_LABELS = {1: "Low", 2: "Moderate", 3: "Elevated", 4: "High", 5: "Critical"}


# ------------------------------------------------------------------ configuration
def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_USER", "").strip() and os.environ.get("SMTP_PASSWORD", "").strip())


def app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")


def deliverable(address: str) -> bool:
    """False for addresses that must never receive real mail (demo/test/example domains)."""
    addr = (address or "").strip().lower()
    if "@" not in addr:
        return False
    domain = addr.rsplit("@", 1)[1]
    if domain.endswith(_BLOCKED_SUFFIXES) or domain in ("localhost", "local", "test", "demo"):
        return False
    return not (domain.startswith("example.") or ".example." in domain)


def _mask(s: str) -> str:
    return _DIGITS.sub(lambda m: "•" * len(m.group(0)), s or "")


# ------------------------------------------------------------------ outbox
def _record(doc: dict[str, Any]) -> str:
    oid = f"m{time.time_ns()}"
    state.put(OUTBOX, oid, doc)
    return oid


def recent_outbox(limit: int = 50) -> list[dict[str, Any]]:
    with state._lock:
        rows = state._C.execute("select json from docs where collection=? order by rowid desc limit ?",
                                (OUTBOX, int(limit))).fetchall()
    return [json.loads(r[0]) for r in rows]


def _smtp_send(oid: str, doc: dict[str, Any], msg: EmailMessage) -> None:
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip() or "smtp.gmail.com"
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ctx) as s:
                s.login(user, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as s:
                s.ehlo()
                s.starttls(context=ctx)
                s.ehlo()
                s.login(user, password)
                s.send_message(msg)
        doc.update(status="sent", sent_at=state.wall_now())
        log.info("mail sent via smtp to=%s subject=%s", doc["to"], doc["subject"])
    except Exception as exc:  # noqa: BLE001 - record any failure; never include credentials
        code = getattr(exc, "smtp_code", None)
        doc.update(status="failed", error=f"{type(exc).__name__}{f' ({code})' if code else ''}")
        log.warning("mail to=%s failed: %s", doc["to"], doc["error"])
    state.put(OUTBOX, oid, doc)


def send_mail(to: str, subject: str, text: str, html: str | None = None) -> str:
    """Send (or record) one mail. Returns "smtp" if handed to SMTP, else "outbox". Never blocks on the network."""
    to = (to or "").strip()
    via = "smtp" if (smtp_configured() and deliverable(to)) else "outbox"
    doc: dict[str, Any] = {"to": to, "subject": _mask(subject), "sent_via": via, "at": state.wall_now(),
                           "status": "queued" if via == "smtp" else "recorded",
                           "preview": _mask(" ".join((text or "").split()))[:180]}
    oid = _record(doc)
    if via == "outbox":
        reason = "smtp not configured" if not smtp_configured() else "non-routable address"
        log.info("mail recorded in outbox (%s) to=%s subject=%s", reason, to, doc["subject"])
        return via
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USER", "").strip()
    msg = EmailMessage()
    msg["From"] = formataddr((os.environ.get("SMTP_FROM_NAME", "STRATA") or "STRATA", sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "")
    if html:
        msg.add_alternative(html, subtype="html")
    threading.Thread(target=_smtp_send, args=(oid, doc, msg), daemon=True, name="strata-mail").start()
    return via


# ------------------------------------------------------------------ templates (plain + minimal HTML)
def _layout(heading: str, body_html: str, footer: str = "You received this because of your STRATA account.") -> str:
    t = _EMAIL_TOKENS
    return (
        f'<!doctype html><html><body style="margin:0;padding:24px;background:{t["bg"]};'
        f'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:{t["ink"]};">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        f'<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;'
        f'background:{t["card"]};border:1px solid {t["line"]};border-radius:12px;">'
        f'<tr><td style="padding:24px 28px 8px;font-size:13px;letter-spacing:.12em;font-weight:700;color:{t["accent"]};">STRATA</td></tr>'
        f'<tr><td style="padding:4px 28px 0;font-size:20px;font-weight:600;">{html.escape(heading)}</td></tr>'
        f'<tr><td style="padding:12px 28px 24px;font-size:15px;line-height:1.55;">{body_html}</td></tr>'
        f'<tr><td style="padding:14px 28px;border-top:1px solid {t["line"]};font-size:12px;color:{t["muted"]};">'
        f'{html.escape(footer)}</td></tr></table></td></tr></table></body></html>'
    )


def _code_block(code: str) -> str:
    t = _EMAIL_TOKENS
    return (f'<div style="margin:16px 0;padding:14px 0;text-align:center;font-size:30px;font-weight:700;'
            f'letter-spacing:.35em;background:{t["bg"]};border-radius:8px;">{html.escape(code)}</div>')


_CODE_COPY = {
    "verify": ("Your STRATA verification code", "Confirm your email",
               "Use this code to finish creating your account."),
    "login": ("Your STRATA sign-in code", "Sign in to STRATA",
              "Use this code to sign in. No password needed."),
    "reset": ("Reset your STRATA password", "Reset your password",
              "Use this code to choose a new password."),
}


def code_mail(purpose: str, name: str, code: str, minutes: int = 10) -> tuple[str, str, str]:
    """(subject, text, html) for a one-time code. The code is never put in the subject."""
    subject, heading, line = _CODE_COPY[purpose]
    hello = f"Hi {name}," if name else "Hi,"
    tail = f"It expires in {minutes} minutes. If you did not ask for this, you can ignore this email."
    text = f"{hello}\n\n{line}\n\n    {code}\n\n{tail}\n\n- STRATA"
    t = _EMAIL_TOKENS
    body = (f"<p style=\"margin:0 0 8px\">{html.escape(hello)}</p><p style=\"margin:0\">{html.escape(line)}</p>"
            f"{_code_block(code)}<p style=\"margin:0;color:{t['muted']};font-size:13px\">{html.escape(tail)}</p>")
    return subject, text, _layout(heading, body)


def alert_mail(subject: str, body: str, *, level: int | None = None, title: str | None = None,
               deadline: str | None = None, link: str | None = None) -> tuple[str, str, str]:
    t = _EMAIL_TOKENS
    url = link if (link and link.startswith("http")) else app_url() + (link or "/app")
    lvl = f"Level {level} · {LEVEL_LABELS.get(int(level), '')}".rstrip(" ·") if level else None
    lines = [x for x in (lvl, title, body, f"Decide by: {deadline}" if deadline else None, f"Open: {url}") if x]
    text = "\n\n".join(lines) + "\n\n- STRATA (manage alerts in Settings)"
    parts = []
    if lvl:
        parts.append(f'<div style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;'
                     f'font-weight:600;background:{t["bg"]};border:1px solid {t["line"]};">{html.escape(lvl)}</div>')
    if title:
        parts.append(f'<p style="margin:12px 0 4px;font-weight:600">{html.escape(title)}</p>')
    parts.append(f'<p style="margin:8px 0">{html.escape(body)}</p>')
    if deadline:
        parts.append(f'<p style="margin:8px 0;color:{t["muted"]}">Decide by <strong>{html.escape(deadline)}</strong></p>')
    parts.append(f'<p style="margin:18px 0 0"><a href="{html.escape(url, quote=True)}" style="display:inline-block;'
                 f'padding:10px 18px;border-radius:8px;background:{t["accent"]};color:{t["card"]};'
                 f'text-decoration:none;font-weight:600">Open in STRATA</a></p>')
    return subject, text, _layout(title or subject, "".join(parts),
                                  footer="You get this because email alerts are on. Turn them off in Settings.")


# ------------------------------------------------------------------ notifications (used by agentic)
def notify(company_id: str, roles: list[str] | None, subject: str, body: str, *, min_pref: str = "email_alerts",
           level: int | None = None, title: str | None = None, deadline: str | None = None,
           link: str | None = None) -> int:
    """Email verified members of ``company_id`` whose role is in ``roles`` (None/empty = all roles) and whose pref
    ``min_pref`` is on (default on). Returns how many mails were sent or recorded."""
    from . import auth  # lazy: auth imports mailer

    n = 0
    for u in auth.company_members(company_id, verified_only=True):
        if roles and u["role"] not in roles:
            continue
        if min_pref and not u["prefs"].get(min_pref, True):
            continue
        s, text, html_ = alert_mail(subject, body, level=level, title=title, deadline=deadline, link=link)
        send_mail(u["email"], s, text, html_)
        n += 1
    return n


# ------------------------------------------------------------------ API
def _user(authorization: str | None = Header(None)) -> dict[str, Any]:
    from .auth import current_user  # lazy: auth imports mailer
    return current_user(authorization)


@router.get("/mail/outbox")
def outbox(user: dict[str, Any] = Depends(_user)) -> list[dict[str, Any]]:
    if user["role"] != "business_head":
        raise HTTPException(403, "Only the Business Head can see the outbox.")
    from . import auth
    mine = {m["email"] for m in auth.company_members(user["company_id"])}  # only mail to this company's members
    keep = ("to", "subject", "sent_via", "at", "status", "error", "preview")
    return [{k: d[k] for k in keep if k in d} for d in recent_outbox(500) if d.get("to", "").lower() in mine][:50]
