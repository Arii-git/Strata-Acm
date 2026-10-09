"""Auth + mailer tests (keyless: SMTP env removed, so codes come back as dev_code and mail goes to the outbox)."""
import pytest
from fastapi.testclient import TestClient

MAIN = "RNL7K2"
DEMO_PW = "Strata-Demo-2026"
HEAD = "business.head@demo.strata.local"


@pytest.fixture(autouse=True)
def keyless(monkeypatch):
    for k in ("SMTP_USER", "SMTP_PASSWORD", "STRATA_DEMO_LOGINS"):
        monkeypatch.delenv(k, raising=False)


@pytest.fixture(scope="module")
def client():
    from strata_engine.app import app
    return TestClient(app)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register(client, email, role="sales_manager", code=MAIN, pw="correct-horse-1"):
    r = client.post("/auth/register", json={"name": "Test Person", "email": email, "password": pw,
                                            "company_code": code, "role": role})
    return r


def test_company_lookup(client):
    r = client.get("/auth/companies/lookup", params={"code": "rnl7k2"})
    assert r.status_code == 200
    assert r.json()["code"] == MAIN and "fictional" in r.json()["name"].lower()
    assert client.get("/auth/companies/lookup", params={"code": "ZZZZZZ"}).status_code == 404
    assert client.get("/auth/companies/lookup", params={"code": "bad"}).status_code == 404


def test_register_verify_login_me_logout(client):
    email = "Pat.Lee@Example.com"
    r = _register(client, email)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "verify_required" and body["email"] == email.lower()
    code = body["dev_code"]
    assert len(code) == 6 and code.isdigit()

    # unverified login is refused with 403
    r = client.post("/auth/login", json={"email": email, "password": "correct-horse-1"})
    assert r.status_code == 403 and "detail" in r.json()

    r = client.post("/auth/verify", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["verified"] is True
    # code is single-use
    assert client.post("/auth/verify", json={"email": email, "code": code}).status_code == 400

    r = client.post("/auth/login", json={"email": email.upper(), "password": "correct-horse-1"})
    assert r.status_code == 200
    tok, user = r.json()["token"], r.json()["user"]
    assert user["role"] == "sales_manager" and user["role_label"] == "Sales Manager"
    assert "company_code" not in user and user["company_name"]
    assert user["prefs"]["email_alerts"] is True

    me = client.get("/auth/me", headers=_h(tok))
    assert me.status_code == 200 and me.json()["user"]["email"] == email.lower()
    assert "_jti" not in me.json()["user"]

    r = client.patch("/auth/me/prefs", headers=_h(tok), json={"theme": "dark", "email_alerts": False})
    assert r.json()["user"]["prefs"] == {"theme": "dark", "email_alerts": False}
    assert client.patch("/auth/me/prefs", headers=_h(tok), json={"theme": "neon"}).status_code == 400

    comp = client.get("/auth/company", headers=_h(tok)).json()
    assert "code" not in comp["company"]
    assert any(m["email"] == email.lower() for m in comp["members"])

    assert client.post("/auth/logout", headers=_h(tok)).status_code == 200
    assert client.get("/auth/me", headers=_h(tok)).status_code == 401
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=_h("garbage.token")).status_code == 401
    # duplicate verified email
    assert _register(client, email).status_code == 409


def test_wrong_password_is_generic(client):
    a = client.post("/auth/login", json={"email": HEAD, "password": "not-the-password"})
    b = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever-123"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]


def test_validation(client):
    assert _register(client, "not-an-email").status_code == 400
    assert _register(client, "short@example.com", pw="short").status_code == 400
    assert _register(client, "role@example.com", role="ceo").status_code == 400
    assert _register(client, "nocode@example.com", code="ZZZZZZ").status_code == 404


def test_otp_login(client):
    r = client.post("/auth/otp/request", json={"email": HEAD})
    assert r.status_code == 200 and r.json()["status"] == "sent"
    code = r.json()["dev_code"]
    assert client.post("/auth/otp/verify", json={"email": HEAD, "code": "000000" if code != "000000" else "111111"}).status_code == 400
    r = client.post("/auth/otp/verify", json={"email": HEAD, "code": code})
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["role"] == "business_head" and u["company_code"] == MAIN
    # unknown email: same answer, no code
    r = client.post("/auth/otp/request", json={"email": "ghost@example.com"})
    assert r.status_code == 200 and r.json() == {"status": "sent"}


def test_otp_attempt_limit(client):
    email = "qa@demo.strata.local"
    code = client.post("/auth/otp/request", json={"email": email}).json()["dev_code"]
    wrong = "123456" if code != "123456" else "654321"
    codes = [client.post("/auth/otp/verify", json={"email": email, "code": wrong}).status_code for _ in range(5)]
    assert codes[-1] == 429 and all(c == 400 for c in codes[:-1])
    # the code is burned after 5 failures
    assert client.post("/auth/otp/verify", json={"email": email, "code": code}).status_code == 400


def test_forgot_and_reset(client):
    email = "reset.me@example.com"
    code = _register(client, email, role="support_manager").json()["dev_code"]
    tok = client.post("/auth/verify", json={"email": email, "code": code}).json()["token"]
    r = client.post("/auth/password/forgot", json={"email": email})
    assert r.status_code == 200
    rc = r.json()["dev_code"]
    assert client.post("/auth/password/reset", json={"email": email, "code": rc, "new_password": "short"}).status_code == 400
    r = client.post("/auth/password/reset", json={"email": email, "code": rc, "new_password": "brand-new-pass"})
    assert r.json() == {"status": "ok"}
    assert client.get("/auth/me", headers=_h(tok)).status_code == 401  # all sessions revoked
    assert client.post("/auth/login", json={"email": email, "password": "correct-horse-1"}).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": "brand-new-pass"}).status_code == 200
    assert client.post("/auth/password/forgot", json={"email": "ghost@example.com"}).json() == {"status": "sent"}


