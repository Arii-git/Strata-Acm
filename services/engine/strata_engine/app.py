"""STRATA engine API (FastAPI). Contract: docs/API.md. Routers kept in one module for the prototype."""

from __future__ import annotations

import csv
import io
import json
import threading
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from . import state, tenancy
from .agents import Retriever, load_memory, run_investigation
from .config import (ENGAGEMENT, ENGINE_VERSION, FEATURES, LLM_PROVIDER, MODE, ROLE_LABELS, SEED_NAME, SIM_NOW,
                     STORE, STORE_DIR, CATALOG)
from .detect import SEV_ORDER, Detection, Incident, evaluate
from .signals import LABELS, D0, WEEKS, roll4, week_start
from .taxonomy import CATEGORY_LABEL, STAGE_LABEL, category_of, stage_of

app = FastAPI(title="STRATA engine", version=ENGINE_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(tenancy.CompanyMiddleware)  # Bearer token -> company for this request

if MODE == "replay":
    from fastapi import Request
    from fastapi.responses import JSONResponse

    from .config import DATA

    _SNAP = json.loads((DATA / "snapshots" / "replay.json").read_text(encoding="utf-8"))

    @app.middleware("http")
    async def replay_mw(request: Request, call_next):  # type: ignore[no-untyped-def]
        """A20 replay: serve recorded responses only. No data store, no keys, no network; writes are refused."""
        if request.url.path in ("/openapi.json", "/docs"):
            return await call_next(request)
        key = f"{request.method} {request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        if request.url.path == "/health":
            return JSONResponse({"status": "ok", "mode": "replay", "store": "snapshot", "llm_provider": "none", "retrieval": "tfidf",
                                 "sim_now": SIM_NOW.isoformat(), "features": FEATURES, "seed": SEED_NAME, "engine_version": ENGINE_VERSION})
        if key in _SNAP:
            return JSONResponse(_SNAP[key])
        base = f"{request.method} {request.url.path}"
        if base in _SNAP:
            return JSONResponse(_SNAP[base])
        if request.method != "GET":
            return JSONResponse({"detail": "Replay mode is read-only: this action was not pre-recorded. Switch to live mode to run it."}, status_code=409)
        return JSONResponse({"detail": "Not recorded in the replay snapshot."}, status_code=404)
URGENCY = {"critical": 1.0, "high": 0.8, "elevated": 0.6, "watch": 0.4, "healthy": 0.2}
BUDGET = int(CATALOG["alerting"]["alert_budget_per_persona_per_day"])
SOURCE_LABEL = {"orders": "Orders", "support": "Support", "crm": "CRM", "inventory": "Inventory", "workforce": "Workforce", "finance": "Finance", "docs": "Docs"}


def load_tables(seed: str = SEED_NAME) -> dict[str, pd.DataFrame]:
    d = STORE_DIR / seed
    if not (d / "orders.pkl").exists():
        raise RuntimeError(f"No seeded data at {d}. Run `npm run seed`.")
    return {p.stem: pd.read_pickle(p) for p in d.glob("*.pkl")}


class Engine:
    def __init__(self, seed: str = SEED_NAME) -> None:
        self.lock = threading.RLock()
        self.base = load_tables(seed)
        self.injections: list[dict[str, Any]] = state.all_("lab_injections")
        self.refresh()

    def refresh(self) -> None:
        with self.lock:
            t = self.base
            for inj in self.injections:
                t = inject(t, inj)
            self.t = t
            self.det: Detection = evaluate(t)
            for inc in self.det.incidents:
                inc.title = tenancy.case_title(inc.title)  # industry wording, e.g. "lot" / "consignment batch"
            for inc in self.det.incidents:
                if inc.account_id and any(i["account_id"] == inc.account_id for i in self.injections):
                    inc.sim_run_id = next(i["run_id"] for i in self.injections if i["account_id"] == inc.account_id)
            self.acc = t["accounts"].set_index("id")
            self.regions = t["regions"].set_index("id")["name"].to_dict()
            self.reps = t["reps"].set_index("id")
            self.by_ref = {i.ref: i for i in self.det.incidents}
            self.memory = load_memory(state.all_("memory_added"))
            self.sops = [m for m in self.memory if m.get("kind") == "sop"]
            self.retr = Retriever(self.memory)
            rows = state.audit_rows()
            seen = {(r["entity_id"]) for r in rows if r["action"] == "incident.detected"}
            for inc in self.det.incidents:
                if inc.ref not in seen:
                    state.audit("agent", "sentinel", "incident.detected", "incident", inc.ref,
                                {"severity": inc.severity, "risk_score": inc.risk_score, "n_sources": inc.n_sources,
                                 "sim_run_id": inc.sim_run_id})


def inject(t: dict[str, pd.DataFrame], inj: dict[str, Any]) -> dict[str, pd.DataFrame]:
    """Lab injector (A12): applies the hero pattern (S01 template) to a COPY of the facts for one account.
    Acts like a data source; the engine still detects from rows, never from labels."""
    t = dict(t)
    if inj.get("template") == "S13":
        return inject_stale_feed(t)
    aid = int(inj["account_id"])
    cut = pd.Timestamp(D0 - timedelta(days=28))
    o = t["orders"].copy()
    m = (o["account_id"] == aid) & (pd.to_datetime(o["order_date"]) >= cut)
    o.loc[m, "qty_ordered"] = (o.loc[m, "qty_ordered"] * 0.69).round().astype(int)
    o.loc[m, "qty_filled"] = (o.loc[m, "qty_ordered"] * 0.75).round().astype(int)
    o.loc[m, "value"] = o.loc[m, "value"] * 0.52
    o.loc[m, "delivered_date"] = pd.to_datetime(o.loc[m, "delivered_date"]) + pd.Timedelta(days=4)
    if "SKU-CKD-01" not in set(o[o["account_id"] == aid]["sku"]):
        add = o[m].head(4).copy()
        add["sku"] = "SKU-CKD-01"
        add["qty_filled"] = (add["qty_ordered"] * 0.6).round().astype(int)
        add["id"] = o["id"].max() + 1 + np.arange(len(add))
        o = pd.concat([o, add], ignore_index=True)
    t["orders"] = o
    c = t["complaints"].copy()
    rec = c[(c["account_id"] == aid)]
    base4 = max(2, int(round(len(rec) / (WEEKS / 4))))
    extra = []
    for k in range(int(round(base4 * 1.2)) + 3):
        extra.append({"id": int(c["id"].max()) + 1 + k, "account_id": aid,
                      "opened_at": datetime.combine(D0 - timedelta(days=1 + (k * 3) % 27), datetime.min.time()) + timedelta(hours=11),
                      "kind": "delivery", "sku": "SKU-CKD-01", "batch_id": None, "body": "Short supply against PO", "routed_to": "support"})
    t["complaints"] = pd.concat([c, pd.DataFrame(extra)], ignore_index=True)
    s = t["support_interactions"].copy()
    ms = (s["account_id"] == aid) & (pd.to_datetime(s["opened_at"]) >= cut)
    s.loc[ms, "first_response_at"] = pd.to_datetime(s.loc[ms, "opened_at"]) + (pd.to_datetime(s.loc[ms, "first_response_at"]) - pd.to_datetime(s.loc[ms, "opened_at"])) * 1.6
    t["support_interactions"] = s
    i = t["account_interactions"]
    mi = (i["account_id"] == aid) & (pd.to_datetime(i["occurred_at"]) >= cut)
    drop = i[mi].iloc[::2].index
    t["account_interactions"] = i.drop(index=drop)
    return t


def inject_stale_feed(t: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """S13 decoy (Lab only): orders feed last ingested 9 h ago with 14% duplicate rows for 20 accounts.
    The Data Health Guard must pause order-derived judgement instead of raising incidents."""
    feeds = t["source_feeds"].copy()
    m = feeds["system"] == "orders"
    feeds.loc[m, "last_ingested_at"] = SIM_NOW - timedelta(hours=9)
    feeds.loc[m, "duplicate_ratio"] = 0.14
    feeds.loc[m, "status"] = "degraded"
    t["source_feeds"] = feeds
    o = t["orders"]
    accs = sorted(o["account_id"].unique())[5:25]
    last = o[(o["account_id"].isin(accs)) & (pd.to_datetime(o["order_date"]) >= pd.Timestamp(D0 - timedelta(days=7)))]
    dup = last.copy()
    dup["id"] = o["id"].max() + 1 + np.arange(len(dup))
    t["orders"] = pd.concat([o, dup], ignore_index=True)
    t["duplicate_ratio_by_account"] = pd.DataFrame({"account_id": accs, "duplicate_ratio": [0.14] * len(accs)})
    return t


ENGINES: dict[str, Engine] = {}
_ENG_LOCK = threading.Lock()


def E() -> Engine:
    """The engine (data estate + detections) of the current request's company, built on first use."""
    cid = tenancy.company()
    eng = ENGINES.get(cid)
    if eng is None:
        with _ENG_LOCK:
            eng = ENGINES.get(cid)
            if eng is None:
                eng = ENGINES[cid] = Engine(tenancy.dataset(cid))
    return eng


# ------------------------------------------------------------------ helpers
def acc_name(aid: int | None) -> str:
    if aid is None:
        return ""
    return str(E().acc.loc[aid, "name"])


def inc_state(ref: str) -> dict[str, Any]:
    return state.get("incident_state", ref) or {"status": "detected"}


def confidence(inc: Incident) -> float:
    st = inc_state(inc.ref)
    if st.get("cause_confidence"):
        return float(st["cause_confidence"])
    return min(1.0, inc.n_sources / 4)


def summary(inc: Incident) -> dict[str, Any]:
    st = inc_state(inc.ref)
    a = E().acc.loc[inc.account_id] if inc.account_id else None
    region = E().regions.get(int(a["region_id"])) if a is not None else (E().regions.get(int(inc.scope_key)) if inc.scope == "region" else None)
    rank = inc.value_at_stake * confidence(inc) * URGENCY[inc.severity]
    return {"id": inc.ref, "ref": inc.ref, "kind": inc.kind, "title": inc.title, "account_id": inc.account_id,
            "account_name": acc_name(inc.account_id), "account_type": None if a is None else str(a["type"]), "region": region,
            "scope": inc.scope, "scope_key": inc.scope_key, "severity": inc.severity, "risk_score": inc.risk_score,
            "n_sources": inc.n_sources, "sources": inc.sources, "value_at_stake": round(inc.value_at_stake, 2),
            "status": st.get("status", "detected"), "cause": st.get("cause", "not_investigated"),
            "cause_confidence": st.get("cause_confidence"), "driver": inc.driver, "regulatory_sensitive": inc.regulatory_sensitive,
            "owner_role": inc.owner_role, "age_days": (D0 - datetime.fromisoformat(inc.onset).date()).days if inc.onset else None,
            "rank_score": round(rank, 2), "sim_run_id": inc.sim_run_id, "persistence_bonus": inc.persistence_bonus, **classify(inc, st)}


def classify(inc: Incident, st: dict[str, Any]) -> dict[str, Any]:
    """Descriptive category + workflow stage (config/taxonomy.ts mirrors this)."""
    cause = st.get("cause")
    if not cause or cause == "not_investigated":
        from .agents import cause_candidates
        cause = cause_candidates(inc)[0].cause  # same deterministic rules the Investigator uses; descriptive only
    cat = category_of(inc.kind, inc.regulatory_sensitive, cause if cause != "unknown" else None, inc.driver)
    plan = state.get("plans", st["plan_id"]) if st.get("plan_id") else None
    has_out = any(o["incident_id"] == inc.ref for o in state.all_("outcomes"))
    learned = state.get("memory_added", f"OUT-{inc.ref}") is not None
    stg = stage_of(st, plan, has_out, learned)
    return {"category": cat, "category_label": CATEGORY_LABEL[cat], "stage": stg, "stage_label": STAGE_LABEL[stg]}


def visible_to(inc: Incident, persona: str) -> bool:
    if persona in ("business_head", "operations_manager"):
        return True
    if inc.regulatory_sensitive:
        return persona == "qa_head"
    return inc.owner_role == persona or (persona == "support_manager" and "support" in inc.sources) or \
        (persona == "account_manager" and inc.scope == "account" and inc.kind == "risk") or \
        (persona == "sales_manager" and inc.kind == "opportunity")


def ranked(persona: str, kind: str | None = "risk") -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    items = [summary(i) for i in E().det.incidents if (kind is None or i.kind == kind) and visible_to(i, persona)
             and inc_state(i.ref).get("status") not in ("resolved", "dismissed")]
    items.sort(key=lambda x: (-int(x["regulatory_sensitive"]), -x["rank_score"]))
    shown, held = items[:BUDGET], items[BUDGET:]
    return shown, [{"ref": h["ref"], "title": h["title"], "reason": f"Below the daily Alert Budget of {BUDGET}: rank score {h['rank_score']:,.0f} (exposure x confidence x urgency) is lower than the shown items."} for h in held]


# ------------------------------------------------------------------ core
def sim_clock() -> datetime:
    """Simulated clock = data as-of time + days advanced in the Lab (data and detection stay as of SIM_NOW)."""
    return SIM_NOW + timedelta(days=int((state.get("clock", "lab") or {}).get("offset_days", 0)))


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "mode": MODE, "store": STORE, "llm_provider": LLM_PROVIDER, "retrieval": "tfidf",
            "sim_now": sim_clock().isoformat(), "data_as_of": SIM_NOW.isoformat(), "features": FEATURES, "seed": SEED_NAME, "engine_version": ENGINE_VERSION}


@app.get("/briefing")
def briefing(persona: str = "operations_manager") -> dict[str, Any]:
    e = E()
    shown, held = ranked(persona, None)
    risks = [x for x in shown if x["kind"] == "risk"]
    opps = [x for x in shown if x["kind"] == "opportunity"]
    qa = [i for i in e.det.incidents if i.regulatory_sensitive]
    hour = SIM_NOW.hour
    greeting = "Good morning" if hour < 12 else ("Good afternoon" if hour < 17 else "Good evening")
    n_sys = len(e.t["source_feeds"])
    s = (f"Overnight Strata checked {e.det.signals_checked:,} signals across {len(e.acc)} accounts and {n_sys} connected source systems. "
         f"{len(risks)} risk item{'s' if len(risks) != 1 else ''} need{'s' if len(risks) == 1 else ''} you today"
         f"{', ' + str(len(opps)) + ' is an opportunity' if len(opps) == 1 else (', ' + str(len(opps)) + ' are opportunities' if opps else '')}"
         f"{', and ' + str(len(qa)) + ' quality reports are routed to the QA head' if qa and persona in ('operations_manager', 'business_head', 'qa_head') else ''}.")
    notes = [n for n in state.all_("notes") if persona in n.get("mentions", [])][-5:]
    return {"persona": persona, "role_label": ROLE_LABELS.get(persona, persona), "sim_now": SIM_NOW.isoformat(), "greeting": greeting,
            "signals_checked": e.det.signals_checked, "sources_count": n_sys, "accounts_count": len(e.acc),
            "need_you": len(risks), "opportunities": len(opps), "qa_routed": len(qa), "summary": s,
            "priorities": shown, "held_back": held, "notes_for_you": notes}


@app.get("/risks")
def risks(persona: str = "operations_manager") -> dict[str, Any]:
    shown, held = ranked(persona, "risk")
    total = len([i for i in E().det.incidents if i.kind == "risk"])
    return {"items": shown, "held_back": held, "budget": BUDGET, "shown": len(shown), "total": total}


@app.get("/opportunities")
def opportunities() -> dict[str, Any]:
    return {"items": [summary(i) for i in E().det.incidents if i.kind == "opportunity"]}


@app.get("/incidents")
def incidents() -> dict[str, Any]:
    return {"items": [summary(i) for i in E().det.incidents]}


def incident_or_404(ref: str) -> Incident:
    inc = E().by_ref.get(ref)
    if not inc:
        raise HTTPException(404, f"incident {ref} not found")
    return inc


@app.get("/incidents/{ref}")
def incident(ref: str) -> dict[str, Any]:
    inc = incident_or_404(ref)
    st = inc_state(ref)
    plan = state.get("plans", st["plan_id"]) if st.get("plan_id") else None
    if plan:
        plan["approvals"] = [a for a in state.all_("approvals") if a["plan_id"] == plan["id"]]
    d = summary(inc)
    d.update({
        "onset_estimated_at": inc.onset, "first_detected_at": SIM_NOW.isoformat(),
        "silent_period_days": inc.silent_period_days, "silent_period_basis": inc.silent_basis,
        "evidence": [s.to_dict("supporting") for s in inc.evidence] + [s.to_dict("context") for s in inc.context],
        "blast_radius": [{**b, "account_name": acc_name(b["account_id"])} for b in inc.blast],
        "investigation": st.get("investigation"), "plan": plan,
        "approvals": plan["approvals"] if plan else [],
        "tasks": [t for t in state.all_("tasks") if t.get("incident_id") == ref],
        "outcomes": [o for o in state.all_("outcomes") if o["incident_id"] == ref],
        "notes": [n for n in state.all_("notes") if n.get("incident_id") == ref],
    })
    return d


# ------------------------------------------------------------------ agents
@app.post("/incidents/{ref}/investigate")
def investigate(ref: str) -> dict[str, Any]:
    inc = incident_or_404(ref)
    res = run_investigation(inc, E().retr, E().sops, acc_name(inc.account_id))
    plan_in = res.pop("plan")
    run_id = f"RUN-{state.next_id('runs'):04d}"
    res["run_id"], res["mode"] = run_id, MODE
    state.put("runs", run_id, {"incident_id": ref, **res})
    for st in res["steps"]:
        state.audit("agent", st["agent"], "agent.step", "incident", ref, {"run_id": run_id, "summary": st["summary"]})
    st = inc_state(ref)
    prev = state.get("plans", st["plan_id"]) if st.get("plan_id") else None
    if prev and prev["status"] in ("approved", "modified"):
        # a plan is already executing: record the new trace but do not propose a second plan
        st.update({"investigation": res})
        state.put("incident_state", ref, st)
        return res
    if prev and prev["status"] == "awaiting_approval":
        prev["status"] = "superseded"
        state.put("plans", prev["id"], prev)
        state.audit("agent", "orchestrator", "plan.superseded", "plan", prev["id"], {"incident": ref, "by_run": run_id})
    pid = f"PLAN-{state.next_id('plans'):04d}"
    plan = {"id": pid, "incident_id": ref, "version": (prev or {}).get("version", 0) + 1, "status": "awaiting_approval", **plan_in, "created_by_run": run_id}
    state.put("plans", pid, plan)
    st.update({"status": "awaiting_approval", "investigation": res, "plan_id": pid, "cause": res["cause"], "cause_confidence": res["cause_confidence"]})
    state.put("incident_state", ref, st)
    state.audit("agent", "orchestrator", "plan.proposed", "plan", pid, {"incident": ref, "requires_role": plan["requires_role"], "four_eyes": plan["four_eyes"]})
    return res


@app.post("/incidents/{ref}/plan")
def get_plan(ref: str) -> dict[str, Any]:
    st = inc_state(ref)
    if not st.get("plan_id"):
        investigate(ref)
        st = inc_state(ref)
    return state.get("plans", st["plan_id"]) or {}


@app.get("/memory/items")
def memory_items(kind: str | None = None) -> dict[str, Any]:
    used: dict[str, int] = {}
    for r in state.all_("runs"):
        for m in r.get("memory_matches", [])[:1]:
            used[m["ref"]] = used.get(m["ref"], 0) + 1
    for p in state.all_("plans"):
        if p.get("sop_ref"):
            used[p["sop_ref"]] = used.get(p["sop_ref"], 0) + 1
    items = [{"ref": m["ref"], "kind": m.get("kind", "incident"), "title": m["title"], "body": m.get("body", ""), "cause": m.get("cause"),
              "account_type": m.get("account_type"), "outcome": m.get("outcome"), "authored_by": m.get("authored_by", "DRAFT - TEAM TO REVIEW"),
              "used_count": used.get(m["ref"], 0), "steps": m.get("steps", []), "signals": m.get("signals", []),
              "resolution": m.get("resolution"), "date": m.get("date")} for m in E().memory if kind is None or m.get("kind") == kind]
    return {"items": items}


@app.get("/memory/search")
def memory_search(q: str) -> dict[str, Any]:
    return {"items": E().retr.search(q), "retrieval": "tfidf"}


class AskIn(BaseModel):
    question: str
    persona: str = "operations_manager"


@app.post("/ask")
def ask(body: AskIn) -> dict[str, Any]:
    q = body.question.lower()
    e = E()
    shown, _ = ranked(body.persona, None)
    cards: list[dict[str, Any]] = []

    def inc_card(s: dict[str, Any]) -> dict[str, Any]:
        inc = e.by_ref[s["ref"]]
        ev = [x for x in inc.evidence if x.is_adverse][:4]
        return {"title": f"{s['ref']} · {s['title']}", "body": f"{s['severity'].title()} (risk {s['risk_score']}), {s['n_sources']} source systems agree: "
                + ", ".join(LABELS.get(x.signal_key, x.signal_key) for x in ev) + f". Revenue exposure {s['value_at_stake']:,.0f} INR (baseline 12-week order value, not a loss forecast).",
                "evidence": [{"id": x.id, "label": LABELS.get(x.signal_key, x.signal_key)} for x in ev], "link": f"/app/incidents/{s['ref']}"}

    if any(w in q for w in ("top", "walk me", "first", "incident", "urgent")):
        cards = [inc_card(s) for s in shown if s["kind"] == "risk"][:1]
    elif any(w in q for w in ("money", "losing", "revenue", "exposure", "rupee")):
        cards = [inc_card(s) for s in sorted(shown, key=lambda x: -x["value_at_stake"]) if s["kind"] == "risk"][:3]
    elif any(w in q for w in ("changed", "yesterday", "new", "since")):
        cards = [inc_card(s) for s in sorted(shown, key=lambda x: x["age_days"] or 0)][:3]
    elif any(w in q for w in ("opportunit", "growth", "cross")):
        cards = [inc_card(s) for s in shown if s["kind"] == "opportunity"][:3]
    else:
        hits = e.retr.search(body.question, 3)
        for h in hits:
            m = next(x for x in e.memory if x["ref"] == h["ref"])
            cards.append({"title": f"{m['ref']} · {m['title']}", "body": (m.get("body") or "")[:280],
                          "evidence": [{"id": m["ref"], "label": f"memory ({m.get('authored_by')})"}], "link": "/app/memory"})
    return {"cards": cards, "refused": not cards,
            "message": None if cards else "Strata answers only from evidence it holds. Nothing matched; try 'top incident', 'losing money', 'what changed' or 'opportunities'."}


# ------------------------------------------------------------------ act
class DecisionIn(BaseModel):
    decision: str
    reason: str | None = None
    persona: str
    decided_by: str


@app.get("/approvals")
def approvals(persona: str = "operations_manager") -> dict[str, Any]:
    out = []
    for p in state.all_("plans"):
        if p["status"] != "awaiting_approval":
            continue
        inc = E().by_ref.get(p["incident_id"])
        if not inc:
            continue
        aps = [a for a in state.all_("approvals") if a["plan_id"] == p["id"] and a["decision"] == "approved"]
        created = next((r["wall_at"] for r in state.audit_rows() if r["action"] == "plan.proposed" and r["entity_id"] == p["id"]), None)
        waiting = (datetime.fromisoformat(state.wall_now()) - datetime.fromisoformat(created)).total_seconds() / 3600 if created else 0
        out.append({"plan_id": p["id"], "incident_id": inc.ref, "ref": inc.ref, "title": inc.title, "severity": inc.severity,
                    "requires_role": p["requires_role"], "four_eyes": p["four_eyes"], "approvals_so_far": len(aps),
                    "waiting_hours": round(waiting, 2), "value_at_stake": p["value_at_stake"]})
    return {"items": out}


@app.post("/plans/{pid}/decision")
def decide(pid: str, body: DecisionIn) -> dict[str, Any]:
    plan = state.get("plans", pid)
    if not plan:
        raise HTTPException(404, "plan not found")
    if plan["status"] != "awaiting_approval":
        raise HTTPException(400, f"plan is already {plan['status']}")
    if body.decision not in ("approved", "modified", "rejected"):
        raise HTTPException(400, "decision must be approved, modified or rejected")
    if body.decision in ("modified", "rejected") and not (body.reason and body.reason.strip()):
        raise HTTPException(400, "A reason is required to modify or reject a plan.")
    req = plan["requires_role"]
    allowed = {req} if req == "qa_head" else {req, "operations_manager", "business_head"}
    if body.persona not in allowed:
        allowed_txt = " / ".join(ROLE_LABELS[r] for r in sorted(allowed))
        raise HTTPException(403, f"Your role cannot decide this plan. Allowed: {allowed_txt}.")
    prior = [a for a in state.all_("approvals") if a["plan_id"] == pid and a["decision"] == "approved"]
    if body.decision == "approved" and plan["four_eyes"] and any(a["decided_by"].strip().lower() == body.decided_by.strip().lower() for a in prior):
        raise HTTPException(400, "Four-eyes rule: the second approval must come from a different person.")
    aid = f"APR-{state.next_id('approvals'):04d}"
    rec = {"id": aid, "plan_id": pid, "decided_by": body.decided_by, "decider_role": body.persona, "decision": body.decision,
           "reason": body.reason, "decided_at": state.wall_now()}
    state.put("approvals", aid, rec)
    state.audit("human", body.decided_by, f"plan.{body.decision}", "plan", pid, {"role": body.persona, "reason": body.reason, "incident": plan["incident_id"]})
    ref = plan["incident_id"]
    st = inc_state(ref)
    tasks_created = 0
    if body.decision == "rejected":
        plan["status"] = "rejected"
        st["status"] = "rejected"
        state.put("memory_added", f"NEG-{pid}", {"ref": f"NEG-{pid}", "kind": "resolution", "title": f"Rejected plan for {ref}", "body": f"Reason given by {body.decided_by}: {body.reason}",
                                                 "cause": st.get("cause"), "authored_by": body.decided_by, "outcome": "rejected", "signals": []})
        msg = "Plan rejected. The reason is stored as memory and will be shown next time."
    elif body.decision == "approved" and plan["four_eyes"] and len(prior) == 0:
        msg = "First approval recorded. Four-eyes rule: a second, different approver is required."
    else:
        plan["status"] = "approved" if body.decision == "approved" else "modified"
        st["status"] = "executing"
        inc = E().by_ref[ref]
        for s in plan["steps"]:
            tid = f"T-{state.next_id('tasks'):04d}"
            state.put("tasks", tid, {"id": tid, "plan_id": pid, "incident_id": ref, "incident_ref": ref, "title": s["action"],
                                     "owner_role": s["owner_role"], "due_at": (SIM_NOW + timedelta(hours=s["due_in_hours"])).isoformat(),
                                     "status": "open", "channel": "task", "origin": "incident_plan", "account_id": inc.account_id,
                                     "payload": {"evidence_ids": s["evidence_ids"], "source": s["source"]}, "simulated": True, "created_at": SIM_NOW.isoformat()})
            state.audit("system", "orchestrator", "task.created", "task", tid, {"plan": pid, "simulated": True})
            tasks_created += 1
        for dr in plan.get("drafts", []):
            tid = f"T-{state.next_id('tasks'):04d}"
            state.put("tasks", tid, {"id": tid, "plan_id": pid, "incident_id": ref, "incident_ref": ref, "title": dr["subject"],
                                     "owner_role": dr["to_role"], "due_at": (SIM_NOW + timedelta(hours=4)).isoformat(), "status": "open",
                                     "channel": dr["channel"], "origin": "incident_plan", "account_id": inc.account_id,
                                     "payload": dr, "simulated": True, "created_at": SIM_NOW.isoformat()})
            state.audit("system", "orchestrator", "draft.created", "task", tid, {"channel": dr["channel"], "simulated": True, "sent": False})
            tasks_created += 1
        msg = f"Plan {plan['status']}. {tasks_created} simulated tasks and drafts created. Nothing was sent externally."
    state.put("plans", pid, plan)
    state.put("incident_state", ref, st)
    return {"ok": True, "incident_status": st["status"], "tasks_created": tasks_created, "message": msg}


@app.get("/workflows")
def workflows(persona: str | None = None) -> dict[str, Any]:
    items = state.all_("tasks")
    if persona and persona not in ("operations_manager", "business_head"):
        items = [t for t in items if t["owner_role"] == persona]
    return {"items": items}


class TaskPatch(BaseModel):
    status: str
    persona: str = "operations_manager"


@app.patch("/workflows/{tid}")
def patch_task(tid: str, body: TaskPatch) -> dict[str, Any]:
    t = state.get("tasks", tid)
    if not t:
        raise HTTPException(404, "task not found")
    if body.status not in ("open", "in_progress", "done", "blocked"):
        raise HTTPException(400, "bad status")
    t["status"] = body.status
    if body.status == "done":
        t["completed_at"] = SIM_NOW.isoformat()
    state.put("tasks", tid, t)
    state.audit("human", ROLE_LABELS.get(body.persona, body.persona), "task.status", "task", tid, {"status": body.status})
    return t


@app.get("/outcomes")
def outcomes() -> dict[str, Any]:
    return {"items": state.all_("outcomes")}


class NoteIn(BaseModel):
    author_role: str
    author: str
    body: str
    mentions: list[str] = []
    incident_id: str | None = None
    account_id: int | None = None


@app.get("/notes")
def notes(persona: str | None = None) -> dict[str, Any]:
    items = state.all_("notes")
    if persona:
        items = [n for n in items if persona in n.get("mentions", []) or n["author_role"] == persona]
    return {"items": list(reversed(items))}


@app.post("/notes")
def add_note(body: NoteIn) -> dict[str, Any]:
    if not body.body.strip():
        raise HTTPException(400, "empty note")
    nid = f"N-{state.next_id('notes'):04d}"
    import re as _re
    alias = {"ops": "operations_manager", "operations": "operations_manager", "account": "account_manager", "am": "account_manager",
             "sales": "sales_manager", "support": "support_manager", "business": "business_head", "head": "business_head", "qa": "qa_head"}
    found = {alias.get(m.lower(), m.lower()) for m in _re.findall(r"@(\w+)", body.body)}
    mentions = sorted(set(body.mentions) | {m for m in found if m in ROLE_LABELS})
    rec = {"id": nid, "created_at": state.wall_now(), **body.model_dump(), "mentions": mentions}
    state.put("notes", nid, rec)
    state.audit("human", body.author, "note.posted", "note", nid, {"mentions": mentions, "incident": body.incident_id})
    return rec


# ------------------------------------------------------------------ accounts (A21)
def acc_signals(aid: int) -> list[Any]:
    return E().det.acc_sigs.get(aid, [])


def nba(aid: int) -> list[dict[str, Any]]:
    a = E().acc.loc[aid]
    sig = {s.signal_key: s for s in acc_signals(aid)}
    opp = next((i for i in E().det.incidents if i.kind == "opportunity" and i.account_id == aid), None)
    out = []

    def adv(k: str) -> bool:
        return k in sig and sig[k].is_adverse

    def pct(k: str) -> str:
        d = sig[k].delta or 0
        return f"{'+' if d > 0 else '-'}{abs(round(100 * d))}%"

    for r in ENGAGEMENT["next_best_actions"]:
        rid, txt, ev = r["id"], None, []
        if rid == "ER01" and adv("interaction_frequency_delta") and a["tier"] in ("A", "B"):
            txt, ev = r["action"].replace("{interaction_delta}", pct("interaction_frequency_delta")), [sig["interaction_frequency_delta"].id]
        elif rid == "ER02" and opp:
            g = opp.evidence[0]
            txt, ev = r["action"].replace("{growth}", f"+{round(100 * g.value)}%"), [g.id]
        elif rid == "ER05" and adv("overdue_receivable_ratio") and adv("order_volume_delta"):
            txt = r["action"].replace("{overdue_ratio}", f"{round(100 * sig['overdue_receivable_ratio'].value)}%")
            ev = [sig["overdue_receivable_ratio"].id, sig["order_volume_delta"].id]
        elif rid == "ER06" and adv("prescriber_visit_gap_days") and a["type"] in ("hospital_pharmacy", "nephrology_clinic"):
            txt, ev = r["action"].replace("{visit_gap_days}", str(int(sig["prescriber_visit_gap_days"].value))), [sig["prescriber_visit_gap_days"].id]
        elif rid == "ER07" and adv("complaint_count_delta") and adv("response_time_delta"):
            txt, ev = r["action"].replace("{response_delta}", pct("response_time_delta")), [sig["complaint_count_delta"].id, sig["response_time_delta"].id]
        if txt:
            out.append({"rule_id": rid, "text": txt, "owner_role": r["owner_role"], "draft_channel": r["draft_channel"],
                        "due_in_hours": r["due_in_hours"], "evidence_ids": ev, "authored_by": ENGAGEMENT["authored_by"]})
    return out[:3]


@app.get("/accounts")
def accounts(q: str | None = None, type: str | None = None, region: str | None = None) -> dict[str, Any]:
    e = E()
    open_by = {}
    for i in e.det.incidents:
        if i.account_id:
            open_by[i.account_id] = open_by.get(i.account_id, 0) + 1
        for b in i.blast:
            pass
    items = []
    for aid, a in e.acc.iterrows():
        sc, n, _ = e.det.account_scores.get(int(aid), (0, 0, []))
        rg = e.regions[int(a["region_id"])]
        if q and q.lower() not in (str(a["name"]) + str(aid)).lower():
            continue
        if type and a["type"] != type:
            continue
        if region and rg != region:
            continue
        sev = next((i.severity for i in e.det.incidents if i.account_id == int(aid) and i.kind == "risk"), None)
        from .signals import band
        items.append({"id": int(aid), "name": a["name"], "type": a["type"], "type_label": tenancy.type_label(a["type"]), "region": rg, "tier": a["tier"],
                      "value_12w": round(e.det.value_12w[int(aid)], 2), "risk_score": sc, "severity": sev or band(sc), "open_incidents": open_by.get(int(aid), 0)})
    items.sort(key=lambda x: (-x["risk_score"], -x["value_12w"]))
    return {"items": items}


@app.get("/accounts/{aid}")
def account(aid: int) -> dict[str, Any]:
    e = E()
    if aid not in e.acc.index:
        raise HTTPException(404, "account not found")
    a = e.acc.loc[aid]
    f = e.det.frames
    k = f.pos[aid]
    med = float(np.nanmedian(roll4(f.units_adj)[k, 3:WEEKS - 5]) / 4)
    inter = f.i[f.i["account_id"] == aid].sort_values("occurred_at", ascending=False).head(10)
    rep = e.reps.loc[int(a["rep_id"])]
    return {"account": {"id": aid, "name": a["name"], "type": a["type"], "type_label": tenancy.type_label(a["type"]), "region": e.regions[int(a["region_id"])],
                        "city": a["city"], "tier": a["tier"], "rep": rep["name"], "rep_active": bool(rep["active"]), "onboarded_on": str(a["onboarded_on"])},
            "value_12w": round(e.det.value_12w[aid], 2),
            "trend": {"labels": f.week_labels[-26:], "units": [round(float(x), 1) for x in f.units_adj[k, -26:]], "baseline": round(med, 1)},
            "signals": [s.to_dict() for s in acc_signals(aid)],
            "interactions": [{"occurred_at": str(r["occurred_at"]), "kind": r["kind"], "rep": e.reps.loc[int(r["rep_id"]), "name"] if pd.notna(r["rep_id"]) else None,
                              "duration_min": int(r["duration_min"]), "prescriber": bool(pd.notna(r["prescriber_id"]))} for _, r in inter.iterrows()],
            "open_tasks": [t for t in state.all_("tasks") if t.get("account_id") == aid and t["status"] != "done"],
            "next_best_actions": nba(aid),
            "notes": [n for n in state.all_("notes") if n.get("account_id") == aid],
            "incidents": [summary(i) for i in e.det.incidents if i.account_id == aid or any(b["account_id"] == aid for b in i.blast)],
            "customer_definition": ENGAGEMENT["customer_definition"]}


# ------------------------------------------------------------------ health / sources
def pillars_at(end: int) -> dict[str, float]:
    f = E().det.frames
    sl = slice(end - 3, end + 1)
    fill = f.filled[:, sl].sum() / max(f.units[:, sl].sum(), 1)
    s = f.s
    win = s[(s["w"] >= end - 3) & (s["w"] <= end)]
    sla = float((win["resp_h"] <= 8).mean()) if len(win) else 1.0
    touch_now = f.touch[:, sl].sum()
    touch_base = np.median([f.touch[:, i - 3:i + 1].sum() for i in range(3, WEEKS - 5)])
    units_now = f.units_adj[:, sl].sum()
    units_base = np.median([f.units_adj[:, i - 3:i + 1].sum() for i in range(3, WEEKS - 5)])
    scores = E().det.account_scores
    v = E().det.value_12w
    tot = sum(v.values())
    at_risk = sum(v[a] for a, (sc, _, _) in scores.items() if sc >= 50) / tot if end == WEEKS - 1 else None
    return {"customer_health": 100 * (1 - at_risk) if at_risk is not None else float("nan"),
            "supply_continuity": 100 * fill, "service_quality": 100 * sla,
            "field_coverage": 100 * min(1.0, touch_now / touch_base), "commercial_momentum": float(np.clip(50 + 100 * (units_now / units_base - 1), 0, 100))}


PILLARS = [
    ("customer_health", "Customer health", "Share of baseline order value held by accounts with no elevated-or-worse risk.", "A drop means more of the business sits with customers showing a multi-signal risk pattern."),
    ("supply_continuity", "Supply continuity", "Portfolio fill rate over the last 4 weeks: units shipped / units ordered.", "Below the high-90s usually means a supply-side problem we caused, not demand."),
    ("service_quality", "Service quality", "Share of support tickets answered within the 8-hour SLA in the last 4 weeks.", "Falling SLA compliance makes supply problems feel like neglect to customers."),
    ("field_coverage", "Field coverage", "Touchpoints in the last 4 weeks vs the portfolio's normal 4-week level (capped at 100).", "Relationships fade quietly before orders fall."),
    ("commercial_momentum", "Commercial momentum", "50 + percentage change in seasonality-adjusted units vs the normal 4-week level.", "Above 50 means growing after seasonality; below 50 means shrinking."),
]


@app.get("/portfolio/health")
def portfolio_health() -> dict[str, Any]:
    now = pillars_at(WEEKS - 1)
    prev = pillars_at(WEEKS - 5)
    prev["customer_health"] = now["customer_health"]  # point-in-time only (needs a backtest run); delta shown as n/a
    pil = []
    for key, label, meaning, impl in PILLARS:
        pil.append({"key": key, "label": label, "value": round(now[key], 1),
                    "delta_4w": None if key == "customer_health" else round(now[key] - prev[key], 1), "meaning": meaning, "implication": impl, "provenance": "computed"})
    idx = float(np.mean([now[k] for k, *_ in PILLARS]))
    idx_prev = float(np.mean([prev[k] for k, *_ in PILLARS]))
    f = E().det.frames
    movers = []
    for inc in E().det.incidents:
        if inc.account_id and inc.kind == "risk":
            top = max([s for s in inc.evidence if s.scope == "account" and s.delta is not None], key=lambda s: s.p, default=None)
            if top:
                movers.append({"account_id": inc.account_id, "account_name": acc_name(inc.account_id), "signal_key": top.signal_key,
                               "label": LABELS.get(top.signal_key), "delta": round(top.delta, 3), "severity": inc.severity, "ref": inc.ref})
    mix = []
    for t_, g in E().acc.groupby("type"):
        mix.append({"type": t_, "label": tenancy.type_label(t_), "count": int(len(g)), "value_12w": round(sum(E().det.value_12w[int(a)] for a in g.index), 2)})
    wk = slice(WEEKS - 12, WEEKS)
    return {"index": {"value": round(idx, 1), "delta_4w": round(idx - idx_prev, 1), "provenance": "computed"}, "pillars": pil, "movers": movers[:6],
            "activity": {"weeks": f.week_labels[wk], "orders": [int(x) for x in f.units.sum(axis=0)[wk]],
                         "tickets": [int(x) for x in f.tickets.sum(axis=0)[wk]], "visits": [int(x) for x in f.visits.sum(axis=0)[wk]]},
            "mix": mix}


@app.get("/sources")
def sources() -> dict[str, Any]:
    feeds = []
    for _, fd in E().t["source_feeds"].iterrows():
        lag = (SIM_NOW - pd.Timestamp(fd["last_ingested_at"]).to_pydatetime()).total_seconds() / 60 / fd["expected_every_minutes"]
        feeds.append({"system": fd["system"], "label": fd.get("label", fd["system"]), "last_ingested_at": pd.Timestamp(fd["last_ingested_at"]).isoformat(),
                      "expected_every_minutes": int(fd["expected_every_minutes"]), "rows_last_run": int(fd["rows_last_run"]),
                      "duplicate_ratio": float(fd["duplicate_ratio"]), "status": fd["status"] if lag <= 3 else "stale", "lag_multiple": round(lag, 2)})
    cat = [{"key": s["key"], "label": LABELS.get(s["key"], s["key"]), "class": s["class"], "source": s["source"], "definition": s["definition"],
            "adverse": s["adverse"], "weight": s["weight"], "caption": s["caption"], "regulatory_sensitive": bool(s.get("regulatory_sensitive", False)),
            "scope": s.get("scope", "account")} for s in CATALOG["signals"]]
    return {"feeds": feeds, "catalog": cat, "notices": E().det.notices}


@app.get("/signals/catalog")
def signal_catalog() -> dict[str, Any]:
    return {"items": sources()["catalog"]}


# ------------------------------------------------------------------ assure
@app.get("/audit")
def audit() -> dict[str, Any]:
    v = state.verify_chain()
    return {"items": list(reversed(state.audit_rows()))[:500], "verified": v["ok"], "verify": v}


@app.get("/audit/verify")
def audit_verify() -> dict[str, Any]:
    return state.verify_chain()


@app.get("/audit.csv", response_class=PlainTextResponse)
def audit_csv() -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "at", "wall_at", "actor_type", "actor", "action", "entity_type", "entity_id", "detail", "prev_hash", "hash"])
    for r in state.audit_rows():
        w.writerow([r["id"], r["at"], r["wall_at"], r["actor_type"], r["actor"], r["action"], r["entity_type"], r["entity_id"], json.dumps(r["detail"]), r["prev_hash"], r["hash"]])
    return buf.getvalue()


