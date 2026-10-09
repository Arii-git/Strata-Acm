"""Agentic risk levels (1-5), decision deadlines and the Deadline Guardian.

Owner's spec (Arihant): classify every open case into a risk level from 1 to 5 (default 2). Multiple "act now"
alerts raise the level; from level 2 a human is brought in immediately. The business head (top of the hierarchy)
sets a decision deadline per level. If nobody decides before the deadline, the agent takes the decision it is
allowed to take and explains it.

LEVELS
    1 Low · 2 Moderate (DEFAULT when unsure) · 3 Elevated · 4 High · 5 Critical

RISK TRIAGE (deterministic, every rule writes a plain-language line into `reasons[]`)
    base     detection severity: watch -> 1, elevated -> 2, high -> 3, critical -> 4
    +1       repeated alerts: alerts_count >= 3 ("multiple act-now alerts"). alerts_count = adverse signals on this
             case that are strong enough to say "act now" (|robust z| >= 3) + other open risk cases that touch the
             same account (directly or through their blast radius).
    +1       top-decile revenue exposure (value_at_stake >= 90th percentile of open risk cases)
             OR very high confidence (>= 0.9) together with persistence (same pattern in the previous weekly run).
             At most +1 from this rule.
    floor 4  regulatory-sensitive cases (batch quality, suspected adverse event) are at least level 4.
    clamp    1..5.  Missing/unknown severity -> policy default_level (2).
    override A human override (POST /agentic/levels/{ref}/override) wins over the classifier and is audited.
             It never changes the mode of a regulatory-sensitive case.

POLICY (GET/PUT /agentic/policy; PUT only by business_head: bearer token via auth.optional_user if available,
else ?persona=business_head). Stored in state ("agentic", "policy"); defaults:
    default_level 2, human_threshold 2, deadlines_hours {1:24, 2:12, 3:8, 4:4, 5:2} (sim-clock hours),
    auto_decide_max_level 1, provisional_max_level 3, email_min_level 3.

DEADLINE
    decision_deadline = case start + deadlines_hours[level]. Case start = SIM_NOW for cases found by the seeded
    detection run, or the sim-clock time the case was first seen (Lab-injected cases). The Lab moves the sim clock.

MODES
    auto         level <= auto_decide_max_level. At the deadline with no human decision the Deadline Guardian
                 decides: it approves the proposed plan if every step is an internal task and every draft is
                 simulated and unsent; otherwise it defers with a note. If no plan exists yet it asks the
                 Investigator/Orchestrator to draft one first (same code path as a human pressing Investigate).
    provisional  auto_decide_max_level < level <= provisional_max_level. Level >= human_threshold -> a human is
                 alerted at once. At the deadline the agent takes a REVERSIBLE provisional decision: it creates the
                 plan's internal tasks and unsent drafts only (never anything external), leaves the plan awaiting a
                 human, flags it "provisional - confirm or undo" and notifies the owner.
    human_only   level > provisional_max_level, every regulatory-sensitive case, and every plan that needs
                 four-eyes. Never auto-decided. At the deadline the case escalates up the hierarchy to the
                 business head (status "escalated") and an email goes out.

STATUS  awaiting_human | auto_decided | provisional | decided | escalated

SAFETY
    - Every agent action is written to the hash-chained audit log as ("agent", "deadline-guardian", ...).
    - Existing approval flows are untouched: humans still decide through POST /plans/{pid}/decision, and
      four-eyes is enforced there. A human decision on a provisionally decided plan supersedes the agent
      (its provisional tasks are cancelled so nothing is duplicated). After an Undo the agent never acts on
      that case again.
    - Nothing is sent externally. Tasks and drafts stay simulated (AGENTS.md section 3).
    - Email: level >= email_min_level alerts and all escalations go through mailer.notify(...) when the mailer
      module exists; otherwise (or on any error) they are kept in the in-app notification log only.
"""

from __future__ import annotations

import functools
import logging
import threading
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from . import state
from .config import ROLE_LABELS, SIM_NOW

log = logging.getLogger("strata.agentic")
router = APIRouter(prefix="/agentic", tags=["agentic"])
_LOCK = threading.RLock()  # one evaluation/decision at a time: concurrent page loads must not act twice


def _locked(fn: Any) -> Any:
    @functools.wraps(fn)
    def inner(*args: Any, **kwargs: Any) -> Any:
        with _LOCK:
            return fn(*args, **kwargs)
    return inner

LEVEL_LABELS: dict[int, str] = {1: "Low", 2: "Moderate", 3: "Elevated", 4: "High", 5: "Critical"}
SEV_BASE: dict[str, int] = {"watch": 1, "elevated": 2, "high": 3, "critical": 4}
ACT_NOW_Z = 3.0          # |robust z| at which one signal counts as an "act now" alert
ALERTS_ESCALATE = 3      # alerts_count at which the Escalation rule adds +1
HIGH_CONFIDENCE = 0.9    # confidence that, together with persistence, adds +1
REGULATORY_FLOOR = 4
AGENT = "deadline-guardian"
AGENT_NAME = "Deadline Guardian (agent)"
OPEN_PLAN = "awaiting_approval"

DEFAULT_POLICY: dict[str, Any] = {
    "default_level": 2, "human_threshold": 2,
    "deadlines_hours": {"1": 24, "2": 12, "3": 8, "4": 4, "5": 2},
    "auto_decide_max_level": 1, "provisional_max_level": 3, "email_min_level": 3,
    "updated_by": None, "updated_at": None,
}


