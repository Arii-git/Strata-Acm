"""Gate tests (keyless, FileStore). Numbers are recomputed from generated data, never hard-coded in the engine."""
import json
from pathlib import Path

import pandas as pd
import pytest
import yaml
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
TARGET = yaml.safe_load((ROOT / "contracts" / "scenarios.yaml").read_text(encoding="utf-8"))["hero_numbers_target"]


@pytest.fixture(scope="module")
def det():
    from strata_engine.detect import evaluate
    d = ROOT / "data" / "store" / "seed_dev"
    return evaluate({p.stem: pd.read_pickle(p) for p in d.glob("*.pkl")}), json.loads((d / "eval_labels.json").read_text())


@pytest.fixture(scope="module")
def client():
    from strata_engine.app import app
    c = TestClient(app)
    c.post("/lab/reset")
    return c


def test_hero_deltas_within_tolerance(det):
    d, _ = det
    sig = {s.signal_key: s.delta for s in d.acc_sigs[TARGET["account_id"]]}
    for key, tgt in [("order_volume_delta", "orders_delta"), ("complaint_count_delta", "complaints_delta"),
                     ("response_time_delta", "response_time_delta"), ("interaction_frequency_delta", "interaction_delta")]:
        assert abs(sig[key] - TARGET[tgt]) <= TARGET["tolerance_abs"], (key, sig[key])


def test_hero_critical_four_sources(det):
    d, _ = det
    inc = next(i for i in d.incidents if i.account_id == 4821)
    assert inc.severity == "critical" and inc.n_sources >= 4 and inc.risk_score >= TARGET["risk_score_min"]
    assert len(inc.blast) == 6


def test_decoys_silent_and_region_single(det):
    d, lab = det
    s12 = next(x for x in lab["labels"] if x["scenario"] == "S12")["keys"]
    assert not [i for i in d.incidents if i.account_id in s12]
    assert len([i for i in d.incidents if i.scope == "region"]) == 1
    assert not [i for i in d.incidents if i.cause == "seasonal"] if hasattr(d.incidents[0], "cause") else True


def test_single_source_never_above_elevated(det):
    d, _ = det
    for i in d.incidents:
        if i.n_sources < 3 and not i.regulatory_sensitive:
            assert i.severity in ("healthy", "watch", "elevated")


def test_regulatory_routed_to_qa(det):
    d, _ = det
    qa = [i for i in d.incidents if i.regulatory_sensitive]
    assert len(qa) >= 2 and all(i.owner_role == "qa_head" for i in qa)


def test_hero_investigation_grounded(client):
    r = client.post("/incidents/INC-2026-0001/investigate").json()
    assert r["cause"] == "supplier_delay"
    assert r["memory_matches"][0]["ref"] == "INC-017"
    assert r["grounding_ok"] is True and all(s["evidence_ids"] for s in r["narrative"])


def test_reject_requires_reason_and_four_eyes(client):
    inc = client.get("/incidents/INC-2026-0001").json()
    pid = inc["plan"]["id"]
    assert client.post(f"/plans/{pid}/decision", json={"decision": "rejected", "persona": "operations_manager", "decided_by": "A"}).status_code == 400
    qa_ref = next(i["ref"] for i in client.get("/incidents").json()["items"] if i["regulatory_sensitive"])
    client.post(f"/incidents/{qa_ref}/investigate")
    qpid = client.get(f"/incidents/{qa_ref}").json()["plan"]["id"]
    assert client.post(f"/plans/{qpid}/decision", json={"decision": "approved", "persona": "operations_manager", "decided_by": "A"}).status_code == 403
    r1 = client.post(f"/plans/{qpid}/decision", json={"decision": "approved", "persona": "qa_head", "decided_by": "QA One"})
    assert r1.status_code == 200 and r1.json()["tasks_created"] == 0
    assert client.post(f"/plans/{qpid}/decision", json={"decision": "approved", "persona": "qa_head", "decided_by": "QA One"}).status_code == 400
    r2 = client.post(f"/plans/{qpid}/decision", json={"decision": "approved", "persona": "qa_head", "decided_by": "QA Two"}).json()
    assert r2["tasks_created"] > 0


def test_full_loop_and_audit_chain(client):
    from strata_engine import state
    pid = client.get("/incidents/INC-2026-0001").json()["plan"]["id"]
    r = client.post(f"/plans/{pid}/decision", json={"decision": "approved", "persona": "operations_manager", "decided_by": "Tester"}).json()
    assert r["tasks_created"] > 0
    tasks = client.get("/workflows").json()["items"]
    assert tasks and all(t["simulated"] for t in tasks)
    adv = client.post("/lab/advance", json={"days": 14}).json()
    assert "OUT-INC-2026-0001" in adv["memory_written"]
    assert all(o["provenance"] == "illustrative" for o in client.get("/outcomes").json()["items"])
    assert client.get("/time-to-action").json()["n"] >= 1
    assert state.verify_chain()["ok"]
    state._C.execute("update audit_log set actor='tampered' where id=(select min(id) from audit_log)")
    state._C.commit()
    assert state.verify_chain()["ok"] is False


def test_routines_and_notes(client):
    client.post("/lab/reset")
    for rid in ("RT01", "RT02", "RT03", "RT04"):
        client.post(f"/routines/{rid}/approve", json={"persona": "operations_manager", "decided_by": "Tester"})
    runs = client.post("/routines/tick").json()["runs"]
    assert {r["routine_id"] for r in runs if r["outputs"]} == {"RT01", "RT02", "RT03", "RT04"}
    client.post("/notes", json={"author_role": "account_manager", "author": "AM", "body": "Please call back @support_manager", "mentions": []})
    b = client.get("/briefing?persona=support_manager").json()
    assert b["notes_for_you"]


def test_notebook_rejects_ai_and_empty(client):
    assert client.post("/notebook", json={"author": "", "tried": "", "happened": ""}).status_code == 400
    assert client.post("/notebook", json={"author": "Strata", "tried": "x", "happened": "y"}).status_code == 400