@app.get("/time-to-action")
def time_to_action() -> dict[str, Any]:
    rows = state.audit_rows()
    det = {}
    for r in rows:
        if r["action"] == "incident.detected":
            det[r["entity_id"]] = r["wall_at"]
    items = []
    plans = {p["id"]: p for p in state.all_("plans")}
    for r in rows:
        if r["action"] in ("plan.approved", "plan.modified"):
            p = plans.get(r["entity_id"])
            if not p or p["status"] not in ("approved", "modified"):
                continue
            ref = p["incident_id"]
            if ref in det and not any(i["ref"] == ref for i in items):
                sec = (datetime.fromisoformat(r["wall_at"]) - datetime.fromisoformat(det[ref])).total_seconds()
                items.append({"ref": ref, "detected_wall_at": det[ref], "approved_wall_at": r["wall_at"], "seconds": round(sec, 1)})
    med = float(np.median([i["seconds"] for i in items])) if items else None
    silent = [{"ref": i.ref, "title": i.title, "silent_period_days": i.silent_period_days, "basis": i.silent_basis}
              for i in E().det.incidents if i.silent_period_days is not None]
    return {"items": items, "median_seconds": med, "n": len(items),
            "manual_baseline_minutes": {"value": 15, "provenance": "illustrative", "note": "Deck slide 15 figure; not measured. Replace with the mentor's real number."},
            "silent_periods": silent}


