"""SQL translation for the Supabase (Postgres) login backend; tests never connect to Supabase."""
from strata_engine.authdb import _Row, _translate, backend


def test_placeholders_and_upserts():
    assert _translate("select * from users where email=?") == "select * from users where email=%s"
    up = _translate("insert or replace into auth_codes (email, purpose, code_hash, expires_at, attempts) values (?,?,?,?,0)")
    assert up.startswith("insert into auth_codes") and "on conflict (email, purpose) do update set" in up
    assert "code_hash=excluded.code_hash" in up and "email=excluded" not in up
    ig = _translate("insert or ignore into companies (id, name) values (?,?)")
    assert ig.startswith("insert into companies") and ig.endswith("on conflict do nothing")


def test_row_allows_key_and_index():
    r = _Row({"revoked": 0, "jti": "x"})
    assert r["revoked"] == 0 and r[0] == 0 and r[1] == "x" and dict(r) == {"revoked": 0, "jti": "x"}


def test_default_backend_is_sqlite(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    assert backend() == "sqlite"


def test_unreachable_supabase_falls_back_to_sqlite(monkeypatch):
    from strata_engine import authdb, state
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://u:p@127.0.0.1:1/none")
    authdb._REACHABLE.clear()
    assert authdb.backend() == "sqlite" and authdb.connection() is state._C
