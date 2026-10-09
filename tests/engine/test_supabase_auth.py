"""Google sign-in through Supabase Auth, with Supabase's /auth/v1/user call faked."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    from strata_engine.app import app
    return TestClient(app)


def _fake(monkeypatch, status=200, email="new.person@gmail.com"):
    import httpx

    class R:
        status_code = status
        def json(self):
            return {"email": email, "user_metadata": {"full_name": "New Person"}}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: R())


def test_config_reports_enabled(client):
    assert client.get("/auth/supabase/config").json()["enabled"] is True


def test_existing_user_gets_session(client, monkeypatch):
    _fake(monkeypatch, email="operations@demo.strata.local")
    r = client.post("/auth/supabase", json={"access_token": "t"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "operations_manager" and r.json()["token"]


def test_new_user_joins_with_code(client, monkeypatch):
    _fake(monkeypatch, email="google.newbie@gmail.com")
    assert client.post("/auth/supabase", json={"access_token": "t"}).json()["status"] == "join_required"
    assert client.post("/auth/supabase", json={"access_token": "t", "company_code": "ZZZZZZ", "role": "sales_manager"}).status_code == 404
    r = client.post("/auth/supabase", json={"access_token": "t", "company_code": "FMC8Q4", "role": "sales_manager"})
    assert r.status_code == 200 and r.json()["user"]["company_name"].startswith("BrightCart")
    assert client.post("/auth/supabase", json={"access_token": "t"}).json()["user"]["email"] == "google.newbie@gmail.com"


def test_bad_token_rejected(client, monkeypatch):
    _fake(monkeypatch, status=401)
    assert client.post("/auth/supabase", json={"access_token": "bad"}).status_code == 401