@app.get("/eval/latest")
def eval_latest() -> dict[str, Any]:
    p = STORE_DIR / "eval_latest.json"
    if not p.exists():
        return {"runs": [], "caveat": "Run `npm run eval` to produce evaluation results."}
    return json.loads(p.read_text())


# ------------------------------------------------------------------ lab
class AdvanceIn(BaseModel):
    days: int = 14


@app.post("/lab/advance")
def lab_advance(body: AdvanceIn) -> dict[str, Any]:
    """Fast-forward (A12): applies a SCRIPTED counterfactual to executing incidents (provenance illustrative),
    records outcomes and writes them back to memory (kind=outcome, authored_by=strata-system). Runs approved routines."""
    written, n = [], 0
    offset = int((state.get("clock", "lab") or {}).get("offset_days", 0)) + body.days
    state.put("clock", "lab", {"offset_days": offset})
    new_now = SIM_NOW + timedelta(days=offset)
    for ref, inc in E().by_ref.items():
        st = inc_state(ref)
        if st.get("status") != "executing":
            continue
        for ev in [e for e in inc.evidence if e.scope == "account" and e.delta is not None][:2]:
            after = round(ev.delta * 0.25, 3)
            oid = f"O-{state.next_id('outcomes'):04d}"
            state.put("outcomes", oid, {"id": oid, "incident_id": ref, "ref": ref, "kpi": LABELS.get(ev.signal_key), "before_value": round(ev.delta, 3),
                                        "after_value": after, "verdict": "improved", "provenance": "illustrative", "measured_at": new_now.isoformat(),
                                        "notes": f"Scripted counterfactual after {body.days} simulated days: the planted effect is reduced by 75% in the Lab. Not a measured result."})
            n += 1
        mref = f"OUT-{ref}"
        state.put("memory_added", mref, {"ref": mref, "kind": "outcome", "title": f"Outcome of {ref}: {inc.title}", "cause": st.get("cause"),
                                         "body": f"Plan {st.get('plan_id')} was approved and executed in the simulation. Lab fast-forward ({body.days} days) shows the leading signals recovering (scripted counterfactual, illustrative).",
                                         "signals": sorted({e.signal_key for e in inc.evidence}), "outcome": "customer_retained", "authored_by": "strata-system",
                                         "resolution": "; ".join(s["action"] for s in (state.get("plans", st["plan_id"]) or {}).get("steps", [])[:3])})
        st["status"] = "resolved"
        state.put("incident_state", ref, st)
        state.audit("system", "lab", "outcome.recorded", "incident", ref, {"days": body.days, "provenance": "illustrative"})
        state.audit("system", "memory", "memory.written", "memory", mref, {"authored_by": "strata-system"})
        written.append(mref)
    runs = run_routines(offset)
    E().memory = load_memory(state.all_("memory_added"))
    E().retr = Retriever(E().memory)
    state.audit("system", "lab", "clock.advanced", "clock", "lab", {"days": body.days, "sim_now": new_now.isoformat()})
    return {"sim_now": new_now.isoformat(), "outcomes_recorded": n, "memory_written": written, "routine_outputs": runs}


