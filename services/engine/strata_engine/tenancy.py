"""Which demo company a request belongs to.

The signed-in user's token names a company; a small ASGI middleware puts it in a context variable for the
duration of the request. The engine keeps one data estate and one state database per company and picks them
from here. Requests without a token (scripts, tests, the keyless persona switch) use the default company.
"""

from __future__ import annotations

from contextvars import ContextVar
from functools import lru_cache
from typing import Any

import yaml

from .config import ROOT, SEED_NAME

DEFAULT_COMPANY = "co_renalis"
_current: ContextVar[str] = ContextVar("strata_company", default=DEFAULT_COMPANY)


def company() -> str:
    return _current.get()


@lru_cache(maxsize=1)
def _companies() -> dict[str, dict[str, Any]]:
    path = ROOT / "config" / "demo_companies.yaml"
    if not path.exists():
        return {}
    cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {c["id"]: c for c in cfg.get("companies", [])}


def dataset(cid: str | None = None) -> str:
    """data/store/<dataset> for a company. The default company follows STRATA_SEED (seed_dev unless overridden)."""
    cid = cid or company()
    if cid == DEFAULT_COMPANY:
        return SEED_NAME
    return _companies().get(cid, {}).get("dataset") or SEED_NAME


def profile(cid: str | None = None) -> str:
    return _companies().get(cid or company(), {}).get("profile") or "pharma"


@lru_cache(maxsize=1)
def _profiles() -> Any:
    """data/profiles.py (shared with the seed script), loaded by path so the engine needs no data/ package."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("strata_profiles", ROOT / "data" / "profiles.py")
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def type_label(key: str) -> str:
    mod = _profiles()
    return mod.type_label(profile(), key) if mod else key.replace("_", " ").capitalize()


def case_title(text: str) -> str:
    mod = _profiles()
    return mod.title(profile(), text) if mod else text


class CompanyMiddleware:
    """Pure ASGI middleware: Authorization: Bearer <token> -> company context for this request."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        cid = DEFAULT_COMPANY
        for k, v in scope.get("headers", []):
            if k == b"authorization":
                cid = _company_from_auth(v.decode("latin-1")) or DEFAULT_COMPANY
                break
        tok = _current.set(cid)
        try:
            await self.app(scope, receive, send)
        finally:
            _current.reset(tok)


def _company_from_auth(header: str) -> str | None:
    if not header.lower().startswith("bearer "):
        return None
    try:
        from . import auth
        return auth.company_of_token(header[7:].strip())
    except Exception:
        return None
