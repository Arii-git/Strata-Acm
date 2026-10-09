"""Self-hosted email auth + company join codes (night build priorities #2 and #3).

Storage: tables in the existing sqlite state DB (``state._C`` under ``state._lock``):
  companies(id, name, industry, code UNIQUE, created_at)
  users(id, company_id, name, email UNIQUE lowercased, role, pw_hash, verified, prefs json, created_at)
  auth_codes(email, purpose, code_hash, expires_at, attempts)      -- one live code per (email, purpose)
  sessions(jti, user_id, created_at, revoked)

Passwords: stdlib ``hashlib.scrypt`` with a per-user salt; constant-time compare.
Tokens: stateless HMAC-SHA256 signed JSON ``{sub, jti, exp}`` (base64url), 7 days; logout revokes the jti.
Secret: env STRATA_AUTH_SECRET, else generated once and persisted to ``<STORE_DIR>/.auth_secret`` (git-ignored dir).
One-time codes: 6 digits, 10 minutes, 5 attempts, stored only as an HMAC.
Company join codes: 6 chars from A-Z/2-9 without 0/O/1/I; FIXED once assigned, never regenerated.

Reusable deps for other lanes: ``current_user`` (401 if missing/invalid), ``optional_user``, ``user_public``,
``company_members``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from . import mailer, state
from .config import ROLE_LABELS, ROOT, STORE_DIR

router = APIRouter(tags=["auth"])

ROLE_ORDER = ["business_head", "operations_manager", "account_manager", "sales_manager", "support_manager", "qa_head"]
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
CODE_RE = re.compile(rf"^[{CODE_ALPHABET}]{{6}}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_TTL = 7 * 24 * 3600
OTP_TTL = 10 * 60
OTP_ATTEMPTS = 5
OTP_COOLDOWN = 20  # seconds between two code requests for the same email + purpose
PW_MIN = 8
DEFAULT_PREFS = {"theme": "system", "email_alerts": True}
DEMO_FILE = ROOT / "config" / "demo_companies.yaml"
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}

SCHEMA = """
create table if not exists companies (id text primary key, name text not null, industry text, code text unique not null,
  created_at text);
create table if not exists users (id text primary key, company_id text not null, name text, email text unique not null,
  role text not null, pw_hash text, verified integer not null default 0, prefs text, created_at text);
create index if not exists users_company on users(company_id);
create table if not exists auth_codes (email text not null, purpose text not null, code_hash text not null,
  expires_at real not null, attempts integer not null default 0, primary key (email, purpose));
create table if not exists sessions (jti text primary key, user_id text not null, created_at text,
  revoked integer not null default 0);