@app.post("/lab/reset")
def lab_reset() -> dict[str, Any]:
    state.reset_simulated()
    E().injections = []
    E().refresh()
    return {"ok": True}


class InjectIn(BaseModel):
    account_id: int | None = None
    template: str = "S01"


@app.post("/lab/inject")
def lab_inject(body: InjectIn) -> dict[str, Any]:
    e = E()
    if body.template == "S13":
        run_id = f"LAB-{len(e.injections) + 1:03d}"
        before = {i.ref for i in e.det.incidents}
        inj = {"account_id": -1, "template": "S13", "run_id": run_id}
        e.injections.append(inj)
        state.put("lab_injections", run_id, inj)
        state.audit("human", "lab", "lab.inject", "feed", "orders", {"template": "S13 stale + duplicated orders feed", "run_id": run_id})
        e.refresh()
        return {"run_id": run_id, "template": "S13", "notices": e.det.notices,
                "new_incidents": [i.ref for i in e.det.incidents if i.ref not in before],
                "message": "Orders feed marked stale with duplicate rows. Data Health Guard paused order-derived signals; see Sources & Signals."}
    aid = body.account_id
    if aid is None:
        busy = {i.account_id for i in e.det.incidents} | {x["account_id"] for x in e.injections}
        cand = e.acc[(e.acc["type"] == "stockist") & (e.acc["tier"] == "A") & (~e.acc.index.isin(list(busy)))]
        aid = int(cand.index[len(e.injections) % len(cand)])
    run_id = f"LAB-{len(e.injections) + 1:03d}"
    inj = {"account_id": aid, "template": "S01", "run_id": run_id}
    e.injections.append(inj)
    state.put("lab_injections", run_id, inj)
    state.audit("human", "lab", "lab.inject", "account", str(aid), {"template": "S01 supplier-delay pattern", "run_id": run_id})
    e.refresh()
    inc = next((i for i in e.det.incidents if i.account_id == aid), None)
    return {"run_id": run_id, "account_id": aid, "account_name": acc_name(aid), "incident_ref": inc.ref if inc else None,
            "severity": inc.severity if inc else None, "risk_score": inc.risk_score if inc else None}