# ------------------------------------------------------------------ policy
def get_policy() -> dict[str, Any]:
    saved = state.get("agentic", "policy") or {}
    pol = {**DEFAULT_POLICY, **{k: v for k, v in saved.items() if k in DEFAULT_POLICY}}
    pol["deadlines_hours"] = {**DEFAULT_POLICY["deadlines_hours"], **{str(k): v for k, v in (saved.get("deadlines_hours") or {}).items()}}
    return pol


def _validate_policy(p: dict[str, Any]) -> None:
    for k in ("default_level", "human_threshold", "auto_decide_max_level", "provisional_max_level", "email_min_level"):
        if not isinstance(p[k], int) or not 0 <= p[k] <= 5:
            raise HTTPException(400, f"{k} must be a whole number from 0 to 5.")
    if not 1 <= p["default_level"] <= 5:
        raise HTTPException(400, "default_level must be from 1 to 5.")
    if p["auto_decide_max_level"] > p["provisional_max_level"]:
        raise HTTPException(400, "auto_decide_max_level cannot be above provisional_max_level.")
    for lv in ("1", "2", "3", "4", "5"):
        h = p["deadlines_hours"].get(lv)
        if not isinstance(h, (int, float)) or not 0.25 <= float(h) <= 24 * 30:
            raise HTTPException(400, f"Deadline for level {lv} must be between 0.25 and 720 hours.")


# ------------------------------------------------------------------ caller identity (auth module is optional)
def _caller(request: Request | None, persona: str | None, by: str | None = None) -> tuple[str | None, str]:
    """(role, display name). A valid bearer token (auth.optional_user) wins; else the ?persona= fallback."""
    hdr = request.headers.get("authorization") if request is not None else None
    if hdr:
        try:
            from . import auth as _auth  # type: ignore[attr-defined]
            fn = getattr(_auth, "optional_user", None)
            user: Any = None
            if fn is not None:
                for call in (lambda: fn(authorization=hdr), lambda: fn(hdr), lambda: fn(request)):
                    try:
                        user = call()
                        break
                    except TypeError:
                        continue
            if user:
                get = (lambda k: user.get(k)) if isinstance(user, dict) else (lambda k: getattr(user, k, None))
                role = get("role")
                if role:
                    return str(role), str(get("name") or by or ROLE_LABELS.get(str(role), str(role)))
        except Exception as exc:  # noqa: BLE001 - auth lane absent or token invalid: fall back to persona
            log.debug("agentic: bearer token not usable (%s)", type(exc).__name__)
    return persona, (by or ROLE_LABELS.get(persona or "", persona or "unknown"))


# ------------------------------------------------------------------ classifier (pure, unit-tested)
def classify_level(*, severity: str | None, alerts_count: int = 0, value_at_stake: float | None = None,
                   exposure_p90: float | None = None, confidence: float | None = None, persistent: bool = False,
                   regulatory_sensitive: bool = False, kind: str = "risk", default_level: int = 2) -> tuple[int, list[str]]:
    reasons: list[str] = []
    if severity not in SEV_BASE:
        level = default_level
        reasons.append(f"Not enough data to classify: default level {level} ({LEVEL_LABELS[level]}).")
    else:
        level = SEV_BASE[severity]
        reasons.append(f"Detection severity is {severity}: starts at level {level}.")
        if kind == "opportunity":
            reasons.append("This is an opportunity, not a loss risk; it is triaged the same way so nothing waits silently.")
        if alerts_count >= ALERTS_ESCALATE:
            level += 1
            reasons.append(f"{alerts_count} act-now alerts on the same account (3 or more): +1.")
        top_exposure = value_at_stake is not None and exposure_p90 is not None and value_at_stake >= exposure_p90 > 0
        sure_and_lasting = (confidence or 0) >= HIGH_CONFIDENCE and persistent
        if top_exposure:
            level += 1
            reasons.append("Revenue exposure is in the top 10% of open cases: +1.")
        elif sure_and_lasting:
            level += 1
            reasons.append(f"Very high confidence ({confidence:.2f}) and the pattern persisted from last week: +1.")
    if regulatory_sensitive and level < REGULATORY_FLOOR:
        level = REGULATORY_FLOOR
        reasons.append("Regulatory-sensitive (quality / possible adverse event): at least level 4, humans only.")
    elif regulatory_sensitive:
        reasons.append("Regulatory-sensitive: humans only, four-eyes.")
    level = int(min(5, max(1, level)))
    return level, reasons


def mode_for(level: int, pol: dict[str, Any], *, regulatory: bool = False, four_eyes: bool = False) -> str:
    if regulatory or four_eyes:
        return "human_only"
    if level <= pol["auto_decide_max_level"]:
        return "auto"
    if level <= pol["provisional_max_level"]:
        return "provisional"
    return "human_only"


# ------------------------------------------------------------------ engine helpers (lazy import of app)
def _app() -> Any:
    from . import app as _a
    return _a


def _now() -> datetime:
    return _app().sim_clock()


def _open_incidents() -> list[Any]:
    a = _app()
    return [i for i in a.E().det.incidents if a.inc_state(i.ref).get("status") not in ("resolved", "dismissed")]


