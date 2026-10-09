"""Digest (/digest): shape, period filtering, and that every number is recomputable from engine state."""
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from strata_engine import digest as dg
from strata_engine.app import E, app, sim_clock, state, visible_to

client = TestClient(app)
PERIODS = ("today", "yesterday", "week")
PROVENANCE = {"computed", "synthetic", "illustrative", "assumption"}


def get(**params):
    r = client.get("/digest", params=params)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("period", PERIODS)
def test_shape(period):
    d = get(persona="operations_manager", period=period)
    for k in ("period", "label", "headline", "numbers", "highlights", "missed", "pipeline", "series"):
        assert k in d, k
    assert d["period"] == period and d["headline"].strip()
    assert d["numbers"], "every period has numbers"
    for n in d["numbers"]:
        assert {"id", "label", "value", "unit", "provenance", "meaning"} <= set(n), n
        assert n["provenance"] in PROVENANCE and n["meaning"].strip()
        assert isinstance(n["value"], (int, float))
    for h in d["highlights"]:
        assert {"text", "href", "evidence_ids"} <= set(h) and h["href"].startswith("/app")
        assert isinstance(h["evidence_ids"], list) and h["evidence_ids"]
    for m in d["missed"]:
        assert {"text", "at", "href"} <= set(m)
    assert [p["stage"] for p in d["pipeline"]] == ["detected", "investigating", "plan_proposed", "awaiting_approval", "acting", "resolved"]
    assert 1 <= len(d["series"]) <= 3
    for s in d["series"]:
        assert len(s["points"]) == dg.SERIES_DAYS
        assert all(isinstance(p[0], str) and isinstance(p[1], (int, float)) for p in s["points"])


def test_bad_inputs():
    assert client.get("/digest", params={"period": "month"}).status_code == 422
    assert client.get("/digest", params={"since": "not-a-date"}).status_code == 400


def test_windows_are_adjacent_and_end_at_sim_clock():
    now = dg._local_naive(sim_clock())
    t0, t1 = dg.window("today", now)
    y0, y1 = dg.window("yesterday", now)
    w0, w1 = dg.window("week", now)
    assert t1 == now and t1 - t0 == timedelta(hours=24)
    assert y1 == t0 and y1 - y0 == timedelta(hours=24)
    assert w1 == now and w1 - w0 == timedelta(days=7)


def _recount(table: str, col: str, start: datetime, end: datetime) -> int:
    t = pd.to_datetime(E().t[table][col])
    return int(((t > pd.Timestamp(start)) & (t <= pd.Timestamp(end))).sum())


@pytest.mark.parametrize("period", PERIODS)
def test_numbers_are_recomputable(period):
    persona = "operations_manager"
    d = get(persona=persona, period=period)
    nums = {n["id"]: n for n in d["numbers"]}
    start, end = dg.window(period, sim_clock())
    span = end - start

    assert nums["tickets_opened"]["value"] == _recount("support_interactions", "opened_at", start, end)
    assert nums["tickets_opened"]["previous"] == _recount("support_interactions", "opened_at", start - span, start)
    assert nums["complaints_opened"]["value"] == _recount("complaints", "opened_at", start, end)

    onsets = [i for i in E().det.incidents if visible_to(i, persona) and i.onset
              and start < datetime.fromisoformat(i.onset) <= end]
    assert nums["new_problems"]["value"] == len(onsets)

    if period == "today":
        open_ = [i for i in E().det.incidents if i.kind == "risk" and visible_to(i, persona)
                 and (state.get("incident_state", i.ref) or {}).get("status") not in ("resolved", "dismissed")]
        assert nums["open_problems"]["value"] == len(open_)
        assert nums["value_at_stake"]["value"] == pytest.approx(sum(round(i.value_at_stake, 2) for i in open_), abs=0.05)
    if period == "week":
        # orders are date-only: the 7 full calendar days before the sim day, vs the 7 before those
        o = E().t["orders"]
        od = pd.to_datetime(o["order_date"]).dt.date
        last = sim_clock().date() - timedelta(days=1)
        m = (od > last - timedelta(days=7)) & (od <= last)
        mp = (od > last - timedelta(days=14)) & (od <= last - timedelta(days=7))
        assert nums["order_value"]["value"] == pytest.approx(float(o.loc[m, "value"].sum()), abs=0.05)
        assert nums["order_value"]["previous"] == pytest.approx(float(o.loc[mp, "value"].sum()), abs=0.05)


def test_periods_filter_differently():
    """The week window contains today's window, so its counts are never smaller."""
    today = {n["id"]: n["value"] for n in get(period="today")["numbers"]}
    week = {n["id"]: n["value"] for n in get(period="week")["numbers"]}
    for k in ("tickets_opened", "complaints_opened", "new_problems"):
        assert week[k] >= today[k], k
    assert week["tickets_opened"] > today["tickets_opened"]  # synthetic data has tickets on most days


def test_pipeline_counts_cover_every_visible_open_case():
    persona = "business_head"
    d = get(persona=persona, period="today")
    total = sum(p["count"] for p in d["pipeline"])
    expected = [i for i in E().det.incidents if visible_to(i, persona)
                and (state.get("incident_state", i.ref) or {}).get("status") != "dismissed"]
    assert total == len(expected)


def test_series_recomputable():
    d = get(period="today")
    s = next(x for x in d["series"] if x["key"] == "tickets")
    day = s["points"][-1][0]
    t = pd.to_datetime(E().t["support_interactions"]["opened_at"]).dt.date
    assert s["points"][-1][1] == int((t == datetime.fromisoformat(day).date()).sum())
    assert day == (sim_clock().date() - timedelta(days=1)).isoformat()  # last full day; today is in progress


def test_missed_respects_since():
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert get(since=future)["missed"] == []
    past = (datetime.now(timezone.utc) - timedelta(days=3650)).isoformat()
    d = get(since=past, persona="business_head")
    assert d["missed_total"] >= len(d["missed"])
    # E() has run, so Sentinel wrote one incident.detected audit row per incident
    assert d["missed_total"] >= len(E().det.incidents)
    ids = [m["id"] for m in d["missed"]]
    assert ids == sorted(ids, reverse=True)


def test_persona_scoping():
    qa = {n["id"]: n["value"] for n in get(persona="qa_head")["numbers"]}
    bh = {n["id"]: n["value"] for n in get(persona="business_head")["numbers"]}
    assert qa["open_problems"] <= bh["open_problems"]