# ------------------------------------------------------------------ routines (A22)
@app.get("/routines")
def routines() -> dict[str, Any]:
    out = []
    for r in ENGAGEMENT["standing_routines"]:
        st = state.get("routines", r["id"]) or {"status": "proposed"}
        out.append({**r, **st, "runs": [x for x in state.all_("routine_runs") if x["routine_id"] == r["id"]]})
    return {"items": out}


class RoutineApprove(BaseModel):
    persona: str
    decided_by: str


@app.post("/routines/{rid}/approve")
def approve_routine(rid: str, body: RoutineApprove) -> dict[str, Any]:
    if rid not in {r["id"] for r in ENGAGEMENT["standing_routines"]}:
        raise HTTPException(404, "routine not found")
    rec = {"status": "approved", "approved_by": body.decided_by, "approved_role": body.persona, "approved_at": state.wall_now(), "last_run_sim": None}
    state.put("routines", rid, rec)
    state.audit("human", body.decided_by, "routine.approved", "routine", rid, {"kind": "standing", "role": body.persona})
    return rec


def run_routines(days: int) -> list[dict[str, Any]]:
    out = []
    for r in ENGAGEMENT["standing_routines"]:
        st = state.get("routines", r["id"])
        if not st or st.get("status") != "approved":
            continue
        created = []
        if r["id"] == "RT01":
            for persona in ("operations_manager", "account_manager", "support_manager"):
                b = briefing(persona)
                created.append(_task(f"Weekly digest for {ROLE_LABELS[persona]}", persona, "digest", "routine", None, {"summary": b["summary"], "top": [p["ref"] for p in b["priorities"]]}))
        elif r["id"] == "RT02":
            for aid in list(E().acc.index):
                acts = [x for x in nba(int(aid)) if x["rule_id"] in ("ER01", "ER06")]
                if acts and not any(t.get("account_id") == int(aid) and t["status"] != "done" for t in state.all_("tasks")):
                    created.append(_task(acts[0]["text"], "account_manager", "task", "routine", int(aid), {"rule_id": acts[0]["rule_id"], "evidence_ids": acts[0]["evidence_ids"]}))
                if len(created) >= 5:
                    break
        elif r["id"] == "RT03":
            for aid, sigs in E().det.acc_sigs.items():
                s = next((x for x in sigs if x.signal_key == "order_volume_delta" and -2.0 < x.robust_z <= -1.0), None)
                if s:
                    created.append(_task(f"Refill reminder draft for {acc_name(aid)}", "account_manager", "whatsapp_draft", "routine", aid,
                                         {"body": "Hello, a quick reminder to check stock of your regular kidney-care lines before the weekend. (Draft, simulated, not sent.)", "evidence_ids": [s.id], "simulated": True}))
                if len(created) >= 3:
                    break
        elif r["id"] == "RT04":
            for a in approvals()["items"]:
                created.append(_task(f"Nudge: plan {a['plan_id']} for {a['ref']} is waiting for {ROLE_LABELS[a['requires_role']]}", a["requires_role"], "note", "routine", None, {"plan_id": a["plan_id"]}))
            if not created:
                created.append(_task("Nudge check: no plans waiting longer than 24 sim-hours", "operations_manager", "note", "routine", None, {}))
        rid = f"RR-{state.next_id('routine_runs'):04d}"
        state.put("routine_runs", rid, {"id": rid, "routine_id": r["id"], "ran_at_sim": (SIM_NOW + timedelta(days=days)).isoformat(), "outputs": created, "simulated": True})
        st["last_run_sim"] = (SIM_NOW + timedelta(days=days)).isoformat()
        state.put("routines", r["id"], st)
        state.audit("system", "routine", "routine.ran", "routine", r["id"], {"outputs": created, "simulated": True})
        out.append({"routine_id": r["id"], "outputs": created})
    return out