def _alerts_count(inc: Any, incidents: list[Any]) -> int:
    strong = sum(1 for s in inc.evidence if s.is_adverse and abs(float(s.robust_z)) >= ACT_NOW_Z)
    others = 0
    if inc.account_id is not None:
        for o in incidents:
            if o.ref == inc.ref or o.kind != "risk":
                continue
            if o.account_id == inc.account_id or any(b.get("account_id") == inc.account_id for b in o.blast):
                others += 1
    return strong + others


def _exposure_p90(incidents: list[Any]) -> float | None:
    vals = [float(i.value_at_stake) for i in incidents if i.kind == "risk"]
    return float(np.percentile(vals, 90)) if vals else None


def _plan_for(ref: str) -> dict[str, Any] | None:
    st = _app().inc_state(ref)
    return state.get("plans", st["plan_id"]) if st.get("plan_id") else None


def _case(ref: str, inc: Any) -> dict[str, Any]:
    c = state.get("agentic_cases", ref)
    if c:
        return c
    start = SIM_NOW if not getattr(inc, "sim_run_id", None) else _now()
    c = {"ref": ref, "start_sim": start.isoformat(), "last_level": None, "human_alerted_at": None, "decision_id": None,
         "escalated_at": None, "agent_disabled": False}
    state.put("agentic_cases", ref, c)
    return c


def _level(inc: Any, incidents: list[Any], pol: dict[str, Any], p90: float | None) -> tuple[int, list[str], int, dict[str, Any] | None]:
    a = _app()
    n_alerts = _alerts_count(inc, incidents)
    level, reasons = classify_level(severity=inc.severity, alerts_count=n_alerts, value_at_stake=inc.value_at_stake,
                                    exposure_p90=p90, confidence=a.confidence(inc), persistent=bool(inc.persistence_bonus),
                                    regulatory_sensitive=bool(inc.regulatory_sensitive), kind=inc.kind,
                                    default_level=int(pol["default_level"]))
    ov = state.get("agentic_overrides", inc.ref)
    if ov and ov.get("level"):
        reasons = [f"Set to level {ov['level']} by {ov['by']}: {ov['reason']}", f"(Classifier said level {level}.)"]
        level = int(ov["level"])
    return level, reasons, n_alerts, ov


def _fmt(dt: datetime) -> str:
    return dt.strftime("%d %b %H:%M")


def _evidence_ids(inc: Any, plan: dict[str, Any] | None) -> list[str]:
    ids = [s.id for s in inc.evidence[:3]]
    for s in (plan or {}).get("steps", []):
        for e in s.get("evidence_ids", []):
            if e not in ids:
                ids.append(e)
    return ids[:6]


# ------------------------------------------------------------------ notifications (in-app log + optional email)
def _company_id() -> Any:
    """The main demo company (auth lane: config/demo_companies.yaml -> demo_users.company), if auth exists."""
    try:
        from . import auth as _auth  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        return None
    for name in ("main_company_id", "demo_company_id", "default_company_id", "MAIN_COMPANY_ID", "DEMO_COMPANY_ID"):
        v = getattr(_auth, name, None)
        if v is not None:
            try:
                return v() if callable(v) else v
            except Exception:  # noqa: BLE001, S112 - optional helper; try the next name
                continue
    try:
        return ((_auth._demo_cfg() or {}).get("demo_users") or {}).get("company")
    except Exception:  # noqa: BLE001
        return None


def notify(roles: list[str], subject: str, body: str, *, email: bool, ref: str | None, kind: str,
           level: int | None = None, deadline: datetime | None = None) -> dict[str, Any]:
    via, sent = "in_app", 0
    if email:
        try:
            from . import mailer as _mailer  # type: ignore[attr-defined]
            cid = _company_id()
            if cid is None:
                raise LookupError("no company")
            link = f"/app/incidents/{ref}" if ref else "/app/approvals"
            try:
                sent = int(_mailer.notify(cid, roles, subject, body, level=level, title=subject,
                                          deadline=_fmt(deadline) if deadline else None, link=link) or 0)
            except TypeError:
                sent = int(_mailer.notify(cid, roles, subject, body) or 0)
            via = "email" if sent else "in_app"
        except Exception as exc:  # noqa: BLE001 - mailer lane absent or failing: stay in-app
            log.info("agentic notify kept in-app (%s)", type(exc).__name__)
    nid = f"AN-{state.next_id('agentic_notifications'):04d}"
    rec = {"id": nid, "at": _now().isoformat(), "wall_at": state.wall_now(), "roles": roles, "subject": subject, "body": body,
           "via": via, "emails_sent": sent, "email_requested": email, "ref": ref, "kind": kind, "level": level}
    state.put("agentic_notifications", nid, rec)
    return rec


# ------------------------------------------------------------------ the Deadline Guardian's actions
def _ensure_plan(ref: str) -> dict[str, Any] | None:
    plan = _plan_for(ref)
    if plan:
        return plan
    try:
        _app().get_plan(ref)  # Investigator + Orchestrator draft a plan (same path as a human pressing Investigate)
    except Exception as exc:  # noqa: BLE001
        log.warning("agentic: could not draft a plan for %s: %s", ref, exc)
        return None
    return _plan_for(ref)


def _internal_only(plan: dict[str, Any]) -> tuple[bool, str]:
    for d in plan.get("drafts", []):
        if d.get("simulated") is not True or not str(d.get("channel", "")).endswith("_draft"):
            return False, f"Draft '{d.get('subject', '')}' is not a simulated, unsent draft."
    return True, "Every step is an internal task and every draft is simulated and unsent."