"""


def _db():
    return state._C


with state._lock:
    _db().executescript(SCHEMA)
    _db().commit()


# ------------------------------------------------------------------ secret, hashing, tokens
def _load_secret() -> bytes:
    env = os.environ.get("STRATA_AUTH_SECRET", "").strip()
    if env:
        return env.encode()
    p = Path(STORE_DIR) / ".auth_secret"
    try:
        if p.exists() and p.read_text(encoding="utf-8").strip():
            return p.read_text(encoding="utf-8").strip().encode()
        p.parent.mkdir(parents=True, exist_ok=True)
        s = secrets.token_urlsafe(48)
        p.write_text(s, encoding="utf-8")
        return s.encode()
    except OSError:  # read-only store: fall back to a per-process secret (tokens die on restart)
        return secrets.token_bytes(48)


_SECRET = _load_secret()


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64e(salt)}${_b64e(dk)}"


def verify_password(pw: str, stored: str | None) -> bool:
    try:
        algo, n, r, p, salt, dk = (stored or "").split("$")
        if algo != "scrypt":
            return False
        got = hashlib.scrypt(pw.encode(), salt=_b64d(salt), n=int(n), r=int(r), p=int(p), dklen=len(_b64d(dk)))
        return hmac.compare_digest(got, _b64d(dk))
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_password(secrets.token_urlsafe(12))  # equalises timing for unknown emails


def issue_token(user_id: str) -> str:
    jti = secrets.token_urlsafe(16)
    payload = {"sub": user_id, "jti": jti, "exp": int(time.time()) + TOKEN_TTL}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64e(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())
    with state._lock:
        _db().execute("insert into sessions (jti, user_id, created_at, revoked) values (?,?,?,0)",
                      (jti, user_id, state.wall_now()))
        _db().commit()
    return f"{body}.{sig}"


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        body, sig = token.split(".")
        want = _b64e(hmac.new(_SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, want):
            return None
        payload = json.loads(_b64d(body))
        if int(payload.get("exp", 0)) < time.time():
            return None
        with state._lock:
            r = _db().execute("select revoked from sessions where jti=?", (payload.get("jti"),)).fetchone()
        if r is not None and r[0]:
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _code_hash(email: str, purpose: str, code: str) -> str:
    return hmac.new(_SECRET, f"{purpose}|{email}|{code}".encode(), hashlib.sha256).hexdigest()


# ------------------------------------------------------------------ rows
def _company(cid: str) -> dict[str, Any] | None:
    with state._lock:
        r = _db().execute("select * from companies where id=?", (cid,)).fetchone()
    return dict(r) if r else None


def company_by_code(code: str) -> dict[str, Any] | None:
    code = (code or "").strip().upper()
    if not CODE_RE.match(code):
        return None
    with state._lock:
        r = _db().execute("select * from companies where code=?", (code,)).fetchone()
    return dict(r) if r else None


def _user_by_email(email: str) -> dict[str, Any] | None:
    with state._lock:
        r = _db().execute("select * from users where email=?", (email,)).fetchone()
    return dict(r) if r else None


def _user_by_id(uid: str) -> dict[str, Any] | None:
    with state._lock:
        r = _db().execute("select * from users where id=?", (uid,)).fetchone()
    return dict(r) if r else None


def company_of_token(token: str) -> str | None:
    """Company id of a valid session token (used by tenancy.CompanyMiddleware), else None."""
    payload = decode_token(token)
    u = _user_by_id(str(payload.get("sub"))) if payload else None
    return str(u["company_id"]) if u else None


def _prefs(row: dict[str, Any]) -> dict[str, Any]:
    raw = row.get("prefs")
    try:
        p = raw if isinstance(raw, dict) else json.loads(raw or "{}")
    except (json.JSONDecodeError, TypeError):
        p = {}
    return {**DEFAULT_PREFS, **(p if isinstance(p, dict) else {})}


def user_public(row: Any) -> dict[str, Any]:
    """`AuthUser` shape for the web. ``company_code`` is included only for the business_head."""
    row = dict(row)
    co = _company(row["company_id"]) or {}
    out = {"id": row["id"], "name": row.get("name") or "", "email": row["email"], "role": row["role"],
           "role_label": ROLE_LABELS.get(row["role"], row["role"]), "company_id": row["company_id"],
           "company_name": co.get("name", ""), "company_industry": co.get("industry"),
           "verified": bool(row.get("verified")), "prefs": _prefs(row)}
    if row["role"] == "business_head":
        out["company_code"] = co.get("code")
    return out


def company_members(company_id: str, verified_only: bool = False) -> list[dict[str, Any]]:
    q = "select * from users where company_id=?" + (" and verified=1" if verified_only else "")
    with state._lock:
        rows = [dict(r) for r in _db().execute(q, (company_id,)).fetchall()]
    rows.sort(key=lambda r: (ROLE_ORDER.index(r["role"]) if r["role"] in ROLE_ORDER else 99, r.get("name") or ""))
    return [{**r, "prefs": _prefs(r)} for r in rows]


def _has_verified_head(company_id: str, exclude_user: str | None = None) -> bool:
    with state._lock:
        r = _db().execute("select id from users where company_id=? and role='business_head' and verified=1 and id!=?",
                          (company_id, exclude_user or "")).fetchone()
    return r is not None


def _mark_verified(u: dict[str, Any]) -> None:
    if u["verified"]:
        return
    if u["role"] == "business_head" and _has_verified_head(u["company_id"], exclude_user=u["id"]):
        raise HTTPException(409, "This company already has a Business Head. Ask them for access, or pick another role.")
    with state._lock:
        _db().execute("update users set verified=1 where id=?", (u["id"],))
        _db().commit()
    u["verified"] = 1


# ------------------------------------------------------------------ dependencies for other lanes
def _bearer(authorization: str | None) -> str | None:
    if not isinstance(authorization, str) or not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def optional_user(authorization: str | None = Header(None)) -> dict[str, Any] | None:
    tok = _bearer(authorization)
    payload = decode_token(tok) if tok else None
    if not payload:
        return None
    u = _user_by_id(str(payload.get("sub")))
    if not u:
        return None
    pub = user_public(u)
    pub["_jti"] = payload["jti"]  # internal: used by logout; stripped from API responses
    return pub


def current_user(authorization: str | None = Header(None)) -> dict[str, Any]:
    u = optional_user(authorization)
    if u is None:
        raise HTTPException(401, "Please sign in.")
    return u


def _out(u: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in u.items() if not k.startswith("_")}


# ------------------------------------------------------------------ one-time codes
def _demo_cfg() -> dict[str, Any]:
    try:
        return yaml.safe_load(DEMO_FILE.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}


def _demo_logins_on() -> bool:
    return os.environ.get("STRATA_DEMO_LOGINS", "1").strip() != "0"


def _expose_dev_code(email: str) -> bool:
    """dev_code is returned ONLY when the mail cannot actually be delivered, i.e. SMTP is not configured (keyless
    demo). One narrow extension: the seeded demo accounts live on a non-routable domain, so with SMTP configured
    they could never receive a code; their codes are exposed while demo logins are on."""
    if not mailer.smtp_configured():
        return True
    dom = str(_demo_cfg().get("demo_domain") or "demo.strata.local").lower()
    return _demo_logins_on() and email.endswith("@" + dom)


def _issue_code(email: str, purpose: str, name: str) -> dict[str, Any]:
    now = time.time()
    with state._lock:
        r = _db().execute("select expires_at from auth_codes where email=? and purpose=?", (email, purpose)).fetchone()
        if r and (r[0] - OTP_TTL) > now - OTP_COOLDOWN:
            raise HTTPException(429, "A code was just sent. Please wait a few seconds before asking again.")
        code = f"{secrets.randbelow(10 ** 6):06d}"
        _db().execute("insert or replace into auth_codes (email, purpose, code_hash, expires_at, attempts) values (?,?,?,?,0)",
                      (email, purpose, _code_hash(email, purpose, code), now + OTP_TTL))
        _db().commit()
    subject, text, html = mailer.code_mail(purpose, name, code, OTP_TTL // 60)
    mailer.send_mail(email, subject, text, html)
    out: dict[str, Any] = {}
    if _expose_dev_code(email):
        out["dev_code"] = code  # keyless demo only: no real mail can reach this address
    return out


def _check_code(email: str, purpose: str, code: str) -> None:
    bad = HTTPException(400, "That code is invalid or has expired. Request a new one.")
    code = (code or "").strip()
    with state._lock:
        r = _db().execute("select code_hash, expires_at, attempts from auth_codes where email=? and purpose=?",
                          (email, purpose)).fetchone()
        if not r:
            raise bad
        if r["expires_at"] < time.time():
            _db().execute("delete from auth_codes where email=? and purpose=?", (email, purpose))
            _db().commit()
            raise bad
        if r["attempts"] >= OTP_ATTEMPTS:
            _db().execute("delete from auth_codes where email=? and purpose=?", (email, purpose))
            _db().commit()
            raise HTTPException(429, "Too many attempts. Request a new code.")
        if not hmac.compare_digest(r["code_hash"], _code_hash(email, purpose, code)):
            _db().execute("update auth_codes set attempts=attempts+1 where email=? and purpose=?", (email, purpose))
            _db().commit()
            if r["attempts"] + 1 >= OTP_ATTEMPTS:
                _db().execute("delete from auth_codes where email=? and purpose=?", (email, purpose))
                _db().commit()
                raise HTTPException(429, "Too many attempts. Request a new code.")
            raise bad
        _db().execute("delete from auth_codes where email=? and purpose=?", (email, purpose))
        _db().commit()


# ------------------------------------------------------------------ validation
def _email(raw: str) -> str:
    e = (raw or "").strip().lower()
    if len(e) > 254 or not EMAIL_RE.match(e):
        raise HTTPException(400, "Please enter a valid email address.")
    return e


def _password(raw: str) -> str:
    if not isinstance(raw, str) or len(raw) < PW_MIN:
        raise HTTPException(400, f"Password must be at least {PW_MIN} characters.")
    if len(raw) > 256:
        raise HTTPException(400, "Password is too long.")
    return raw


def _session(u: dict[str, Any]) -> dict[str, Any]:
    return {"token": issue_token(u["id"]), "user": user_public(u)}


# ------------------------------------------------------------------ request bodies
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    company_code: str
    role: str


class EmailCodeIn(BaseModel):
    email: str
    code: str


class LoginIn(BaseModel):
    email: str
    password: str


class EmailIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    email: str
    code: str
    new_password: str


class PrefsIn(BaseModel):
    theme: str | None = None
    email_alerts: bool | None = None


class CompanyIn(BaseModel):
    name: str
    industry: str | None = None
    code: str | None = None


# ------------------------------------------------------------------ endpoints
@router.get("/auth/companies/lookup")
def lookup_company(code: str) -> dict[str, Any]:
    co = company_by_code(code)
    if not co:
        raise HTTPException(404, "No company has that code. Check it with your Business Head.")
    return {"code": co["code"], "name": co["name"], "industry": co.get("industry")}


@router.post("/auth/register")
def register(body: RegisterIn) -> dict[str, Any]:
    name = (body.name or "").strip()
    if not 1 <= len(name) <= 80:
        raise HTTPException(400, "Please enter your name (up to 80 characters).")
    email = _email(body.email)
    pw = _password(body.password)
    if body.role not in ROLE_LABELS:
        raise HTTPException(400, "Please pick one of the listed roles.")
    co = company_by_code(body.company_code)
    if not co:
        raise HTTPException(404, "No company has that code. Check it with your Business Head.")
    if body.role == "business_head" and _has_verified_head(co["id"]):
        raise HTTPException(403, "This company already has a Business Head. Join with another role, "
                                 "or ask the Business Head for help.")
    existing = _user_by_email(email)
    if existing and existing["verified"]:
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    with state._lock:
        if existing:  # unverified: let the person start over with fresh details
            uid = existing["id"]
            _db().execute("update users set company_id=?, name=?, role=?, pw_hash=? where id=?",
                          (co["id"], name, body.role, hash_password(pw), uid))
        else:
            uid = "u_" + secrets.token_hex(6)
            _db().execute("insert into users (id, company_id, name, email, role, pw_hash, verified, prefs, created_at)"
                          " values (?,?,?,?,?,?,0,?,?)",
                          (uid, co["id"], name, email, body.role, hash_password(pw), json.dumps(DEFAULT_PREFS),
                           state.wall_now()))
        _db().commit()
    return {"status": "verify_required", "email": email, **_issue_code(email, "verify", name)}


@router.post("/auth/verify")
def verify(body: EmailCodeIn) -> dict[str, Any]:
    email = _email(body.email)
    _check_code(email, "verify", body.code)
    u = _user_by_email(email)
    if not u:
        raise HTTPException(400, "That code is invalid or has expired. Request a new one.")
    _mark_verified(u)
    return _session(u)


@router.post("/auth/login")
def login(body: LoginIn) -> dict[str, Any]:
    generic = HTTPException(401, "Email or password is incorrect.")
    email = (body.email or "").strip().lower()
    u = _user_by_email(email) if EMAIL_RE.match(email) else None
    ok = verify_password(body.password or "", u["pw_hash"] if u else _DUMMY_HASH)
    if not u or not ok:
        raise generic
    if not u["verified"]:
        raise HTTPException(403, "Please confirm your email first. Use \"Email me a code\" to get a new code.")
    return _session(u)


@router.post("/auth/otp/request")
def otp_request(body: EmailIn) -> dict[str, Any]:
    email = _email(body.email)
    u = _user_by_email(email)
    if not u:  # same answer whether or not the account exists
        return {"status": "sent"}
    return {"status": "sent", **_issue_code(email, "login", u.get("name") or "")}


@router.post("/auth/otp/verify")
def otp_verify(body: EmailCodeIn) -> dict[str, Any]:
    email = _email(body.email)
    _check_code(email, "login", body.code)
    u = _user_by_email(email)
    if not u:
        raise HTTPException(400, "That code is invalid or has expired. Request a new one.")
    _mark_verified(u)  # receiving the code proves the person owns the mailbox
    return _session(u)


@router.post("/auth/password/forgot")
def password_forgot(body: EmailIn) -> dict[str, Any]:
    email = _email(body.email)
    u = _user_by_email(email)
    if not u:
        return {"status": "sent"}
    return {"status": "sent", **_issue_code(email, "reset", u.get("name") or "")}


@router.post("/auth/password/reset")
def password_reset(body: ResetIn) -> dict[str, Any]:
    email = _email(body.email)
    pw = _password(body.new_password)
    _check_code(email, "reset", body.code)
    u = _user_by_email(email)
    if not u:
        raise HTTPException(400, "That code is invalid or has expired. Request a new one.")
    _mark_verified(u)
    with state._lock:
        _db().execute("update users set pw_hash=? where id=?", (hash_password(pw), u["id"]))
        _db().execute("update sessions set revoked=1 where user_id=?", (u["id"],))  # sign out everywhere
        _db().commit()
    return {"status": "ok"}


@router.get("/auth/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": _out(user)}


@router.patch("/auth/me/prefs")
def me_prefs(body: PrefsIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    prefs = dict(user["prefs"])
    if body.theme is not None:
        if body.theme not in ("light", "dark", "system"):
            raise HTTPException(400, "Theme must be light, dark or system.")
        prefs["theme"] = body.theme
    if body.email_alerts is not None:
        prefs["email_alerts"] = bool(body.email_alerts)
    with state._lock:
        _db().execute("update users set prefs=? where id=?", (json.dumps(prefs), user["id"]))
        _db().commit()
    return {"user": user_public(_user_by_id(user["id"]))}


@router.post("/auth/logout")
def logout(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    with state._lock:
        _db().execute("update sessions set revoked=1 where jti=?", (user["_jti"],))
        _db().commit()
    return {"status": "ok"}


@router.get("/auth/company")
def my_company(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    co = _company(user["company_id"]) or {}
    company = {"id": co.get("id"), "name": co.get("name"), "industry": co.get("industry")}
    if user["role"] == "business_head":
        company["code"] = co.get("code")
    members = [{"name": m.get("name") or "", "email": m["email"], "role": m["role"],
                "role_label": ROLE_LABELS.get(m["role"], m["role"]), "verified": bool(m["verified"])}
               for m in company_members(user["company_id"])]
    return {"company": company, "members": members}


@router.get("/auth/demo-accounts")
def demo_accounts() -> list[dict[str, Any]]:
    cfg = _demo_cfg()
    du = cfg.get("demo_users") or {}
    pw = cfg.get("demo_password") if _demo_logins_on() else None
    out = []
    for spec in du.get("users") or []:
        u = _user_by_email(str(spec.get("email", "")).lower())
        if not u:
            continue
        co = _company(u["company_id"]) or {}
        item = {"email": u["email"], "role": u["role"], "role_label": ROLE_LABELS.get(u["role"], u["role"]),
                "company_name": co.get("name", "")}
        if pw:
            item["demo_password"] = pw  # shared TEST password; hidden when STRATA_DEMO_LOGINS=0
        out.append(item)
    out.sort(key=lambda d: ROLE_ORDER.index(d["role"]) if d["role"] in ROLE_ORDER else 99)
    return out


def _new_code() -> str:
    with state._lock:
        while True:
            c = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
            if not _db().execute("select 1 from companies where code=?", (c,)).fetchone():
                return c


@router.post("/admin/companies")
def admin_create_company(body: CompanyIn, x_admin_key: str | None = Header(None)) -> dict[str, Any]:
    want = os.environ.get("STRATA_ADMIN_KEY", "")
    if not want:
        raise HTTPException(403, "Company admin is disabled: STRATA_ADMIN_KEY is not set on the engine.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key.encode(), want.encode()):
        raise HTTPException(403, "Admin key is missing or wrong.")
    name = (body.name or "").strip()
    if not 1 <= len(name) <= 120:
        raise HTTPException(400, "Company name is required (up to 120 characters).")
    with state._lock:
        dup = _db().execute("select code from companies where lower(name)=lower(?)", (name,)).fetchone()
        if dup:
            raise HTTPException(409, f"A company with this name already exists (code {dup[0]}). Codes are never reissued.")
        if body.code:
            code = body.code.strip().upper()
            if not CODE_RE.match(code):
                raise HTTPException(400, "Code must be 6 characters from A-Z and 2-9 (no 0, O, 1 or I).")
            if _db().execute("select 1 from companies where code=?", (code,)).fetchone():
                raise HTTPException(409, "That code is already taken.")
        else:
            code = _new_code()
        cid = "co_" + secrets.token_hex(5)
        _db().execute("insert into companies (id, name, industry, code, created_at) values (?,?,?,?,?)",
                      (cid, name, (body.industry or "").strip() or None, code, state.wall_now()))
        _db().commit()
    return {"company": {"id": cid, "name": name, "industry": (body.industry or "").strip() or None, "code": code}}


# ------------------------------------------------------------------ idempotent demo seeding (on import)
def seed_demo() -> None:
    cfg = _demo_cfg()
    if not cfg:
        return
    now = state.wall_now()
    with state._lock:
        for c in cfg.get("companies") or []:
            code = str(c.get("code", "")).upper()
            if not CODE_RE.match(code):
                continue
            # insert-or-ignore: an existing company keeps its code forever
            _db().execute("insert or ignore into companies (id, name, industry, code, created_at) values (?,?,?,?,?)",
                          (c["id"], c["name"], c.get("industry"), code, now))
        du = cfg.get("demo_users") or {}
        pw = str(cfg.get("demo_password") or "")
        for u in du.get("users") or []:
            email = str(u["email"]).lower()
            if u.get("role") not in ROLE_LABELS or len(pw) < PW_MIN:
                continue
            if _db().execute("select 1 from users where email=?", (email,)).fetchone():
                continue
            _db().execute("insert or ignore into users (id, company_id, name, email, role, pw_hash, verified, prefs,"
                          " created_at) values (?,?,?,?,?,?,1,?,?)",
                          (u["id"], u.get("company", du.get("company")), u.get("name"), email, u["role"], hash_password(pw),
                           json.dumps(DEFAULT_PREFS), now))
        _db().commit()


seed_demo()
