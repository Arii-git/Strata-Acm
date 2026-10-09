"""Digest (night build, home-briefing lane): a computed "what happened" summary for the Home page.

GET /digest?persona=&period=today|yesterday|week[&since=ISO]

Every number is recomputed from engine state on each call, relative to the simulated clock:
- incidents (Sentinel detections; estimated onset dates, workflow stage), plans and approvals (state store),
- the audit log (`at` = simulated time; `wall_at` = real time, used only for "since your last visit"),
- the synthetic source tables (orders, complaints, support tickets).
Nothing is typed in by hand and no LLM is involved: headline and highlight sentences are templates filled
with the computed values. Each number carries `provenance` and a one-line `meaning`.

Windows (all end at the simulated clock `sim_clock()`):
- today     = the last 24 hours,
- yesterday = the 24 hours before that,
- week      = the last 7 days.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["digest"])

Period = Literal["today", "yesterday", "week"]
PERIOD_LABEL = {"today": "Today", "yesterday": "Yesterday", "week": "Last 7 days"}
SERIES_DAYS = 14
MISSED_MAX = 10
HIGHLIGHTS_MAX = 4

# Loop stages shown on Home, mapped from the case-workflow stages in taxonomy.py.
PIPELINE: list[tuple[str, str, tuple[str, ...], str, str]] = [
    ("detected", "Detected", ("detected",), "/app/problems",
     "Flagged by Sentinel; nobody has investigated yet."),
    ("investigating", "Investigating", ("investigating",), "/app/incidents",
     "An investigation is running right now."),
    ("plan_proposed", "Plan proposed", ("plan_ready",), "/app/problems",
     "Investigated; a plan is drafted or must be redrafted after a rejection."),
    ("awaiting_approval", "Awaiting approval", ("awaiting_approval",), "/app/approvals",
     "A plan waits for the role allowed to approve it."),
    ("acting", "Acting", ("in_progress",), "/app/workflows",
     "Approved; simulated tasks are running."),
    ("resolved", "Resolved", ("outcome_recorded", "learned"), "/app/outcomes",
     "Outcome recorded (and, once learned, written back to memory)."),
]


# ------------------------------------------------------------------ helpers
def _app():  # lazy: app.py mounts this module at import time
    from . import app as _a
    return _a


def _local_naive(dt: datetime) -> datetime:
    """Sim time is tz-aware (IST); the source tables store naive local timestamps. Compare in local naive time."""
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def window(period: str, now: datetime) -> tuple[datetime, datetime]:
    """(start, end] in local naive sim time."""
    end = _local_naive(now)
    if period == "today":
        return end - timedelta(hours=24), end
    if period == "yesterday":
        return end - timedelta(hours=48), end - timedelta(hours=24)
    if period == "week":
        return end - timedelta(days=7), end
    raise ValueError(period)


def _in(ts: pd.Series, start: datetime, end: datetime) -> pd.Series:
    t = pd.to_datetime(ts)
    return (t > pd.Timestamp(start)) & (t <= pd.Timestamp(end))


def _parse_at(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return _local_naive(datetime.fromisoformat(str(s).replace("Z", "+00:00")))
    except ValueError:
        return None


def _parse_wall(s: str | None) -> datetime | None:
    """Wall-clock instants are compared in UTC (tz-aware)."""
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def fmt_inr(v: float) -> str:
    a = abs(v)
    sign = "-" if v < 0 else ""
    if a >= 1e7:
        return f"{sign}₹{a / 1e7:.1f} Cr"
    if a >= 1e5:
        return f"{sign}₹{a / 1e5:.1f} L"
    if a >= 1e3:
        return f"{sign}₹{a / 1e3:.1f} K"
    return f"{sign}₹{a:.0f}"


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


# ------------------------------------------------------------------ computations (each one recomputable in tests)
def visible_incidents(persona: str) -> list[Any]:
    a = _app()
    return [i for i in a.E().det.incidents if a.visible_to(i, persona)]


def open_risks(persona: str) -> list[dict[str, Any]]:
    """Open (not resolved or dismissed) risk items visible to the role, with exposure. Same rule as /briefing."""
    a = _app()
    return [a.summary(i) for i in visible_incidents(persona)
            if i.kind == "risk" and a.inc_state(i.ref).get("status") not in ("resolved", "dismissed")]


def new_problems(persona: str, start: datetime, end: datetime) -> list[Any]:
    """Visible incidents whose estimated onset date falls in (start, end]."""
    out = []
    for i in visible_incidents(persona):
        on = _parse_at(i.onset)
        if on is not None and start < on <= end:
            out.append(i)
    return out


def plans_waiting(persona: str) -> list[dict[str, Any]]:
    a = _app()
    vis = {i.ref for i in visible_incidents(persona)}
    return [p for p in a.state.all_("plans") if p.get("status") == "awaiting_approval" and p.get("incident_id") in vis]


def count_rows(table: str, col: str, start: datetime, end: datetime) -> int:
    df = _app().E().t[table]
    return int(_in(df[col], start, end).sum())


def order_value(first_day: date, last_day: date) -> float:
    """Orders carry a date only, so they are summed over whole calendar days [first_day, last_day]."""
    o = _app().E().t["orders"]
    d = pd.to_datetime(o["order_date"]).dt.date
    return float(o.loc[(d >= first_day) & (d <= last_day), "value"].sum())


def full_days(now: datetime, days: int) -> tuple[date, date]:
    """The `days` complete calendar days before the sim day (today is still in progress)."""
    last = _local_naive(now).date() - timedelta(days=1)
    return last - timedelta(days=days - 1), last


def decisions(persona: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Human plan decisions recorded in the audit log with simulated time in (start, end]."""
    a = _app()
    vis = {i.ref for i in visible_incidents(persona)}
    out = []
    for r in a.state.audit_rows():
        if r["action"] not in ("plan.approved", "plan.modified", "plan.rejected"):
            continue
        at = _parse_at(r["at"])
        if at is None or not (start < at <= end):
            continue
        inc = (r["detail"] or {}).get("incident")
        if inc and inc not in vis:
            continue
        out.append(r)
    return out