def _task(title: str, role: str, channel: str, origin: str, aid: int | None, payload: dict[str, Any]) -> str:
    tid = f"T-{state.next_id('tasks'):04d}"
    state.put("tasks", tid, {"id": tid, "plan_id": None, "incident_id": None, "incident_ref": None, "title": title, "owner_role": role,
                             "due_at": (SIM_NOW + timedelta(days=2)).isoformat(), "status": "open", "channel": channel, "origin": origin,
                             "account_id": aid, "payload": payload, "simulated": True, "created_at": SIM_NOW.isoformat()})
    state.audit("system", "routine", "task.created", "task", tid, {"channel": channel, "simulated": True, "sent": False})
    return tid


@app.post("/routines/tick")
def routines_tick() -> dict[str, Any]:
    return {"runs": run_routines(7)}


# ------------------------------------------------------------------ notebook (A18, human-only)
class NotebookIn(BaseModel):
    author: str
    tried: str
    happened: str
    changed: str | None = None
    evidence: str | None = None


@app.get("/notebook")
def notebook() -> dict[str, Any]:
    return {"items": state.notebook_list(), "rule": "Authored by humans only. Strata never writes entries here."}


@app.post("/notebook")
def notebook_add(body: NotebookIn) -> dict[str, Any]:
    if not body.author.strip() or not body.tried.strip() or not body.happened.strip():
        raise HTTPException(400, "author, tried and happened are required")
    if body.author.lower().startswith(("strata", "draft", "ai", "claude", "codex")):
        raise HTTPException(400, "Notebook entries must be authored by a named human.")
    r = state.notebook_add(body.author, body.tried, body.happened, body.changed, body.evidence)
    state.audit("human", body.author, "notebook.entry", "notebook", str(r["id"]), {})
    return r