def _create_tasks(plan: dict[str, Any], inc: Any, origin: str) -> list[str]:
    """Mirror of the task creation in app.decide(), but attributed to the agent. Simulated, internal only."""
    now = _now()
    ids: list[str] = []
    for s in plan.get("steps", []):
        tid = f"T-{state.next_id('tasks'):04d}"
        state.put("tasks", tid, {"id": tid, "plan_id": plan["id"], "incident_id": inc.ref, "incident_ref": inc.ref, "title": s["action"],
                                 "owner_role": s["owner_role"], "due_at": (now + timedelta(hours=s.get("due_in_hours", 24))).isoformat(),
                                 "status": "open", "channel": "task", "origin": origin, "account_id": inc.account_id,
                                 "payload": {"evidence_ids": s.get("evidence_ids", []), "source": s.get("source"), "by_agent": AGENT},
                                 "simulated": True, "created_at": now.isoformat()})
        state.audit("agent", AGENT, "task.created", "task", tid, {"plan": plan["id"], "simulated": True, "origin": origin}, at=now.isoformat())
        ids.append(tid)
    for dr in plan.get("drafts", []):
        tid = f"T-{state.next_id('tasks'):04d}"
        state.put("tasks", tid, {"id": tid, "plan_id": plan["id"], "incident_id": inc.ref, "incident_ref": inc.ref, "title": dr["subject"],
                                 "owner_role": dr["to_role"], "due_at": (now + timedelta(hours=4)).isoformat(), "status": "open",
                                 "channel": dr["channel"], "origin": origin, "account_id": inc.account_id,
                                 "payload": {**dr, "by_agent": AGENT}, "simulated": True, "created_at": now.isoformat()})
        state.audit("agent", AGENT, "draft.created", "task", tid, {"channel": dr["channel"], "simulated": True, "sent": False, "origin": origin},
                    at=now.isoformat())
        ids.append(tid)
    return ids


