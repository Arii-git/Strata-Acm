"""Simulation Lab (night build, sim-lab lane): scenario library coverage, determinism, honesty labels and the
'with STRATA never recovers later than without' property. All outcomes are scripted counterfactuals."""
import math
from collections import Counter

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from strata_engine import simulation as sim

STAGE_KEYS = {"observe", "detect", "investigate", "remember", "act", "learn"}


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    app.include_router(sim.router)
    return TestClient(app)


def test_catalog_coverage(client):
    cat = client.get("/sim/catalog").json()
    assert len(cat["industries"]) >= 6
    assert len(cat["categories"]) >= 10
    assert len(cat["scenarios"]) >= 40
    by_ind = Counter(s["industry"] for s in cat["scenarios"])
    for ind in cat["industries"]:
        assert by_ind[ind["key"]] >= 6, ind["key"]
        assert ind["count"] == by_ind[ind["key"]]
    used = {s["category"] for s in cat["scenarios"]}
    assert len(used) >= 10
    assert used <= {c["key"] for c in cat["categories"]}
    ids = [s["id"] for s in cat["scenarios"]]
    assert len(ids) == len(set(ids))
    for s in cat["scenarios"]:
        assert s["title"] and s["one_liner"] and s["trigger"]
        assert 12 <= s["horizon_weeks"] <= 26
        assert 1 <= s["start_level"] <= s["peak_level"] <= 5
    assert cat["provenance"] == "illustrative"


def test_pharma_matches_dataset_industry(client):
    cat = client.get("/sim/catalog").json()
    assert any(i["key"] == "pharma" for i in cat["industries"])
    assert any(s["industry"] == "pharma" and s["category"] == "supplier_failure" for s in cat["scenarios"])


def test_run_is_deterministic_for_same_seed(client):
    body = {"scenario_id": "pharma-cyclone-chennai", "seed": 7}
    a = client.post("/sim/run", json=body).json()
    b = client.post("/sim/run", json=body).json()
    assert a == b
    c = client.post("/sim/run", json={**body, "seed": 8}).json()
    assert c["series"]["with_strata"] != a["series"]["with_strata"]  # noise depends on the seed
    assert c["kpis"] == a["kpis"]  # summary numbers come from the noise-free declared model


@pytest.mark.parametrize("sid", [s["id"] for s in sim.SCENARIOS])
@pytest.mark.parametrize("decision", sim.DECISIONS)
def test_with_strata_recovers_no_later_and_covers_loop(sid, decision):
    r = sim.run(sid, decision=decision)
    k = {x["key"]: x for x in r["kpis"]}
    inf = math.inf
    rw = k["weeks_to_recover"]["with"]
    rwo = k["weeks_to_recover"]["without"]
    assert (inf if rw is None else rw) <= (inf if rwo is None else rwo), (sid, decision, rw, rwo)
    assert k["days_to_detect"]["with"] < k["days_to_detect"]["without"]
    assert abs(k["peak_impact"]["with"]) <= abs(k["peak_impact"]["without"]) + 1e-9
    stages = {e["stage"] for e in r["events"] if e["track"] != "without"}
    assert STAGE_KEYS <= stages, (sid, STAGE_KEYS - stages)
    assert r["timeline"]["action_day_with"] < r["timeline"]["action_day_without"]


def test_provenance_and_caption_everywhere():
    r = sim.run("food-reefer-breakdown")
    assert r["provenance"] == "illustrative"
    assert "not a measured result" in r["caption"]
    for k in r["kpis"]:
        assert k["provenance"] == "illustrative" and k["caption"]
    for b in r["branches"].values():
        assert b["provenance"] == "illustrative"


def test_series_shapes_and_baseline():
    r = sim.run("log-tms-outage", horizon_weeks=12)
    assert set(r["series"]) == {"baseline", "without_strata", "with_strata"}
    n = len(r["series"]["baseline"]["revenue"])
    for traj in r["series"].values():
        for kpi in ("revenue", "service_level", "backlog", "complaints", "dso", "cost_to_serve"):
            assert len(traj[kpi]) == n
    # day resolution for the first two weeks
    xs = [p[0] for p in r["series"]["with_strata"]["backlog"]]
    assert xs[:15] == [round(d / 7, 3) for d in range(15)]
    assert xs[-1] == 12.0
    assert len(r["weeks"]) == 12


def test_human_gate_follows_policy():
    for s in sim.SCENARIOS:
        r = sim.run(s["id"])
        g = r["gate"]
        assert g["level"] >= sim.POLICY["human_threshold"]
        assert {o["key"] for o in g["options"]} == set(sim.DECISIONS)
        if g["level"] >= 4:
            assert g["mode"] == "human_only"
        elif g["level"] >= 2 and not r["scenario"]["regulatory"]:
            assert g["mode"] == "provisional"
        if r["scenario"]["regulatory"]:
            assert g["required_role"] == "qa_head" and g["mode"] == "human_only"


def test_branches_share_prefix_and_differ_after_gate():
    sid = "fmcg-laminate-fire"
    runs = {d: sim.run(sid, decision=d) for d in sim.DECISIONS}
    gate_day = runs["approve"]["gate"]["day"]
    def strip(e):
        return {**e, "decision": {**e["decision"], "chosen": None}} if e.get("decision") else e
    pre = [[strip(e) for e in r["events"] if e["day"] <= gate_day and e["track"] != "without"] for r in runs.values()]
    assert pre[0] == pre[1] == pre[2]
    act = {d: r["timeline"]["action_day_with"] for d, r in runs.items()}
    assert act["approve"] < act["wait"]
    assert runs["escalate"]["branches"]["escalate"]["extra_cost_pct"] > 0
    # the agent's provisional decision only appears when the human waits and policy allows it
    kinds_wait = {e["kind"] for e in runs["wait"]["events"] if e.get("branch") == "wait"}
    assert "auto_decision" in kinds_wait or "escalation" in kinds_wait


def test_quality_scenarios_are_route_only():
    for s in sim.SCENARIOS:
        if s["category"] != "quality_recall":
            continue
        r = sim.run(s["id"], decision="wait")
        assert r["gate"]["required_role"] == "qa_head"
        assert not [e for e in r["events"] if e["kind"] == "auto_decision" and e.get("side_level") is None]


def test_unknown_scenario_404(client):
    assert client.post("/sim/run", json={"scenario_id": "nope"}).status_code == 404
    assert client.get("/sim/scenarios/nope").status_code == 404
    assert client.get("/sim/compare", params={"category": "nope"}).status_code == 404


def test_compare_and_detail(client):
    d = client.get("/sim/scenarios/pharma-batch-complaints").json()
    assert d["regulatory"] is True and d["playbook"] and d["provenance"] == "illustrative"
    c = client.get("/sim/compare", params={"category": "natural_disaster"}).json()
    assert len({r["industry"] for r in c["rows"]}) >= 4
    assert c["provenance"] == "illustrative"