def test_business_head_unique(client, monkeypatch):
    r = _register(client, "second.head@example.com", role="business_head")
    assert r.status_code == 403 and "Business Head" in r.json()["detail"]

    # a fresh company can get exactly one Business Head
    assert client.post("/admin/companies", json={"name": "X"}).status_code == 403  # no admin key configured
    monkeypatch.setenv("STRATA_ADMIN_KEY", "test-admin-key")
    assert client.post("/admin/companies", json={"name": "X"}, headers={"X-Admin-Key": "nope"}).status_code == 403
    r = client.post("/admin/companies", json={"name": "Test Co (fictional)", "industry": "Retail", "code": "tst7k9"},
                    headers={"X-Admin-Key": "test-admin-key"})
    assert r.status_code == 200, r.text
    assert r.json()["company"]["code"] == "TST7K9"
    assert client.post("/admin/companies", json={"name": "Other", "code": "TST7K9"},
                       headers={"X-Admin-Key": "test-admin-key"}).status_code == 409
    assert client.post("/admin/companies", json={"name": "Bad", "code": "O0I1AB"},
                       headers={"X-Admin-Key": "test-admin-key"}).status_code == 400
    auto = client.post("/admin/companies", json={"name": "Auto Co"}, headers={"X-Admin-Key": "test-admin-key"}).json()
    assert len(auto["company"]["code"]) == 6 and not set(auto["company"]["code"]) & set("0O1I")

    a = _register(client, "head.a@example.com", role="business_head", code="TST7K9").json()
    b = _register(client, "head.b@example.com", role="business_head", code="TST7K9").json()
    ok = client.post("/auth/verify", json={"email": "head.a@example.com", "code": a["dev_code"]})
    assert ok.status_code == 200 and ok.json()["user"]["company_code"] == "TST7K9"
    late = client.post("/auth/verify", json={"email": "head.b@example.com", "code": b["dev_code"]})
    assert late.status_code == 409
    assert _register(client, "head.c@example.com", role="business_head", code="TST7K9").status_code == 403


def test_outbox_recorded_and_masked(client):
    email = "outbox.check@example.com"
    code = _register(client, email, role="qa_head").json()["dev_code"]
    from strata_engine import mailer
    mails = [m for m in mailer.recent_outbox(100) if m["to"] == email]
    assert mails and mails[0]["sent_via"] == "outbox"
    assert code not in str(mails[0])  # the code itself is never stored

    head_tok = client.post("/auth/login", json={"email": HEAD, "password": DEMO_PW}).json()["token"]
    r = client.get("/mail/outbox", headers=_h(head_tok))
    assert r.status_code == 200
    assert any(m["to"] == email for m in r.json())
    assert all(code not in str(m) for m in r.json())
    sales_tok = client.post("/auth/login", json={"email": "sales@demo.strata.local", "password": DEMO_PW}).json()["token"]
    assert client.get("/mail/outbox", headers=_h(sales_tok)).status_code == 403
    assert client.get("/mail/outbox").status_code == 401


def test_notify_respects_roles_and_prefs(client):
    from strata_engine import auth, mailer
    n = mailer.notify("co_renalis", ["business_head", "operations_manager"], "Level 4 alert", "Stock-out risk.",
                      level=4, title="Phosphate binder stock-out", deadline="2026-10-10 18:00", link="/app/incidents")
    assert n == 2
    sales = client.post("/auth/login", json={"email": "sales@demo.strata.local", "password": DEMO_PW}).json()["token"]
    client.patch("/auth/me/prefs", headers=_h(sales), json={"email_alerts": False})
    assert mailer.notify("co_renalis", ["sales_manager"], "x", "y") == 0
    client.patch("/auth/me/prefs", headers=_h(sales), json={"email_alerts": True})
    assert mailer.notify("co_renalis", ["sales_manager"], "x", "y") == 1
    assert auth.current_user  # exported dependency
    assert not mailer.deliverable("a@demo.strata.local") and not mailer.deliverable("a@example.com")
    assert mailer.deliverable("someone@gmail.com")


def test_demo_accounts(client, monkeypatch):
    r = client.get("/auth/demo-accounts")
    items = r.json()
    roles = {"operations_manager", "account_manager", "sales_manager", "support_manager", "business_head", "qa_head"}
    assert len(items) == 18  # three fictional companies x six roles
    assert {i["role"] for i in items} == roles
    assert len({i["company_name"] for i in items}) == 3
    assert all(i["email"].endswith("demo.strata.local") and i["demo_password"] == DEMO_PW for i in items)
    monkeypatch.setenv("STRATA_DEMO_LOGINS", "0")
    assert all("demo_password" not in i for i in client.get("/auth/demo-accounts").json())
    # every demo account can sign in with the shared test password
    for i in items:
        assert client.post("/auth/login", json={"email": i["email"], "password": DEMO_PW}).status_code == 200


def test_token_tamper_and_dev_code_hidden_with_smtp(client, monkeypatch):
    tok = client.post("/auth/login", json={"email": HEAD, "password": DEMO_PW}).json()["token"]
    body, sig = tok.split(".")
    assert client.get("/auth/me", headers=_h(body + "." + sig[::-1])).status_code == 401
    # with SMTP configured, real addresses never get a dev_code (and nothing is actually sent: .test domain)
    monkeypatch.setenv("SMTP_USER", "someone")
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    r = _register(client, "smtp.mode@mail.test", role="account_manager")
    assert r.status_code == 200 and "dev_code" not in r.json()