SEV_ORDER  # noqa: B018
week_start  # noqa: B018


# ------------------------------------------------------------------ events (one classified event list over the audit log)
EVENT_TYPES: dict[str, dict[str, str]] = {
    "detected": {"label": "Detected", "icon": "radar", "template": "Sentinel flagged {title}"},
    "investigation_started": {"label": "Investigation started", "icon": "search", "template": "Investigation started"},
    "cause_ranked": {"label": "Cause ranked", "icon": "list-check", "template": "{summary}"},
    "memory_matched": {"label": "Memory matched", "icon": "books", "template": "{summary}"},
    "plan_drafted": {"label": "Plan drafted", "icon": "clipboard-list", "template": "Plan {entity} drafted; needs {role}"},
    "approved": {"label": "Approved", "icon": "circle-check", "template": "{actor} approved plan {entity}"},
    "modified": {"label": "Modified", "icon": "edit", "template": "{actor} modified plan {entity}: {reason}"},
    "rejected": {"label": "Rejected", "icon": "circle-x", "template": "{actor} rejected plan {entity}: {reason}"},
    "plan_superseded": {"label": "Plan superseded", "icon": "replace", "template": "Plan {entity} replaced by a newer investigation"},
    "task_created": {"label": "Task created", "icon": "checkbox", "template": "{what} created (simulated, nothing sent)"},
    "task_completed": {"label": "Task completed", "icon": "check", "template": "{actor} completed task {entity}"},
    "outcome_recorded": {"label": "Outcome recorded", "icon": "target-arrow", "template": "Outcome recorded after {days} simulated days (illustrative)"},
    "memory_updated": {"label": "Memory updated", "icon": "database", "template": "Memory item {entity} written by the learning loop"},
    "data_health_notice": {"label": "Data-health notice", "icon": "plug-connected-x", "template": "Data Health Guard: {what}"},
    "note_posted": {"label": "Note posted", "icon": "message", "template": "{actor} posted a note{to}"},
    "routine_ran": {"label": "Routine ran", "icon": "repeat", "template": "Standing routine {entity} ran ({n} outputs, simulated)"},
}
# index into taxonomy STAGES for events that move a case forward
STAGE_OF_EVENT = {"detected": 0, "investigation_started": 1, "cause_ranked": 1, "memory_matched": 1, "plan_drafted": 3,
                  "plan_superseded": 2, "approved": 4, "modified": 4, "rejected": 2, "task_created": 4, "task_completed": 4,
                  "outcome_recorded": 5, "memory_updated": 6}


