"""Where login data lives: Supabase Postgres when SUPABASE_DB_URL is set, else the local sqlite state DB.

auth.py writes sqlite-flavoured SQL (`?` placeholders, `insert or ignore/replace`). The Postgres wrapper
translates those few forms and returns rows that work both as `r["col"]` and `r[0]`, so auth.py does not
care which backend it is talking to. Only users, companies, one-time codes and sessions live here.
"""

from __future__ import annotations

import logging
import os
import re
import threading
from typing import Any

log = logging.getLogger("strata.authdb")

# insert or replace into <table> -> upsert on that table's primary key
_UPSERT_KEYS = {"auth_codes": "(email, purpose)"}


class _Row(dict):
    """dict row that also allows positional access (sqlite3.Row style)."""

    def __getitem__(self, k: Any) -> Any:
        if isinstance(k, int):
            return list(self.values())[k]
        return super().__getitem__(k)


def _translate(sql: str) -> str:
    s = sql.replace("?", "%s")
    m = re.match(r"\s*insert or replace into (\w+)\s*\(([^)]*)\)", s, re.IGNORECASE)
    if m:
        table, cols = m.group(1), [c.strip() for c in m.group(2).split(",")]
        key = _UPSERT_KEYS.get(table, "(id)")
        keycols = {c.strip() for c in key.strip("()").split(",")}
        sets = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in keycols)
        s = re.sub(r"insert or replace into", "insert into", s, count=1, flags=re.IGNORECASE)
        s += f" on conflict {key} do update set {sets}"
    elif re.match(r"\s*insert or ignore into", s, re.IGNORECASE):
        s = re.sub(r"insert or ignore into", "insert into", s, count=1, flags=re.IGNORECASE) + " on conflict do nothing"
    return s


class _Cursor:
    def __init__(self, rows: list[_Row]):
        self._rows = rows

    def fetchone(self) -> _Row | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[_Row]:
        return self._rows


class PgConn:
    """Minimal sqlite3.Connection look-alike over psycopg 3 (autocommit)."""

    def __init__(self, url: str):
        self.url = url
        self._c: Any = None
        self._lock = threading.RLock()

    def _conn(self) -> Any:
        import psycopg
        from psycopg.rows import dict_row
        if self._c is None or self._c.closed:
            # prepare_threshold=None: required behind Supabase's transaction pooler (port 6543)
            self._c = psycopg.connect(self.url, autocommit=True, row_factory=dict_row, prepare_threshold=None, connect_timeout=10)
        return self._c

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> _Cursor:
        q = _translate(sql)
        with self._lock:
            for attempt in (1, 2):
                try:
                    cur = self._conn().execute(q, params)
                    rows = [_Row(r) for r in cur.fetchall()] if cur.description else []
                    return _Cursor(rows)
                except Exception as exc:  # one reconnect on a dropped connection
                    import psycopg
                    if attempt == 2 or not isinstance(exc, psycopg.OperationalError):
                        raise
                    self._c = None
        raise RuntimeError("unreachable")

    def executescript(self, script: str) -> None:
        for stmt in [s.strip() for s in script.split(";") if s.strip()]:
            self.execute(stmt)

    def commit(self) -> None:  # autocommit
        return None


_PG: PgConn | None = None
_REACHABLE: dict[str, bool] = {}


def _reachable(url: str) -> bool:
    """One quick probe per URL per process. Networks that block port 6543/5432 must not hang the engine."""
    if url not in _REACHABLE:
        try:
            import psycopg
            with psycopg.connect(url, prepare_threshold=None, connect_timeout=5) as c:
                c.execute("select 1")
            _REACHABLE[url] = True
        except Exception as exc:
            log.warning("auth: Supabase unreachable (%s); using the local sqlite login database instead", type(exc).__name__)
            _REACHABLE[url] = False
    return _REACHABLE[url]


def _url() -> str:
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    return url if url and _reachable(url) else ""


def backend() -> str:
    return "supabase" if _url() else "sqlite"


def connection() -> Any:
    """The login database connection (shared, used under state._lock like the sqlite one)."""
    global _PG
    url = _url()
    if not url:
        from . import state
        return state._C
    if _PG is None or _PG.url != url:
        _PG = PgConn(url)
        log.info("auth: using Supabase Postgres for users, companies and sessions")
    return _PG