def outcomes_recorded(persona: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    vis = {i.ref for i in visible_incidents(persona)}
    out = []
    for o in _app().state.all_("outcomes"):
        at = _parse_at(o.get("measured_at"))
        if o.get("incident_id") in vis and at is not None and start < at <= end:
            out.append(o)
    return out


def pipeline_counts(persona: str) -> list[dict[str, Any]]:
    a = _app()
    stages = []
    for i in visible_incidents(persona):
        st = a.inc_state(i.ref)
        if st.get("status") == "dismissed":
            continue
        stg = "investigating" if st.get("status") == "investigating" else a.classify(i, st)["stage"]
        stages.append(stg)
    return [{"stage": key, "label": label, "count": sum(1 for s in stages if s in keys), "href": href, "meaning": meaning,
             "provenance": "computed"} for key, label, keys, href, meaning in PIPELINE]


def daily_series(now: datetime, days: int = SERIES_DAYS) -> list[dict[str, Any]]:
    """Per-day totals for the `days` complete calendar days before the sim day (zero-filled)."""
    e = _app().E()
    first_day, end_day = full_days(now, days)
    days_list = [first_day + timedelta(days=k) for k in range(days)]

    def per_day(df: pd.DataFrame, col: str, value: str | None = None) -> list[list[Any]]:
        d = pd.to_datetime(df[col]).dt.date
        m = (d >= days_list[0]) & (d <= end_day)
        g = (df.loc[m, value].groupby(d[m]).sum() if value else d[m].value_counts())
        return [[x.isoformat(), round(float(g.get(x, 0)), 2) if value else int(g.get(x, 0))] for x in days_list]

    return [
        {"name": "Order value per day", "key": "order_value", "unit": "INR", "provenance": "computed",
         "meaning": "Sum of order value booked each full day, from the orders feed (synthetic data).",
         "points": per_day(e.t["orders"], "order_date", "value")},
        {"name": "Support tickets per day", "key": "tickets", "unit": "tickets", "provenance": "computed",
         "meaning": "Support tickets opened each day, all accounts.",
         "points": per_day(e.t["support_interactions"], "opened_at")},
        {"name": "Complaints per day", "key": "complaints", "unit": "complaints", "provenance": "computed",
         "meaning": "Complaints opened each day, all accounts.",
         "points": per_day(e.t["complaints"], "opened_at")},
    ]


def missed_events(persona: str, since: datetime) -> list[dict[str, Any]]:
    """Classified events (same list as /events) written after `since` (wall clock), newest first."""
    a = _app()
    vis = {i.ref for i in visible_incidents(persona)}
    out = []
    for ev in a.build_events():
        w = _parse_wall(ev.get("wall_at"))
        if w is None or w <= since:
            continue
        if ev.get("incident") and ev["incident"] not in vis:
            continue
        out.append({"id": ev["id"], "text": ev["text"], "at": ev["wall_at"], "sim_at": ev["at"], "href": ev.get("link") or "/app/briefing",
                    "type": ev["type"], "label": ev["label"], "incident": ev.get("incident")})
    out.sort(key=lambda x: x["id"], reverse=True)
    return out


# ------------------------------------------------------------------ assembly
def _num(id_: str, label: str, value: float, unit: str, meaning: str, *, previous: float | None = None,
         href: str | None = None, provenance: str = "computed") -> dict[str, Any]:
    return {"id": id_, "label": label, "value": value, "unit": unit, "provenance": provenance, "meaning": meaning,
            "previous": previous, "href": href}


def build_digest(persona: str, period: str, since: datetime | None = None) -> dict[str, Any]:
    a = _app()
    now = a.sim_clock()
    start, end = window(period, now)
    span = end - start
    p_start, p_end = start - span, start  # the same-length window just before, for comparisons

    risks = open_risks(persona)
    waiting = plans_waiting(persona)
    new = new_problems(persona, start, end)
    new_prev = new_problems(persona, p_start, p_end)
    compl = count_rows("complaints", "opened_at", start, end)
    compl_prev = count_rows("complaints", "opened_at", p_start, p_end)
    tick = count_rows("support_interactions", "opened_at", start, end)
    tick_prev = count_rows("support_interactions", "opened_at", p_start, p_end)
    dec = decisions(persona, start, end)
    outs = outcomes_recorded(persona, start, end)
    exposure = round(sum(r["value_at_stake"] for r in risks), 2)

    numbers: list[dict[str, Any]] = []
    if period == "today":
        numbers += [
            _num("open_problems", "Open problems", len(risks), "items",
                 "Risk items visible to your role that are not yet resolved.", href="/app/problems"),
            _num("value_at_stake", "Exposure", exposure, "INR",
                 "Normal 12-week order value of the customers behind those problems: money at risk, not a predicted loss.",
                 href="/app/problems"),
            _num("approvals_waiting", "Plans waiting", len(waiting), "plans",
                 "Plans STRATA drafted that wait for a person to approve, change or reject.", href="/app/approvals"),
        ]
    numbers += [
        _num("new_problems", "New problems", len(new), "items",
             "Problems whose estimated start date falls in this period.", previous=len(new_prev), href="/app/problems"),
        _num("tickets_opened", "Support tickets", tick, "tickets",
             "Support tickets opened in this period, all accounts.", previous=tick_prev, href="/app/health"),
        _num("complaints_opened", "Complaints", compl, "complaints",
             "Complaints opened in this period, all accounts.", previous=compl_prev, href="/app/health"),
    ]
    if period != "today":
        numbers.append(_num("decisions_made", "Decisions", len(dec), "decisions",
                            "Plans a person approved, changed or rejected in this period.", href="/app/audit"))
    if period == "week":
        f0, f1 = full_days(now, 7)
        ov, ov_prev = order_value(f0, f1), order_value(f0 - timedelta(days=7), f0 - timedelta(days=1))
        numbers.append(_num("order_value", "Order value", round(ov, 2), "INR",
                            "Order value booked in the 7 full days before today, all accounts (synthetic data).",
                            previous=round(ov_prev, 2), href="/app/health"))
        numbers.append(_num("outcomes_recorded", "Outcomes recorded", len(outs), "outcomes",
                            "Results written back after a plan ran (Lab outcomes are illustrative).", href="/app/outcomes"))

    # headline: a template filled with the numbers above (no free text, no LLM)
    if period == "today":
        if risks:
            headline = (f"{_plural(len(risks), 'open problem')} for your role, with {fmt_inr(exposure)} of order value exposed. "
                        f"{_plural(len(waiting), 'plan')} {'waits' if len(waiting) == 1 else 'wait'} for approval.")
        else:
            headline = f"Nothing is open for your role right now. {_plural(len(waiting), 'plan')} {'waits' if len(waiting) == 1 else 'wait'} for approval."
    elif period == "yesterday":
        headline = (f"Yesterday: {_plural(len(new), 'new problem')}, {_plural(tick, 'support ticket')}, "
                    f"{_plural(compl, 'complaint')} and {_plural(len(dec), 'decision')}.")
    else:
        ov = next(n["value"] for n in numbers if n["id"] == "order_value")
        ovp = next(n["previous"] for n in numbers if n["id"] == "order_value")
        trend = "" if not ovp else f" ({(ov / ovp - 1) * 100:+.0f}% vs the week before)"
        headline = f"Last 7 days: {_plural(len(new), 'new problem')} and {fmt_inr(ov)} of orders{trend}."

    # highlights: new problems first (by rank), then decisions; for today, the top open priority
    by_rank = sorted(new, key=lambda i: -a.summary(i)["rank_score"])
    highlights: list[dict[str, Any]] = []
    for i in by_rank:
        highlights.append({"text": f"New: {i.title}", "href": f"/app/incidents/{i.ref}", "ref": i.ref, "severity": i.severity,
                           "evidence_ids": [s.id for s in i.evidence[:3]]})
    for r in dec:
        inc = (r["detail"] or {}).get("incident")
        verb = r["action"].split(".")[1]
        highlights.append({"text": f"{r['actor']} {verb} plan {r['entity_id']}" + (f" for {inc}" if inc else ""),
                           "href": f"/app/incidents/{inc}" if inc else "/app/audit", "ref": inc, "severity": None,
                           "evidence_ids": [f"AUDIT-{r['id']}"]})
    if period == "today" and risks:
        top = max(risks, key=lambda r: r["rank_score"])
        if not any(h.get("ref") == top["ref"] for h in highlights):
            inc = a.E().by_ref[top["ref"]]
            highlights.insert(0, {"text": f"Top priority: {top['title']}", "href": f"/app/incidents/{top['ref']}", "ref": top["ref"],
                                  "severity": top["severity"], "evidence_ids": [s.id for s in inc.evidence[:3]]})
    highlights = highlights[:HIGHLIGHTS_MAX]

    if since is None:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
    missed_all = missed_events(persona, since)

    return {
        "persona": persona, "period": period, "label": PERIOD_LABEL[period], "headline": headline,
        "as_of": now.isoformat(), "window": {"start": start.isoformat(), "end": end.isoformat()},
        "numbers": numbers, "highlights": highlights,
        "missed": missed_all[:MISSED_MAX], "missed_total": len(missed_all), "since": since.isoformat(),
        "pipeline": pipeline_counts(persona), "series": daily_series(now),
        "provenance": "computed",
        "note": "All values are computed from the synthetic dataset and the engine's own records on each request.",
    }


@router.get("/digest")
def digest(persona: str = "operations_manager", period: Period = "today",
           since: str | None = Query(None, description="ISO time of the user's last visit (wall clock); default 24 h ago")) -> dict[str, Any]:
    s = None
    if since:
        s = _parse_wall(since)
        if s is None:
            raise HTTPException(400, "since must be an ISO-8601 timestamp")
    return build_digest(persona, period, s)
