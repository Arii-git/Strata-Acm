"""Each demo company sees its own data estate, its own industry wording and its own case state."""
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
CFG = yaml.safe_load((ROOT / "config" / "demo_companies.yaml").read_text(encoding="utf-8"))
STORE = ROOT / "data" / "store"


@pytest.fixture(scope="module")
def client():
    from strata_engine.app import app
    return TestClient(app)


def _head_of(company_id: str) -> str:
    default = CFG["demo_users"]["company"]
    return next(u["email"] for u in CFG["demo_users"]["users"]
                if u["role"] == "business_head" and u.get("company", default) == company_id)


def _auth(client, company_id: str) -> dict[str, str]:
    r = client.post("/auth/login", json={"email": _head_of(company_id), "password": CFG["demo_password"]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _datasets_present() -> bool:
    return all((STORE / c["dataset"] / "orders.pkl").exists() for c in CFG["companies"] if c.get("dataset"))


@pytest.mark.skipif(not _datasets_present(), reason="run npm run seed to generate every company's data")
def test_each_company_sees_its_own_accounts(client):
    names = {}
    for co, word in (("co_renalis", "Pharma"), ("co_brightcart", "Supermart|Distributors|Kirana|Hotels"), ("co_meridian", "Industries|Online Retail|Cold Chain|Traders")):
        accs = client.get("/accounts", headers=_auth(client, co)).json()["items"]
        names[co] = {a["name"] for a in accs}
        import re
        assert any(re.search(word, n) for n in names[co]), co
    assert names["co_renalis"] != names["co_brightcart"] != names["co_meridian"]
    assert not any("Pharma" in n for n in names["co_meridian"])


@pytest.mark.skipif(not _datasets_present(), reason="run npm run seed to generate every company's data")
def test_industry_labels_and_case_titles(client):
    acc = client.get("/accounts", headers=_auth(client, "co_meridian")).json()["items"]
    assert {"Enterprise shipper", "E-commerce client"} & {a["type_label"] for a in acc}
    titles = " ".join(i["title"] for i in client.get("/incidents", headers=_auth(client, "co_meridian")).json()["items"])
    assert "adverse-event" not in titles


@pytest.mark.skipif(not _datasets_present(), reason="run npm run seed to generate every company's data")
def test_case_state_is_isolated(client):
    from strata_engine import state, tenancy
    tok = tenancy._current.set("co_brightcart")
    try:
        state.put("notes_probe", "x", {"company": "co_brightcart"})
    finally:
        tenancy._current.reset(tok)
    assert state.get("notes_probe", "x") is None  # default company cannot see it
    tok = tenancy._current.set("co_brightcart")
    try:
        assert state.get("notes_probe", "x") == {"company": "co_brightcart"}
    finally:
        tenancy._current.reset(tok)


def test_no_token_uses_default_company(client):
    from strata_engine import tenancy
    assert tenancy.company() == tenancy.DEFAULT_COMPANY
    assert client.get("/health").status_code == 200