def build_events() -> list[dict[str, Any]]:
    rows = state.audit_rows()
    plan_inc = {p["id"]: p["incident_id"] for p in state.all_("plans")}
    task_inc = {t["id"]: t.get("incident_id") for t in state.all_("tasks")}
    out: list[dict[str, Any]] = []
    for r in rows:
        a, d, eid = r["action"], r["detail"] or {}, r["entity_id"]
        inc = None
        etype = None
        fields: dict[str, Any] = {"entity": eid, "actor": r["actor"]}
        if a == "incident.detected":
            etype, inc = "detected", eid
            i = E().by_ref.get(eid)
            fields["title"] = f"{eid}: {i.title}" if i else eid
        elif a == "agent.step":
            inc = eid
            agent = r["actor"]
            if agent == "sentinel":
                etype = "investigation_started"
            elif agent in ("investigator", "memory"):
                etype = "cause_ranked" if agent == "investigator" else "memory_matched"
                fields["summary"] = d.get("summary", "")
        elif a == "plan.proposed":
            etype, inc = "plan_drafted", d.get("incident")
            fields["role"] = ROLE_LABELS.get(d.get("requires_role", ""), d.get("requires_role", ""))
        elif a in ("plan.approved", "plan.modified", "plan.rejected"):
            etype, inc = a.split(".")[1], d.get("incident")
            fields["reason"] = d.get("reason") or ""
        elif a == "plan.superseded":
            etype, inc = "plan_superseded", d.get("incident")
        elif a in ("task.created", "draft.created"):
            etype = "task_created"
            inc = plan_inc.get(d.get("plan", "")) or task_inc.get(eid)
            fields["what"] = ("Message draft " if a == "draft.created" else "Task ") + eid
        elif a == "task.status" and d.get("status") == "done":
            etype, inc = "task_completed", task_inc.get(eid)
        elif a == "outcome.recorded":
            etype, inc = "outcome_recorded", eid
            fields["days"] = d.get("days", "")
        elif a == "memory.written":
            etype = "memory_updated"
            inc = eid[4:] if eid.startswith("OUT-") else None
        elif a == "lab.inject" and r["entity_type"] == "feed":
            etype = "data_health_notice"
            fields["what"] = "orders feed stale with duplicate rows; order signals paused"
        elif a == "note.posted":
            etype, inc = "note_posted", d.get("incident")
            m = d.get("mentions") or []
            fields["to"] = (" to " + ", ".join(ROLE_LABELS.get(x, x) for x in m)) if m else ""
        elif a == "routine.ran":
            etype = "routine_ran"
            fields["n"] = len(d.get("outputs", []))
        if not etype:
            continue
        meta = EVENT_TYPES[etype]
        try:
            text = meta["template"].format(**fields)
        except KeyError:
            text = meta["label"]
        link = f"/app/incidents/{inc}" if inc else {"routine_ran": "/app/workflows", "data_health_notice": "/app/sources",
                                                   "task_created": "/app/workflows", "note_posted": "/app/workflows"}.get(etype)
        out.append({"id": r["id"], "type": etype, "label": meta["label"], "icon": meta["icon"], "text": text,
                    "at": r["at"], "wall_at": r["wall_at"], "incident": inc, "actor": r["actor"],
                    "actor_type": r["actor_type"], "link": link, "stage_index": STAGE_OF_EVENT.get(etype)})
    return out


@app.get("/events")
def events(incident: str | None = None, limit: int = 200) -> dict[str, Any]:
    ev = build_events()
    if incident:
        ev = [e for e in ev if e["incident"] == incident]
    ev.sort(key=lambda e: e["id"])  # audit order = causal order (the hash chain is append-only)
    return {"items": ev[-limit:], "types": EVENT_TYPES}


@app.get("/metrics/dictionary")
def metrics_dictionary() -> dict[str, Any]:
    import yaml as _yaml

    from .config import ROOT
    p = ROOT / "config" / "metrics.yaml"
    items = _yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else []
    return {"items": items or []}


@app.get("/taxonomy")
def taxonomy() -> dict[str, Any]:
    from .taxonomy import CATEGORIES, STAGES
    return {"categories": [{"key": c, "label": CATEGORY_LABEL[c]} for c in CATEGORIES],
            "stages": [{"key": s, "label": STAGE_LABEL[s]} for s in STAGES]}


# ------------------------------------------------------------------ night-build routers (each module owns its own APIRouter)
def _mount_routers() -> None:
    import importlib
    import logging
    for name in ("auth", "mailer", "agentic", "assistant", "digest", "simulation"):
        try:
            mod = importlib.import_module(f".{name}", __package__)
        except ModuleNotFoundError as exc:
            if exc.name and exc.name.endswith(name):
                continue  # module not built yet
            raise
        r = getattr(mod, "router", None)
        if r is not None:
            app.include_router(r)
        logging.getLogger("strata").info("mounted router %s", name)


_mount_routers()
