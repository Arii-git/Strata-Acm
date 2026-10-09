"""Metric dictionary (A24, lane L6): config/metrics.yaml is complete, well-formed and consistent with the
signal catalog and config/terms.ts. The /metrics/dictionary endpoint serves it unchanged."""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ("id", "name", "unit", "formula", "good_direction", "compare", "implies", "action", "provenance")
DIRECTIONS = {"up", "down", "neither"}
PROVENANCE = {"computed", "synthetic", "illustrative", "assumption"}
PAGE_METRICS = [
    "risk_score", "n_sources", "value_at_stake", "silent_period_days", "cause_confidence", "similarity", "blast_radius_count",
    "signals_checked", "need_you", "opportunities_count", "qa_routed", "health_index", "customer_health", "supply_continuity",
    "service_quality", "field_coverage", "commercial_momentum", "open_problems", "critical_high", "approvals_waiting",
    "oldest_wait_hours", "time_to_action_median", "manual_baseline_minutes", "tta_n", "precision", "recall", "root_cause_acc",
    "false_alarms", "outcome_before", "outcome_after", "value_12w", "tasks_open", "routines_approved", "memory_items",
    "memory_drafts", "audit_rows", "feeds_fresh", "if_corroborated",
]


def _items() -> list[dict]:
    items = yaml.safe_load((ROOT / "config" / "metrics.yaml").read_text(encoding="utf-8"))
    assert isinstance(items, list) and items, "metrics.yaml must be a non-empty YAML list"
    return items


def _term_keys() -> set[str]:
    ts = (ROOT / "config" / "terms.ts").read_text(encoding="utf-8")
    return set(re.findall(r"^\s*(\w+): \{ term:", ts, flags=re.M))


def test_every_entry_has_required_fields_and_valid_enums():
    seen = set()
    for it in _items():
        for f in REQUIRED:
            assert isinstance(it.get(f), str) and it[f].strip(), (it.get("id"), f)
        assert re.fullmatch(r"[a-z0-9_]+", it["id"]), it["id"]
        assert it["id"] not in seen, f"duplicate id {it['id']}"
        seen.add(it["id"])
        assert it["good_direction"] in DIRECTIONS, (it["id"], it["good_direction"])
        assert it["provenance"] in PROVENANCE, (it["id"], it["provenance"])


def test_every_catalog_signal_is_present():
    cat = yaml.safe_load((ROOT / "contracts" / "signal_catalog.yaml").read_text(encoding="utf-8"))
    ids = {it["id"] for it in _items()}
    missing = [s["key"] for s in cat["signals"] if s["key"] not in ids]
    assert not missing, f"signals missing from config/metrics.yaml: {missing}"


def test_page_metrics_are_present():
    ids = {it["id"] for it in _items()}
    missing = [m for m in PAGE_METRICS if m not in ids]
    assert not missing, f"page metrics missing from config/metrics.yaml: {missing}"


def test_terms_resolve_and_stay_short():
    keys = _term_keys()
    assert len(keys) >= 20
    for it in _items():
        if it.get("term"):
            assert it["term"] in keys, (it["id"], it["term"])
    ts = (ROOT / "config" / "terms.ts").read_text(encoding="utf-8")
    for k, text in re.findall(r'^\s*(\w+): \{ term: "[^"]+", text: "([^"]+)"', ts, flags=re.M):
        assert len(text.split()) <= 40, (k, len(text.split()))


def test_honest_labels():
    by = {it["id"]: it for it in _items()}
    assert by["manual_baseline_minutes"]["provenance"] == "illustrative"
    assert by["outcome_after"]["provenance"] == "illustrative"
    assert by["silent_period_days"]["provenance"] == "assumption"
    assert "not a forecast" in by["value_at_stake"]["implies"]


def test_endpoint_serves_the_file():
    from fastapi.testclient import TestClient

    from strata_engine.app import app
    r = TestClient(app).get("/metrics/dictionary")
    assert r.status_code == 200
    assert [it["id"] for it in r.json()["items"]] == [it["id"] for it in _items()]