def _record(ref: str, kind: str, decision: str, rationale: str, level: int, mode: str, plan: dict[str, Any] | None,
            evidence: list[str], trigger: str, tasks: list[str] | None = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    did = f"AD-{state.next_id('agent_decisions'):04d}"
    now = _now()
    rec = {"id": did, "ref": ref, "kind": kind, "decision": decision, "rationale": rationale, "level": level,
           "level_label": LEVEL_LABELS[level], "mode": mode, "plan_id": (plan or {}).get("id"), "evidence_ids": evidence,
           "task_ids": tasks or [], "trigger": trigger, "status": "active" if kind == "provisional" else "final",
           "at": now.isoformat(), "wall_at": state.wall_now(), "agent": AGENT, **(extra or {})}
    state.put("agent_decisions", did, rec)
    state.audit("agent", AGENT, f"agentic.{kind}", "incident", ref,
                {"decision_id": did, "decision": decision, "rationale": rationale, "level": level, "mode": mode,
                 "plan": rec["plan_id"], "evidence_ids": evidence, "trigger": trigger}, at=now.isoformat())
    return rec


def _act(inc: Any, case: dict[str, Any], level: int, mode: str, trigger: str) -> dict[str, Any] | None:
    """Take the decision the agent is allowed to take for this mode. Returns the decision record."""
    pol = get_policy()
    a = _app()
    ref = inc.ref
    if mode == "human_only":
        if case.get("escalated_at"):
            return None
        plan = _plan_for(ref)
        roles = ["business_head"] + ([inc.owner_role] if inc.owner_role != "business_head" else [])
        why = ("regulatory-sensitive, so only humans decide (four-eyes)" if inc.regulatory_sensitive
               else f"level {level} ({LEVEL_LABELS[level]}) is above what the agent may decide")
        rec = _record(ref, "escalation", "escalated", f"Deadline passed with no human decision; {why}. Escalated to the Business Head.",
                      level, mode, plan, _evidence_ids(inc, plan), trigger, extra={"escalated_to": "business_head"})
        notify(roles, f"[STRATA] Overdue decision escalated: {ref} (level {level})",
               f"{inc.title}\nLevel {level} ({LEVEL_LABELS[level]}). The decision deadline passed with no decision.\n"
               f"Open the case: /app/incidents/{ref}\nSimulated data; nothing was sent to any customer.",
               email=True, ref=ref, kind="escalation", level=level)
        case["escalated_at"] = rec["at"]
        case["decision_id"] = rec["id"]
        state.put("agentic_cases", ref, case)
        return rec

    plan = _ensure_plan(ref)
    if plan is None or plan.get("status") != OPEN_PLAN:
        if plan is not None:
            return None  # a human already decided this plan
        rec = _record(ref, "auto", "deferred", "No plan could be drafted, so the agent did not act. A human needs to look.",
                      level, mode, None, _evidence_ids(inc, None), trigger)
        case["decision_id"] = rec["id"]
        state.put("agentic_cases", ref, case)
        return rec
    if plan.get("four_eyes"):
        return None  # never decide a four-eyes plan (mode_for already routes these to human_only)
    ev = _evidence_ids(inc, plan)

    if mode == "auto":
        ok, why = _internal_only(plan)
        if ok:
            now = _now()
            aid = f"APR-{state.next_id('approvals'):04d}"
            state.put("approvals", aid, {"id": aid, "plan_id": plan["id"], "decided_by": AGENT_NAME, "decider_role": "agent",
                                         "decision": "approved", "reason": f"Auto-decided at the deadline (level {level}). {why}",
                                         "decided_at": state.wall_now(), "decided_at_sim": now.isoformat()})
            tasks = _create_tasks(plan, inc, "agent_auto")
            plan["status"] = "approved"
            plan["decided_by_agent"] = True
            state.put("plans", plan["id"], plan)
            st = a.inc_state(ref)
            st["status"] = "executing"
            state.put("incident_state", ref, st)
            rec = _record(ref, "auto", "approved",
                          f"Level {level} ({LEVEL_LABELS[level]}) and no human decided by the deadline. {why} "
                          f"Approved plan {plan['id']}: {len(tasks)} simulated internal tasks and drafts created; nothing sent.",
                          level, mode, plan, ev, trigger, tasks)
        else:
            rec = _record(ref, "auto", "deferred", f"Deferred: {why} A human must approve anything that leaves the company.",
                          level, mode, plan, ev, trigger)
        notify([plan["requires_role"]], f"[STRATA] Agent decided {ref} at the deadline",
               f"{inc.title}\n{rec['rationale']}", email=level >= pol["email_min_level"], ref=ref, kind="auto", level=level)
    else:  # provisional
        tasks = _create_tasks(plan, inc, "agent_provisional")
        plan["provisional_decision"] = None  # set below once we know the id
        rec = _record(ref, "provisional", "provisional_approve",
                      f"Level {level} ({LEVEL_LABELS[level]}): deadline passed with no human decision. Provisional, reversible step: "
                      f"{len(tasks)} internal tasks and unsent drafts prepared from plan {plan['id']}. Nothing external. "
                      "Confirm or undo.", level, mode, plan, ev, trigger, tasks)
        plan["provisional_decision"] = rec["id"]
        state.put("plans", plan["id"], plan)
        notify([plan["requires_role"]], f"[STRATA] Provisional decision on {ref}: confirm or undo",
               f"{inc.title}\n{rec['rationale']}\nOpen Approvals to confirm or undo.",
               email=level >= pol["email_min_level"], ref=ref, kind="provisional", level=level)
    case["decision_id"] = rec["id"]
    state.put("agentic_cases", ref, case)
    return rec


def _reconcile(ref: str, case: dict[str, Any], plan: dict[str, Any] | None) -> None:
    """A human decided a plan the agent had provisionally decided: the human wins, provisional tasks are cancelled."""
    did = case.get("decision_id")
    if not did:
        return
    d = state.get("agent_decisions", did)
    if not d or d.get("kind") != "provisional" or d.get("status") != "active":
        return
    if plan and plan.get("status") == OPEN_PLAN:
        return
    _cancel_tasks(d["task_ids"], "Superseded by a human decision on the plan.")
    d["status"] = "superseded"
    d["closed_at"] = _now().isoformat()
    state.put("agent_decisions", did, d)
    state.audit("agent", AGENT, "agentic.provisional_superseded", "incident", ref,
                {"decision_id": did, "plan": (plan or {}).get("id"), "plan_status": (plan or {}).get("status")}, at=_now().isoformat())


def _cancel_tasks(task_ids: list[str], note: str) -> None:
    for tid in task_ids:
        t = state.get("tasks", tid)
        if t and t.get("status") != "done":
            t["status"] = "cancelled"
            t["payload"] = {**(t.get("payload") or {}), "cancel_note": note}
            state.put("tasks", tid, t)


def _status(inc: Any, case: dict[str, Any], plan: dict[str, Any] | None) -> tuple[str, dict[str, Any] | None]:
    d = state.get("agent_decisions", case["decision_id"]) if case.get("decision_id") else None
    if d and d["kind"] == "provisional" and d["status"] == "active":
        return "provisional", d
    if d and d["kind"] == "auto" and d["status"] == "final" and \
            (d["decision"] == "approved" or (plan and plan.get("status") == OPEN_PLAN)):
        return "auto_decided", d
    if d and d["kind"] == "escalation" and (not plan or plan.get("status") == OPEN_PLAN) and \
            _app().inc_state(inc.ref).get("status") not in ("executing", "rejected"):
        return "escalated", d
    st = _app().inc_state(inc.ref).get("status")
    if (plan and plan.get("status") not in (OPEN_PLAN, "superseded")) or st in ("executing", "rejected"):
        return "decided", d
    return "awaiting_human", d


def _mode_line(mode: str, status: str, deadline: datetime, level: int, regulatory: bool, disabled: bool) -> str:
    by = _fmt(deadline)
    if status == "decided":
        return "A human decided this case."
    if status == "auto_decided":
        return "The agent decided at the deadline. See the rationale."
    if status == "provisional":
        return "The agent took a provisional step. Confirm it or undo it."
    if status == "escalated":
        return "Deadline passed. Escalated to the Business Head."
    if disabled:
        return "You undid the agent's step. Only a human decides this case now."
    if mode == "auto":
        return f"If no one decides by {by}, the agent decides and explains why."
    if mode == "provisional":
        return f"If you don't decide by {by}, the agent takes a provisional decision you can undo."
    if regulatory:
        return f"Humans only (regulatory, four-eyes). If undecided by {by}, it escalates to the Business Head."
    return f"Humans only at level {level}. If undecided by {by}, it escalates to the Business Head."


@_locked
def evaluate(persona: str | None = None, *, act: bool = True) -> dict[str, Any]:
    """Classify every open case, run the Escalation and Deadline Guardian rules, and return the queue."""
    a = _app()
    pol = get_policy()
    now = _now()
    incidents = _open_incidents()
    p90 = _exposure_p90(incidents)
    items: list[dict[str, Any]] = []
    acted: list[dict[str, Any]] = []
    for inc in incidents:
        case = _case(inc.ref, inc)
        level, reasons, n_alerts, ov = _level(inc, incidents, pol, p90)
        plan = _plan_for(inc.ref)
        mode = mode_for(level, pol, regulatory=bool(inc.regulatory_sensitive), four_eyes=bool((plan or {}).get("four_eyes")))
        start = datetime.fromisoformat(case["start_sim"])
        deadline = start + timedelta(hours=float(pol["deadlines_hours"][str(level)]))
        _reconcile(inc.ref, case, plan)
        status, d = _status(inc, case, plan)

        if act:
            # Escalation agent: a level that rises is announced up the hierarchy
            prev = case.get("last_level")
            if prev is not None and level > int(prev) and status == "awaiting_human":
                state.audit("agent", "escalation", "agentic.level_raised", "incident", inc.ref,
                            {"from": prev, "to": level, "reasons": reasons}, at=now.isoformat())
                notify(["business_head", inc.owner_role] if level >= pol["email_min_level"] else [inc.owner_role],
                       f"[STRATA] {inc.ref} raised to level {level} ({LEVEL_LABELS[level]})", f"{inc.title}\n" + "\n".join(reasons),
                       email=level >= pol["email_min_level"], ref=inc.ref, kind="level_raised", level=level)
            if prev != level:
                case["last_level"] = level
                state.put("agentic_cases", inc.ref, case)
            # Human brought in immediately from human_threshold
            if level >= pol["human_threshold"] and not case.get("human_alerted_at") and status == "awaiting_human":
                case["human_alerted_at"] = now.isoformat()
                state.put("agentic_cases", inc.ref, case)
                role = (plan or {}).get("requires_role") or inc.owner_role
                state.audit("agent", "risk-triage", "agentic.human_alerted", "incident", inc.ref,
                            {"level": level, "role": role, "deadline": deadline.isoformat()}, at=now.isoformat())
                notify([role], f"[STRATA] Decision needed by {_fmt(deadline)}: {inc.ref} (level {level})",
                       f"{inc.title}\nLevel {level} ({LEVEL_LABELS[level]}). " + " ".join(reasons),
                       email=level >= pol["email_min_level"], ref=inc.ref, kind="human_alert", level=level, deadline=deadline)
            # Deadline Guardian
            if status == "awaiting_human" and now >= deadline and not case.get("agent_disabled"):
                rec = _act(inc, case, level, mode, "deadline")
                if rec:
                    acted.append(rec)
                    plan = _plan_for(inc.ref)
                    status, d = _status(inc, state.get("agentic_cases", inc.ref) or case, plan)
                    case = state.get("agentic_cases", inc.ref) or case

        if persona and not a.visible_to(inc, persona):
            continue
        aps = [x for x in state.all_("approvals") if plan and x["plan_id"] == plan["id"] and x["decision"] == "approved"]
        items.append({
            "ref": inc.ref, "title": inc.title, "kind": inc.kind, "severity": inc.severity, "level": level,
            "level_label": LEVEL_LABELS[level], "reasons": reasons, "alerts_count": n_alerts,
            "decision_deadline": deadline.isoformat(), "deadline_passed": now >= deadline, "mode": mode, "status": status,
            "mode_line": _mode_line(mode, status, deadline, level, bool(inc.regulatory_sensitive), bool(case.get("agent_disabled"))),
            "auto_decision": None if not d else {"id": d["id"], "kind": d["kind"], "decision": d["decision"], "rationale": d["rationale"],
                                                 "at": d["at"], "evidence_ids": d["evidence_ids"], "status": d["status"]},
            "override": ov if ov and ov.get("level") else None, "regulatory_sensitive": bool(inc.regulatory_sensitive),
            "owner_role": inc.owner_role, "account_id": inc.account_id, "account_name": a.acc_name(inc.account_id),
            "value_at_stake": round(float(inc.value_at_stake), 2),
            "plan_id": (plan or {}).get("id"), "plan_status": (plan or {}).get("status"),
            "requires_role": (plan or {}).get("requires_role") or inc.owner_role, "four_eyes": bool((plan or {}).get("four_eyes")),
            "approvals_so_far": len(aps), "agent_disabled": bool(case.get("agent_disabled")), "started_at": case["start_sim"],
        })
    items.sort(key=lambda x: (-x["level"], x["decision_deadline"]))
    counts = {str(lv): sum(1 for x in items if x["level"] == lv) for lv in range(1, 6)}
    return {"items": items, "counts": counts, "policy": pol, "sim_now": now.isoformat(), "acted": acted}


# ------------------------------------------------------------------ registry
AGENTS: list[dict[str, Any]] = [
    {"key": "sentinel", "name": "Sentinel", "job": "Watches orders, support, CRM, inventory and finance signals and opens a case when several agree.",
     "where": ["/app", "/app/incidents", "/app/risks"], "autonomy": "suggests",
     "saves": "Nobody has to scan dashboards every morning; problems surface before a manual review would catch them."},
    {"key": "investigator", "name": "Investigator", "job": "Ranks likely causes for a case from the evidence and past cases.",
     "where": ["/app/incidents"], "autonomy": "suggests", "saves": "The first hour of digging through four systems."},
    {"key": "memory", "name": "Memory", "job": "Finds similar past cases, SOPs and rejected plans and shows what worked.",
     "where": ["/app/memory", "/app/incidents"], "autonomy": "suggests", "saves": "Repeating a fix that already failed, or re-inventing one that worked."},
    {"key": "orchestrator", "name": "Orchestrator", "job": "Drafts a step-by-step plan with owners, due times and unsent drafts.",
     "where": ["/app/incidents", "/app/approvals", "/app/workflows"], "autonomy": "acts with approval",
     "saves": "Writing the plan and the follow-up messages by hand."},
    {"key": "risk_triage", "name": "Risk Triage", "job": "Gives every open case a level from 1 (Low) to 5 (Critical), with the reasons, and pulls a human in from level 2.",
     "where": ["/app/approvals", "/app/agents"], "autonomy": "suggests",
     "saves": "Deciding what to look at first; the queue is already in order."},
    {"key": "deadline_guardian", "name": "Deadline Guardian", "job": "When a deadline passes with no decision, takes the decision the policy allows: decides level 1, takes a reversible step for levels 2-3.",
     "where": ["/app/approvals", "/app/agents", "/app/workflows"], "autonomy": "acts at deadline",
     "saves": "Low-risk cases no longer wait for a busy manager; every step is explained and can be undone."},
    {"key": "escalation", "name": "Escalation", "job": "Raises the level when act-now alerts repeat and emails up the hierarchy when a high-risk deadline is missed.",
     "where": ["/app/approvals", "/app/agents"], "autonomy": "acts at deadline",
     "saves": "Serious cases cannot sit unnoticed; the Business Head hears about them in time."},
    {"key": "briefing_writer", "name": "Briefing writer", "job": "Writes the daily digest: what changed, what was missed, what needs you.",
     "where": ["/app", "/app/briefing"], "autonomy": "suggests", "saves": "Reading every case to know where the day stands."},
    {"key": "assistant", "name": "Assistant", "job": "Answers questions about cases and numbers, citing the evidence it used.",
     "where": ["/app"], "autonomy": "suggests", "saves": "Hunting for the right page to answer a quick question."},
    {"key": "sim_narrator", "name": "Simulation narrator", "job": "Explains, week by week, what a scenario would look like with and without Strata (illustrative).",
     "where": ["/app/lab"], "autonomy": "suggests", "saves": "Explaining the what-if to a stakeholder by hand."},
]


# ------------------------------------------------------------------ routes
class PolicyIn(BaseModel):
    default_level: int | None = None
    human_threshold: int | None = None
    deadlines_hours: dict[str, float] | None = None
    auto_decide_max_level: int | None = None
    provisional_max_level: int | None = None
    email_min_level: int | None = None


class OverrideIn(BaseModel):
    level: int | None = None
    reason: str = ""
    persona: str | None = None
    by: str | None = None


class ActorIn(BaseModel):
    persona: str | None = None
    by: str | None = None
    reason: str | None = None


@router.get("/policy")
def policy_get() -> dict[str, Any]:
    return get_policy()


@router.put("/policy")
def policy_put(body: PolicyIn, request: Request, persona: str | None = None) -> dict[str, Any]:
    role, name = _caller(request, persona)
    if role != "business_head":
        raise HTTPException(403, "Only the Business Head can change the decision policy.")
    pol = get_policy()
    upd = body.model_dump(exclude_none=True)
    if "deadlines_hours" in upd:
        dh = {str(k): v for k, v in upd.pop("deadlines_hours").items() if str(k) in pol["deadlines_hours"]}
        pol["deadlines_hours"] = {**pol["deadlines_hours"], **dh}
    pol.update(upd)
    _validate_policy(pol)
    pol["updated_by"] = name
    pol["updated_at"] = state.wall_now()
    state.put("agentic", "policy", pol)
    state.audit("human", name, "agentic.policy_updated", "policy", "agentic", {k: pol[k] for k in DEFAULT_POLICY if k not in ("updated_by", "updated_at")},
                at=_now().isoformat())
    return pol


@router.get("/levels")
def levels(persona: str | None = None) -> dict[str, Any]:
    return evaluate(persona)


@router.post("/tick")
def tick() -> dict[str, Any]:
    r = evaluate(None)
    return {"sim_now": r["sim_now"], "acted": r["acted"], "counts": r["counts"]}


@router.post("/levels/{ref}/override")
@_locked
def override(ref: str, body: OverrideIn, request: Request) -> dict[str, Any]:
    _app().incident_or_404(ref)
    role, name = _caller(request, body.persona, body.by)
    if not role:
        raise HTTPException(400, "Say who is overriding (persona or sign in).")
    if body.level is not None and not 1 <= body.level <= 5:
        raise HTTPException(400, "level must be from 1 to 5.")
    if body.level is not None and not body.reason.strip():
        raise HTTPException(400, "A reason is required to override a level.")
    rec = {"ref": ref, "level": body.level, "reason": body.reason.strip(), "by": name, "role": role, "at": _now().isoformat()}
    state.put("agentic_overrides", ref, rec)
    state.audit("human", name, "agentic.level_override" if body.level else "agentic.level_override_cleared", "incident", ref,
                {"level": body.level, "reason": rec["reason"], "role": role}, at=_now().isoformat())
    item = next((x for x in evaluate(None)["items"] if x["ref"] == ref), None)
    return {"ok": True, "item": item}


@router.post("/levels/{ref}/delegate")
@_locked
def delegate(ref: str, body: ActorIn, request: Request) -> dict[str, Any]:
    """'Let the agent decide' now, instead of waiting for the deadline. Not allowed for human_only cases."""
    inc = _app().incident_or_404(ref)
    role, name = _caller(request, body.persona, body.by)
    if not role:
        raise HTTPException(400, "Say who is delegating (persona or sign in).")
    item = next((x for x in evaluate(None, act=False)["items"] if x["ref"] == ref), None)
    if not item:
        raise HTTPException(400, "This case is closed.")
    if item["mode"] == "human_only":
        raise HTTPException(400, "Humans only: this case is regulatory, four-eyes, or above the level the agent may decide.")
    if item["status"] != "awaiting_human":
        raise HTTPException(400, f"Already {item['status'].replace('_', ' ')}.")
    case = _case(ref, inc)
    case["agent_disabled"] = False
    state.audit("human", name, "agentic.delegated", "incident", ref, {"role": role, "mode": item["mode"]}, at=_now().isoformat())
    rec = _act(inc, case, item["level"], item["mode"], f"delegated by {name}")
    if not rec:
        raise HTTPException(400, "The agent could not act on this case.")
    return {"ok": True, "decision": rec}


@router.get("/decisions")
def decisions(limit: int = 50) -> dict[str, Any]:
    evaluate(None)
    ds = list(reversed(state.all_("agent_decisions")))[:limit]
    titles = {i.ref: i.title for i in _app().E().det.incidents}
    for d in ds:
        d["title"] = titles.get(d["ref"], d["ref"])
    notes = list(reversed(state.all_("agentic_notifications")))[:limit]
    return {"items": ds, "notifications": notes, "sim_now": _now().isoformat()}


def _decision_or_404(did: str) -> dict[str, Any]:
    d = state.get("agent_decisions", did)
    if not d:
        raise HTTPException(404, "decision not found")
    if d["kind"] != "provisional" or d["status"] != "active":
        raise HTTPException(400, "Only an active provisional decision can be confirmed or undone.")
    return d


@router.post("/decisions/{did}/undo")
@_locked
def undo(did: str, body: ActorIn, request: Request) -> dict[str, Any]:
    d = _decision_or_404(did)
    role, name = _caller(request, body.persona, body.by)
    if not role:
        raise HTTPException(400, "Say who is undoing (persona or sign in).")
    _cancel_tasks(d["task_ids"], f"Undone by {name}.")
    d.update({"status": "undone", "closed_by": name, "closed_at": _now().isoformat(), "close_reason": body.reason})
    state.put("agent_decisions", did, d)
    plan = state.get("plans", d["plan_id"]) if d.get("plan_id") else None
    if plan and plan.get("provisional_decision") == did:
        plan["provisional_decision"] = None
        state.put("plans", plan["id"], plan)
    case = state.get("agentic_cases", d["ref"]) or {"ref": d["ref"], "start_sim": _now().isoformat()}
    case["agent_disabled"] = True
    case["decision_id"] = None
    state.put("agentic_cases", d["ref"], case)
    state.audit("human", name, "agentic.provisional_undone", "incident", d["ref"],
                {"decision_id": did, "role": role, "tasks_cancelled": d["task_ids"], "reason": body.reason}, at=_now().isoformat())
    return {"ok": True, "decision": d, "message": f"Undone. {len(d['task_ids'])} prepared tasks cancelled. The agent will not act on this case again."}


@router.post("/decisions/{did}/confirm")
@_locked
def confirm(did: str, body: ActorIn, request: Request) -> dict[str, Any]:
    d = _decision_or_404(did)
    role, name = _caller(request, body.persona, body.by)
    plan = state.get("plans", d["plan_id"]) if d.get("plan_id") else None
    if not plan or plan.get("status") != OPEN_PLAN:
        raise HTTPException(400, "The plan is no longer waiting for a decision.")
    req = plan["requires_role"]
    allowed = {req} if req == "qa_head" else {req, "operations_manager", "business_head"}
    if role not in allowed:
        raise HTTPException(403, "Your role cannot decide this plan. Allowed: " + " / ".join(ROLE_LABELS.get(r, r) for r in sorted(allowed)) + ".")
    if plan.get("four_eyes"):
        raise HTTPException(400, "Four-eyes plans must be approved through the normal two-person flow.")
    aid = f"APR-{state.next_id('approvals'):04d}"
    state.put("approvals", aid, {"id": aid, "plan_id": plan["id"], "decided_by": name, "decider_role": role, "decision": "approved",
                                 "reason": f"Confirmed the agent's provisional decision {did}.", "decided_at": state.wall_now()})
    state.audit("human", name, "plan.approved", "plan", plan["id"], {"role": role, "incident": d["ref"], "via": "agentic.confirm", "decision_id": did})
    plan["status"] = "approved"
    plan["provisional_decision"] = None
    state.put("plans", plan["id"], plan)
    st = _app().inc_state(d["ref"])
    st["status"] = "executing"
    state.put("incident_state", d["ref"], st)
    d.update({"status": "confirmed", "closed_by": name, "closed_at": _now().isoformat()})
    state.put("agent_decisions", did, d)
    return {"ok": True, "decision": d, "message": f"Confirmed. Plan {plan['id']} approved; the {len(d['task_ids'])} prepared tasks stay open."}


@router.get("/agents")
def agents() -> list[dict[str, Any]]:
    return AGENTS
