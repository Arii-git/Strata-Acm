"""Agentic lane: risk levels 1-5, policy, deadlines, Deadline Guardian (auto / provisional / escalation)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from strata_engine.app import app
    c = TestClient(app)
    assert c.post("/lab/reset").status_code == 200  # clears state docs, audit and the Lab clock
    return c


def levels(c, persona=None):
    r = c.get("/agentic/levels", params={"persona": persona} if persona else None)
    assert r.status_code == 200, r.text
    return r.json()


def item(c, ref):
    return next(x for x in levels(c)["items"] if x["ref"] == ref)


def advance(c, days=2):
    assert c.post("/lab/advance", json={"days": days}).status_code == 200
    return c.post("/agentic/tick").json()


# ------------------------------------------------------------------ classifier (pure)
def test_classifier_rules():
    from strata_engine.agentic import classify_level
    assert classify_level(severity="watch")[0] == 1
    assert classify_level(severity="elevated")[0] == 2
    assert classify_level(severity="high")[0] == 3
    assert classify_level(severity="critical")[0] == 4
    # missing data -> default 2
    lv, reasons = classify_level(severity=None)
    assert lv == 2 and "default" in reasons[0].lower()
    assert classify_level(severity="unknown_band")[0] == 2
    # multiple act-now alerts escalate
    assert classify_level(severity="elevated", alerts_count=2)[0] == 2
    lv, reasons = classify_level(severity="elevated", alerts_count=3)
    assert lv == 3 and any("alerts" in r for r in reasons)
    # top-decile exposure OR (high confidence AND persistence): one +1, not two
    assert classify_level(severity="elevated", value_at_stake=100, exposure_p90=90)[0] == 3
    assert classify_level(severity="elevated", confidence=0.95, persistent=True)[0] == 3
    assert classify_level(severity="elevated", confidence=0.95, persistent=False)[0] == 2
    assert classify_level(severity="elevated", value_at_stake=100, exposure_p90=90, confidence=1.0, persistent=True)[0] == 3
    # clamp at 5
    assert classify_level(severity="critical", alerts_count=9, value_at_stake=1, exposure_p90=1)[0] == 5
    # regulatory -> at least 4
    lv, reasons = classify_level(severity="watch", regulatory_sensitive=True)
    assert lv == 4 and any("Regulatory" in r for r in reasons)


def test_mode_rules():
    from strata_engine.agentic import DEFAULT_POLICY, mode_for
    p = DEFAULT_POLICY
    assert mode_for(1, p) == "auto"
    assert mode_for(2, p) == "provisional" and mode_for(3, p) == "provisional"
    assert mode_for(4, p) == "human_only" and mode_for(5, p) == "human_only"
    assert mode_for(1, p, regulatory=True) == "human_only"
    assert mode_for(2, p, four_eyes=True) == "human_only"


# ------------------------------------------------------------------ API
def test_levels_shape_and_regulatory_human_only(client):
    d = levels(client)
    assert d["policy"]["default_level"] == 2 and d["policy"]["deadlines_hours"]["1"] == 24
    assert d["items"], "seeded data should produce open cases"
    keys = {"ref", "title", "level", "level_label", "reasons", "alerts_count", "decision_deadline", "mode", "status"}
    for x in d["items"]:
        assert keys <= set(x)
        assert 1 <= x["level"] <= 5 and x["reasons"]
        if x["regulatory_sensitive"]:
            assert x["level"] >= 4 and x["mode"] == "human_only"
    lv = [x["level"] for x in d["items"]]
    assert lv == sorted(lv, reverse=True)
    assert sum(d["counts"].values()) == len(d["items"])


def test_multiple_alerts_raise_level(client):
    from strata_engine.agentic import SEV_BASE
    for x in levels(client)["items"]:
        if x["alerts_count"] >= 3 and not x["override"] and x["severity"] in SEV_BASE and x["severity"] != "critical":
            assert x["level"] >= SEV_BASE[x["severity"]] + 1
            assert any("alerts" in r for r in x["reasons"])
            return
    pytest.skip("no case with 3+ act-now alerts in this seed")


def test_policy_put_permission(client):
    r = client.put("/agentic/policy", params={"persona": "operations_manager"}, json={"deadlines_hours": {"1": 6}})
    assert r.status_code == 403
    r = client.put("/agentic/policy", json={"deadlines_hours": {"1": 6}})
    assert r.status_code == 403
    r = client.put("/agentic/policy", params={"persona": "business_head"}, json={"deadlines_hours": {"1": 6}, "email_min_level": 4})
    assert r.status_code == 200, r.text
    assert r.json()["deadlines_hours"]["1"] == 6 and r.json()["email_min_level"] == 4
    assert client.get("/agentic/policy").json()["deadlines_hours"]["1"] == 6
    bad = client.put("/agentic/policy", params={"persona": "business_head"}, json={"auto_decide_max_level": 4, "provisional_max_level": 3})
    assert bad.status_code == 400
    from strata_engine import state
    assert any(r["action"] == "agentic.policy_updated" for r in state.audit_rows())


def test_policy_put_with_bearer_token(client):
    from pathlib import Path

    import yaml
    cfg_path = Path(__file__).resolve().parents[2] / "config" / "demo_companies.yaml"
    if not cfg_path.exists():
        pytest.skip("auth lane not present")
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    default_co = cfg["demo_users"]["company"]
    users = {u["role"]: u["email"] for u in cfg["demo_users"]["users"] if u.get("company", default_co) == default_co}
    def token(role):
        r = client.post("/auth/login", json={"email": users[role], "password": cfg["demo_password"]})
        if r.status_code != 200:
            pytest.skip(f"auth login unavailable: {r.status_code}")
        return r.json()["token"]
    hdr = {"Authorization": f"Bearer {token('operations_manager')}"}
    # a valid token wins over a spoofed ?persona=
    assert client.put("/agentic/policy", params={"persona": "business_head"}, headers=hdr, json={"email_min_level": 5}).status_code == 403
    hdr = {"Authorization": f"Bearer {token('business_head')}"}
    r = client.put("/agentic/policy", headers=hdr, json={"email_min_level": 5})
    assert r.status_code == 200 and r.json()["updated_by"] == "Business Head (demo)"


def test_override_wins_and_is_audited(client):
    x = next(i for i in levels(client)["items"] if not i["regulatory_sensitive"])
    assert client.post(f"/agentic/levels/{x['ref']}/override", json={"level": 5, "persona": "operations_manager"}).status_code == 400  # reason needed
    r = client.post(f"/agentic/levels/{x['ref']}/override", json={"level": 5, "reason": "Key account", "persona": "operations_manager"})
    assert r.status_code == 200 and r.json()["item"]["level"] == 5 and r.json()["item"]["mode"] == "human_only"
    reg = next((i for i in levels(client)["items"] if i["regulatory_sensitive"]), None)
    if reg:
        r = client.post(f"/agentic/levels/{reg['ref']}/override", json={"level": 1, "reason": "test", "persona": "qa_head"})
        assert r.json()["item"]["level"] == 1 and r.json()["item"]["mode"] == "human_only"  # regulatory stays human-only
    from strata_engine import state
    assert any(r["action"] == "agentic.level_override" for r in state.audit_rows())


def _pick(c):
    """Pin three non-regulatory cases to levels 1, 2 and 5 so each mode is exercised regardless of the seed."""
    xs = [i for i in levels(c)["items"] if not i["regulatory_sensitive"] and not i["four_eyes"]]
    assert len(xs) >= 3
    out = {}
    for lv, x in zip((1, 2, 5), xs):
        r = c.post(f"/agentic/levels/{x['ref']}/override", json={"level": lv, "reason": "test", "persona": "business_head"})
        assert r.status_code == 200
        out[lv] = x["ref"]
    return out


def test_deadline_guardian_auto_provisional_escalation(client):
    refs = _pick(client)
    before = {x["ref"]: x for x in levels(client)["items"]}
    assert before[refs[1]]["mode"] == "auto" and before[refs[1]]["status"] == "awaiting_human"
    assert before[refs[2]]["mode"] == "provisional"
    assert before[refs[5]]["mode"] == "human_only"
    assert not before[refs[1]]["deadline_passed"]

    advance(client, 2)  # past every deadline (max 24 h)
    after = {x["ref"]: x for x in levels(client)["items"]}

    # level 1 -> auto decision with rationale and evidence
    a = after[refs[1]]
    assert a["status"] == "auto_decided", a
    assert a["auto_decision"]["decision"] in ("approved", "deferred")
    assert a["auto_decision"]["rationale"] and isinstance(a["auto_decision"]["evidence_ids"], list)
    # level 2 -> provisional, reversible
    p = after[refs[2]]
    assert p["status"] == "provisional" and p["auto_decision"]["kind"] == "provisional"
    assert p["plan_status"] == "awaiting_approval"  # still waiting for a human: nothing final
    # level 5 -> escalated to business head, never decided by the agent
    e = after[refs[5]]
    assert e["status"] == "escalated" and e["plan_status"] in (None, "awaiting_approval")

    from strata_engine import state
    rows = [r for r in state.audit_rows() if r["actor_type"] == "agent" and r["actor"] == "deadline-guardian"]
    actions = {r["action"] for r in rows}
    assert {"agentic.auto", "agentic.provisional", "agentic.escalation"} <= actions
    assert state.verify_chain()["ok"]
    assert any(n["kind"] == "escalation" and "business_head" in n["roles"] for n in state.all_("agentic_notifications"))

    # tasks created by the agent are simulated and internal
    for t in state.all_("tasks"):
        if str(t.get("origin", "")).startswith("agent_"):
            assert t["simulated"] is True

    # undo the provisional decision: tasks cancelled, agent stops acting on that case
    did = p["auto_decision"]["id"]
    r = client.post(f"/agentic/decisions/{did}/undo", json={"persona": "operations_manager", "by": "Test Manager"})
    assert r.status_code == 200, r.text
    again = item(client, refs[2])
    assert again["status"] == "awaiting_human" and again["agent_disabled"]
    assert all(state.get("tasks", t)["status"] == "cancelled" for t in r.json()["decision"]["task_ids"])
    client.post("/agentic/tick")
    assert item(client, refs[2])["status"] == "awaiting_human"  # no second auto action after undo

    # decisions log
    log = client.get("/agentic/decisions").json()
    assert len(log["items"]) >= 3 and log["notifications"]


def test_provisional_confirm_and_human_supersede(client):
    xs = [i for i in levels(client)["items"] if not i["regulatory_sensitive"] and not i["four_eyes"]][:2]
    for x in xs:
        client.post(f"/agentic/levels/{x['ref']}/override", json={"level": 3, "reason": "test", "persona": "business_head"})
    advance(client, 1)
    a, b = (item(client, x["ref"]) for x in xs)
    assert a["status"] == b["status"] == "provisional"
    # confirm a
    r = client.post(f"/agentic/decisions/{a['auto_decision']['id']}/confirm", json={"persona": "business_head", "by": "Head"})
    assert r.status_code == 200, r.text
    assert item(client, a["ref"])["status"] == "decided"
    # a human rejects b through the normal approval flow: agent's provisional step is superseded
    r = client.post(f"/plans/{b['plan_id']}/decision", json={"decision": "rejected", "reason": "Not now", "persona": "business_head", "decided_by": "Head"})
    assert r.status_code == 200, r.text
    bb = item(client, b["ref"]) if any(x["ref"] == b["ref"] for x in levels(client)["items"]) else None
    from strata_engine import state
    d = state.get("agent_decisions", b["auto_decision"]["id"])
    assert d["status"] == "superseded"
    assert all(state.get("tasks", t)["status"] == "cancelled" for t in d["task_ids"])
    if bb:
        assert bb["status"] == "decided"


def test_delegate_and_human_only_refusal(client):
    refs = _pick(client)
    r = client.post(f"/agentic/levels/{refs[5]}/delegate", json={"persona": "operations_manager"})
    assert r.status_code == 400
    r = client.post(f"/agentic/levels/{refs[2]}/delegate", json={"persona": "operations_manager", "by": "Ops"})
    assert r.status_code == 200, r.text
    assert item(client, refs[2])["status"] == "provisional"


def test_agents_registry(client):
    ag = client.get("/agentic/agents").json()
    keys = {a["key"] for a in ag}
    assert {"sentinel", "investigator", "memory", "orchestrator", "risk_triage", "deadline_guardian", "escalation",
            "briefing_writer", "assistant", "sim_narrator"} <= keys
    for a in ag:
        assert a["where"] and a["autonomy"] in ("suggests", "acts with approval", "acts at deadline") and a["saves"]
