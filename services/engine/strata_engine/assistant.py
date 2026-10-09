"""Ask STRATA: the operations copilot behind the assistant dock (night build, assistant lane).

Two paths, same tools, same citations:
- GEMINI_API_KEY and GEMINI_MODEL set -> Gemini (google-genai SDK) answers with function calling over WHITELISTED
  read-only tools that call the engine's own handler functions (never SQL, never writes).
- Keyless (provider "none") -> a deterministic intent router that composes short templated answers from the same
  functions. This is also the fallback for any API error, timeout, refusal or hourly-budget hit.

Evidence-or-Silence (AGENTS.md section 2): numbers in a model reply must appear in the tool results of that turn
(or the user's own words); sentences carrying any other number are dropped. Citations are built only from IDs the
tools actually returned. Regulatory / patient-safety questions are routed to the QA head; no clinical advice.
"""

from __future__ import annotations

import importlib
import inspect
import json
import logging
import math
import os
import re
import threading
import time
import typing
from collections import deque
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .config import ROLE_LABELS

log = logging.getLogger("strata.assistant")
router = APIRouter(prefix="/assistant", tags=["assistant"])

# The model is deliberately an environment setting. This prototype must never silently change a provider/model.
MAX_TOKENS = 2048  # includes the model's (low) thinking tokens; the prompt asks for 2-6 short lines
API_TIMEOUT_S = 45.0
MAX_HISTORY = 12
MAX_CHARS = 4000

DONT_KNOW = "I don't know from the data."


# ------------------------------------------------------------------ settings (read at call time so tests can patch env)
def _key() -> str | None:
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    return k or None


def _model() -> str | None:
    return os.environ.get("GEMINI_MODEL", "").strip() or None


def _sdk_available() -> bool:
    try:
        importlib.import_module("google.genai")
        return True
    except ImportError:
        return False


def configured() -> bool:
    return bool(_key() and _model()) and _sdk_available()


# ------------------------------------------------------------------ hourly call budget (LLM_MAX_CALLS_PER_HOUR)
class _Budget:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.calls: deque[float] = deque()

    def limit(self) -> int:
        try:
            return max(0, int(os.environ.get("LLM_MAX_CALLS_PER_HOUR", "60")))
        except ValueError:
            return 60

    def take(self) -> bool:
        now = time.monotonic()
        with self.lock:
            while self.calls and now - self.calls[0] > 3600:
                self.calls.popleft()
            if len(self.calls) >= self.limit():
                return False
            self.calls.append(now)
            return True

    def reset(self) -> None:
        with self.lock:
            self.calls.clear()


BUDGET = _Budget()


# ------------------------------------------------------------------ JSON helpers
def _plain(o: Any) -> Any:
    """numpy / pandas scalars -> plain Python (tool results must serialise)."""
    if hasattr(o, "item"):
        try:
            return o.item()
        except (ValueError, TypeError):
            pass
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def _clean(o: Any) -> Any:
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, float):
        return None if math.isnan(o) or math.isinf(o) else o
    if o is None or isinstance(o, (str, int, bool)):
        return o
    return _clean(_plain(o))


def _dumps(o: Any) -> str:
    return json.dumps(_clean(o), ensure_ascii=False)


def _inr(v: Any) -> int | None:
    try:
        return round(float(v))
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ citation registry
class Registry:
    """IDs the tools returned this turn, with a label and an in-app link. Only these can be cited."""

    def __init__(self) -> None:
        self.ids: dict[str, dict[str, str]] = {}

    def add(self, cid: str | None, label: str, href: str) -> None:
        if cid and cid not in self.ids:
            self.ids[cid] = {"id": cid, "label": (label or cid)[:90], "href": href}

    def cite(self, text: str) -> list[dict[str, str]]:
        out = []
        for cid, c in self.ids.items():
            if re.search(rf"(?<![\w-]){re.escape(cid)}(?![\w-])", text):
                out.append(c)
        return out


def _inc_href(ref: str) -> str:
    return f"/app/incidents/{ref}"


def _acc_href(aid: Any) -> str:
    return f"/app/accounts/{aid}"


# ------------------------------------------------------------------ whitelisted read-only tools
# Each tool: (registry, persona, **args) -> JSON-able dict. Engine handlers are imported lazily (no circular import).
def _compact_item(s: dict[str, Any], reg: Registry) -> dict[str, Any]:
    reg.add(s["ref"], s.get("title", s["ref"]), _inc_href(s["ref"]))
    if s.get("account_id"):
        reg.add(f"ACC-{s['account_id']}", s.get("account_name") or f"Account {s['account_id']}", _acc_href(s["account_id"]))
    return {"ref": s["ref"], "kind": s.get("kind"), "title": s.get("title"), "severity": s.get("severity"), "risk_score": s.get("risk_score"),
            "revenue_exposure_inr": _inr(s.get("value_at_stake")), "account_id": s.get("account_id"), "account_name": s.get("account_name") or None,
            "region": s.get("region"), "category": s.get("category_label"), "stage": s.get("stage_label"), "status": s.get("status"),
            "owner_role": ROLE_LABELS.get(s.get("owner_role") or "", s.get("owner_role")), "n_sources": s.get("n_sources"),
            "regulatory_sensitive": bool(s.get("regulatory_sensitive")), "age_days": s.get("age_days")}


EXPOSURE_NOTE = "revenue_exposure_inr = baseline 12-week order value of the affected scope; exposure, not a loss forecast."


def t_get_briefing(reg: Registry, persona: str) -> dict[str, Any]:
    from .app import briefing
    b = briefing(persona)
    return {"role": b["role_label"], "summary": b["summary"], "need_you": b["need_you"], "opportunities": b["opportunities"],
            "qa_routed": b["qa_routed"], "signals_checked": b["signals_checked"], "accounts_count": b["accounts_count"],
            "priorities": [_compact_item(p, reg) for p in b["priorities"][:6]], "held_back_count": len(b["held_back"]),
            "note": EXPOSURE_NOTE}


def t_list_problems(reg: Registry, persona: str, limit: int = 5, kind: str = "risk") -> dict[str, Any]:
    from .app import ranked
    limit = max(1, min(10, int(limit or 5)))
    k = None if kind in ("all", None) else ("opportunity" if str(kind).startswith("opp") else "risk")
    shown, held = ranked(persona, k)
    return {"items": [_compact_item(s, reg) for s in shown[:limit]], "shown_total": len(shown), "held_back_count": len(held),
            "order": "regulatory first, then rank score (exposure x confidence x urgency)", "note": EXPOSURE_NOTE}


def t_get_case(reg: Registry, persona: str, ref: str) -> dict[str, Any]:
    from .app import E, incident, visible_to
    ref = str(ref or "").strip().upper()
    inc = E().by_ref.get(ref)
    if not inc:
        return {"error": f"No case {ref} in the data."}
    d = incident(ref)
    reg.add(ref, d["title"], _inc_href(ref))
    if not visible_to(inc, persona) and inc.regulatory_sensitive:
        return {"ref": ref, "title": d["title"], "regulatory_sensitive": True, "visible": False,
                "note": "Regulatory-sensitive case: route-only to the QA head. Details are visible to the QA head, Operations Manager and Business Head."}
    if d.get("account_id"):
        reg.add(f"ACC-{d['account_id']}", d.get("account_name") or f"Account {d['account_id']}", _acc_href(d["account_id"]))
    ev = []
    for e in d["evidence"][:8]:
        reg.add(e["id"], f"{e.get('label') or e['signal_key']} ({ref})", _inc_href(ref))
        ev.append({"id": e["id"], "label": e.get("label"), "source": e.get("source"), "role": e.get("role"), "value": e.get("value"),
                   "baseline": e.get("baseline"), "delta": e.get("delta"), "unit": e.get("unit"), "caption": e.get("caption")})
    inv = d.get("investigation") or {}
    plan = d.get("plan") or {}
    out = _compact_item(d, reg)
    out.update({"driver": d.get("driver"), "cause": d.get("cause"), "cause_confidence": d.get("cause_confidence"),
                "silent_period_days": d.get("silent_period_days"), "onset_estimated_at": d.get("onset_estimated_at"),
                "evidence": ev, "blast_radius_accounts": len(d.get("blast_radius") or []),
                "investigation_summary": [s.get("summary") for s in (inv.get("steps") or [])][:4] or None,
                "plan": {"id": plan.get("id"), "status": plan.get("status"), "requires_role": plan.get("requires_role"),
                         "four_eyes": plan.get("four_eyes"), "steps": [s.get("action") for s in plan.get("steps", [])][:5]} if plan else None,
                "open_tasks": len([t for t in d.get("tasks", []) if t.get("status") != "done"]), "note": EXPOSURE_NOTE})
    if inc.regulatory_sensitive:
        out["route_only"] = "Regulatory-sensitive: classify and route to the QA head with four-eyes. No clinical advice."
    return out


def t_search_memory(reg: Registry, persona: str, query: str) -> dict[str, Any]:
    from .app import E, memory_search
    hits = memory_search(str(query or ""))["items"][:5]
    mem = {m["ref"]: m for m in E().memory}
    out = []
    for h in hits:
        m = mem.get(h["ref"], {})
        reg.add(h["ref"], h["title"], "/app/memory")
        out.append({"ref": h["ref"], "title": h["title"], "kind": h["kind"], "similarity": h["score"], "summary": (m.get("body") or "")[:300],
                    "resolution": (m.get("resolution") or None), "outcome": m.get("outcome"), "authored_by": m.get("authored_by", "DRAFT - TEAM TO REVIEW")})
    return {"items": out, "retrieval": "tfidf"}


def t_get_account(reg: Registry, persona: str, account_id: Any) -> dict[str, Any]:
    from fastapi import HTTPException

    from .app import account
    try:
        aid = int(str(account_id).upper().replace("ACC-", "").strip())
        d = account(aid)
    except (ValueError, HTTPException):
        return {"error": f"No account {account_id} in the data."}
    a = d["account"]
    reg.add(f"ACC-{aid}", a["name"], _acc_href(aid))
    sigs = []
    for s in d["signals"]:
        if s.get("role") == "supporting" or s.get("direction") == "adverse" or len(sigs) < 3:
            reg.add(s["id"], f"{s.get('label') or s['signal_key']} ({a['name']})", _acc_href(aid))
            sigs.append({"id": s["id"], "label": s.get("label"), "value": s.get("value"), "baseline": s.get("baseline"), "delta": s.get("delta"), "unit": s.get("unit")})
        if len(sigs) >= 6:
            break
    nba = []
    for x in d["next_best_actions"]:
        for eid in x["evidence_ids"]:
            reg.add(eid, f"Evidence for {a['name']}", _acc_href(aid))
        nba.append({"text": x["text"], "owner_role": ROLE_LABELS.get(x["owner_role"], x["owner_role"]), "evidence_ids": x["evidence_ids"]})
    return {"account_id": f"ACC-{aid}", "name": a["name"], "type": a["type_label"], "region": a["region"], "city": a["city"], "tier": a["tier"],
            "rep": a["rep"], "value_12w_inr": _inr(d["value_12w"]), "signals": sigs, "next_best_actions": nba,
            "cases": [_compact_item(s, reg) for s in d["incidents"][:4]], "open_tasks": len(d["open_tasks"])}


def t_get_business_health(reg: Registry, persona: str) -> dict[str, Any]:
    from .app import portfolio_health
    h = portfolio_health()
    for m in h["movers"]:
        reg.add(m["ref"], m.get("account_name") or m["ref"], _inc_href(m["ref"]))
    return {"index": h["index"], "pillars": [{"label": p["label"], "value": p["value"], "delta_4w": p["delta_4w"], "meaning": p["meaning"]} for p in h["pillars"]],
            "movers": [{"ref": m["ref"], "account": m["account_name"], "signal": m["label"], "delta": m["delta"], "severity": m["severity"]} for m in h["movers"]],
            "provenance": "computed", "note": "Index = mean of the five pillars (0-100)."}


# --- optional modules (built by other lanes); called through their own route handlers
def _optional(name: str) -> Any:
    try:
        return importlib.import_module(f".{name}", __package__)
    except Exception:  # noqa: BLE001 - module missing or mid-edit: tool simply not offered
        return None


def _call_route(mod: Any, method: str, path: str, query: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> Any:
    """Invoke another lane's route handler in-process, read-only. Query params by name; a Pydantic body built from `body`."""
    r = getattr(mod, "router", None)
    if r is None:
        raise LookupError(path)
    route = next((x for x in r.routes if getattr(x, "path", None) == path and method in getattr(x, "methods", set())), None)
    if route is None:
        raise LookupError(path)
    fn: Callable[..., Any] = route.endpoint
    kwargs: dict[str, Any] = {}
    from fastapi import params as fp
    try:
        hints = typing.get_type_hints(fn)  # resolves string annotations (modules use `from __future__ import annotations`)
    except Exception:  # noqa: BLE001
        hints = {}
    for pname, p in inspect.signature(fn).parameters.items():
        ann = hints.get(pname, p.annotation)
        if isinstance(ann, type) and issubclass(ann, BaseModel):
            kwargs[pname] = ann(**(body or {}))
        elif query and pname in query:
            kwargs[pname] = query[pname]
        elif isinstance(p.default, fp.Depends):
            kwargs[pname] = None
        elif isinstance(p.default, fp.Param):
            d = p.default.default
            kwargs[pname] = None if d is ... or type(d).__name__ == "PydanticUndefinedType" else d
    res = fn(**kwargs)
    if inspect.iscoroutine(res):
        res.close()
        raise RuntimeError("async handler not supported in-process")
    if isinstance(res, BaseModel):
        res = res.model_dump()
    return res


def t_get_agentic_levels(reg: Registry, persona: str) -> dict[str, Any]:
    mod = _optional("agentic")
    if mod is None:
        return {"error": "Agentic levels are not available."}
    ev = getattr(mod, "evaluate", None)
    if callable(ev) and "act" in inspect.signature(ev).parameters:
        d = ev(persona, act=False)  # read-only: classify without running auto-decisions
    else:
        d = _call_route(mod, "GET", "/agentic/levels", {"persona": persona})
    items = []
    for x in (d or {}).get("items", [])[:8]:
        reg.add(x.get("ref"), x.get("title") or x.get("ref"), _inc_href(x.get("ref")))
        items.append({k: x.get(k) for k in ("ref", "title", "level", "level_label", "mode", "status", "decision_deadline", "reasons")})
    return {"items": items, "scale": "1 Low, 2 Moderate, 3 Elevated, 4 High, 5 Critical"}


def t_list_simulation_scenarios(reg: Registry, persona: str) -> dict[str, Any]:
    mod = _optional("simulation")
    if mod is None:
        return {"error": "The simulation lab is not available."}
    d = _call_route(mod, "GET", "/sim/catalog")
    sc = []
    for s in (d or {}).get("scenarios", [])[:20]:
        reg.add(str(s.get("id")), s.get("title") or str(s.get("id")), "/app/lab")
        sc.append({k: s.get(k) for k in ("id", "industry", "category", "title", "one_liner", "horizon_weeks")})
    return {"scenarios": sc, "provenance": "illustrative"}


def t_run_simulation(reg: Registry, persona: str, scenario_id: str) -> dict[str, Any]:
    mod = _optional("simulation")
    if mod is None:
        return {"error": "The simulation lab is not available."}
    try:
        d = _call_route(mod, "POST", "/sim/run", body={"scenario_id": str(scenario_id)})
    except Exception:  # noqa: BLE001 - unknown scenario or bad input
        return {"error": f"Could not run scenario {scenario_id}."}
    sc = (d or {}).get("scenario") or {}
    reg.add(str(sc.get("id", scenario_id)), sc.get("title") or str(scenario_id), "/app/lab")
    return {"scenario": {k: sc.get(k) for k in ("id", "title", "one_liner")}, "summary": d.get("summary"), "kpis": (d.get("kpis") or [])[:6],
            "events": [{k: e.get(k) for k in ("week", "stage", "title", "risk_level", "actor", "decision")} for e in (d.get("events") or [])[:8]],
            "provenance": "illustrative", "note": "Simulation outcomes are scripted and illustrative, not measured results."}


TOOLS: dict[str, dict[str, Any]] = {
    "get_briefing": {"fn": t_get_briefing, "description": "Today's briefing for the signed-in role: summary sentence, counts and the top ranked items needing attention.",
                     "schema": {"type": "object", "properties": {}, "required": []}},
    "list_problems": {"fn": t_list_problems, "description": "Ranked open problems (risks) or opportunities visible to the signed-in role, regulatory items first.",
                      "schema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 10, "description": "How many items (default 5)."},
                                                                 "kind": {"type": "string", "enum": ["risk", "opportunity", "all"], "description": "Default risk."}}, "required": []}},
    "get_case": {"fn": t_get_case, "description": "One case (incident) by reference such as INC-2026-0001: severity, evidence with IDs, cause, plan and stage.",
                 "schema": {"type": "object", "properties": {"ref": {"type": "string", "description": "Case reference, e.g. INC-2026-0001."}}, "required": ["ref"]}},
    "search_memory": {"fn": t_search_memory, "description": "Search organisational memory (past incidents, SOPs, outcomes) by keywords. TF-IDF retrieval.",
                      "schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    "get_account": {"fn": t_get_account, "description": "One customer account by numeric id (e.g. 4821): profile, key signals with evidence IDs, next best actions, related cases.",
                    "schema": {"type": "object", "properties": {"account_id": {"type": "integer"}}, "required": ["account_id"]}},
    "get_business_health": {"fn": t_get_business_health, "description": "Business health index and its five pillars with 4-week change, plus top movers.",
                            "schema": {"type": "object", "properties": {}, "required": []}},
    "get_agentic_levels": {"fn": t_get_agentic_levels, "module": "agentic", "description": "Agentic risk levels 1-5 per case with decision deadlines, mode and status for the signed-in role.",
                           "schema": {"type": "object", "properties": {}, "required": []}},
    "list_simulation_scenarios": {"fn": t_list_simulation_scenarios, "module": "simulation", "description": "Scenarios available in the simulation lab.",
                                  "schema": {"type": "object", "properties": {}, "required": []}},
    "run_simulation": {"fn": t_run_simulation, "module": "simulation", "description": "Run one simulation lab scenario by id. Results are illustrative.",
                       "schema": {"type": "object", "properties": {"scenario_id": {"type": "string"}}, "required": ["scenario_id"]}},
}


def available_tools() -> list[str]:
    return [n for n, t in TOOLS.items() if not t.get("module") or _optional(t["module"]) is not None]


def run_tool(name: str, args: dict[str, Any], reg: Registry, persona: str) -> dict[str, Any]:
    if name not in TOOLS or name not in available_tools():
        return {"error": f"Unknown tool {name}."}
    fn = TOOLS[name]["fn"]
    allowed = set(inspect.signature(fn).parameters) - {"reg", "persona"}
    clean = {k: v for k, v in (args or {}).items() if k in allowed}
    try:
        return _clean(fn(reg, persona, **clean))
    except Exception:
        log.exception("assistant tool %s failed", name)
        return {"error": f"{name} failed to read the data."}


# ------------------------------------------------------------------ Evidence-or-Silence guard for model text
_ID_RE = re.compile(r"\b[A-Z]{2,5}-[A-Za-z0-9][A-Za-z0-9_.\-]*")
_NUM_RE = re.compile(r"(?<![\w.])[-+]?\d[\d,]*(?:\.\d+)?")


def _nums(text: str) -> list[float]:
    out = []
    for m in _NUM_RE.findall(text):
        try:
            out.append(float(m.replace(",", "")))
        except ValueError:
            pass
    return out


def _allowed_numbers(sources: list[str]) -> list[float]:
    vals: set[float] = set()
    for s in sources:
        for v in _nums(_ID_RE.sub(" ", s)):
            vals.add(v)
    return sorted(vals)


def _supported(n: float, pct: bool, allowed: list[float]) -> bool:
    for a in allowed:
        cands = [a, a * 100] if pct else [a]
        for c in cands:
            if abs(c - n) < 1e-9 or abs(abs(c) - abs(n)) < 1e-9:
                return True
            for k in (0, 1, 2):
                if abs(round(c, k) - n) < 1e-9 or abs(abs(round(c, k)) - abs(n)) < 1e-9:
                    return True
    return False


# Fixed vocabulary the UI and prompt use (4-week windows, 12-week baseline, 0-100 index, levels 1-5, 8-hour SLA).
CONTEXT_NUMBERS = "4 weeks; 12-week baseline; index 0 to 100; risk levels 1 2 3 4 5; 8-hour SLA"


def guard_numbers(reply: str, sources: list[str]) -> tuple[str, int]:
    """Drop sentences containing a number that no tool result (or the user) supplied. Returns (text, dropped)."""
    allowed = _allowed_numbers([*sources, CONTEXT_NUMBERS])
    dropped = 0
    lines_out = []
    for line in reply.splitlines():
        mk = re.match(r"^(\s*(?:[-*]|\d+[.)])\s+)", line)
        prefix = mk.group(1) if mk else ""
        body = line[len(prefix):]
        keep = []
        for p in re.split(r"(?<=[.!?])\s+", body):
            probe = _ID_RE.sub(" ", re.sub(r"\[[^\[\]]*\]", " ", p))
            bad = False
            for m in _NUM_RE.finditer(probe):
                n = float(m.group().replace(",", ""))
                pct = probe[m.end():m.end() + 2].lstrip().startswith("%")
                if not _supported(n, pct, allowed):
                    bad = True
                    break
            if bad:
                dropped += 1
            else:
                keep.append(p)
        if body.strip() and not any(k.strip() for k in keep):
            continue
        lines_out.append(prefix + " ".join(keep))
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines_out)).strip()
    return text, dropped


def strip_unknown_citations(reply: str, reg: Registry) -> str:
    """Remove bracketed ID citations the tools never returned (an uncited claim is better than a fake citation)."""
    def fix(m: re.Match[str]) -> str:
        inner = m.group(1)
        parts = [p.strip() for p in re.split(r"[,;]", inner)]
        if not all(_ID_RE.fullmatch(p) for p in parts if p):
            return m.group(0)
        good = [p for p in parts if p in reg.ids]
        return f"[{', '.join(good)}]" if good else ""
    out = re.sub(r"\[([^\[\]]{2,120})\](?!\()", fix, reply)
    return re.sub(r"[ \t]{2,}", " ", out).replace(" .", ".")


# ------------------------------------------------------------------ regulatory / clinical routing
_CLINICAL = re.compile(r"\b(dose|doses|dosage|dosing|diagnos\w*|side[- ]effects?|contraindicat\w*|symptoms?|treat(?:ment)? for|should (?:the |a )?patients?|"
                       r"is it safe to (?:take|give|use)|medical advice|clinical advice)\b", re.IGNORECASE)


def clinical_route(persona: str) -> str:
    who = "you, as QA head," if persona == "qa_head" else "the QA head"
    return ("I can't give clinical or patient advice. Regulatory and patient-safety matters (batch quality, suspected adverse events) "
            f"are route-only in STRATA: they go to {who} with a four-eyes review. Open **Cases** to see what has been routed.")


# ------------------------------------------------------------------ keyless intent router
def _case_ref(text: str) -> str | None:
    m = re.search(r"\bINC-\d{4}-\d{3,5}\b", text, re.IGNORECASE)
    return m.group(0).upper() if m else None


def _page_ref(page: str | None) -> str | None:
    return _case_ref(page or "")


def _page_account(page: str | None) -> int | None:
    m = re.search(r"/accounts/(\d+)", page or "")
    return int(m.group(1)) if m else None


def _fmt_inr(v: Any) -> str:
    n = _inr(v)
    return "n/a" if n is None else f"{n:,} INR"


def _line(it: dict[str, Any]) -> str:
    who = f" · {it['account_name']}" if it.get("account_name") else (f" · {it['region']}" if it.get("region") else "")
    reg_note = " · routed to QA head" if it.get("regulatory_sensitive") else ""
    return f"- **{it['title']}**{who} — {it['severity']}, risk {it['risk_score']}, exposure {_fmt_inr(it['revenue_exposure_inr'])}{reg_note} [{it['ref']}]"


HELP = ("I answer from STRATA's own data and cite what I used. Try:\n"
        "- **What needs me today?**\n- **Explain INC-2026-0001**\n- **Account 4821**\n"
        "- **How is the business doing?**\n- **Search memory for supplier delay**\n- **Which simulations can I run?**")


def keyless_answer(question: str, persona: str, page: str | None, reg: Registry) -> str:
    q = question.strip()
    ql = q.lower()
    if _CLINICAL.search(q):
        return clinical_route(persona)
    if not q or re.fullmatch(r"(hi|hello|hey|help|\?|what can you do\??)[!. ]*", ql):
        return HELP

    ref = _case_ref(q) or (_page_ref(page) if re.search(r"\b(this|it|case|evidence|who|why|seen|before|explain|plan)\b", ql) else None)
    if not ref and re.search(r"\b(summari[sz]e|explain|walk me through)\b.*\b(top|first|worst)\b", ql):
        first = run_tool("list_problems", {"limit": 1}, reg, persona).get("items") or []
        ref = first[0]["ref"] if first else None
    aid = None
    m = re.search(r"\b(?:account|acc-?)\s*#?(\d{3,6})\b", ql)
    if m:
        aid = int(m.group(1))
    elif _page_account(page) and re.search(r"\b(this|account|customer|next)\b", ql) and not ref:
        aid = _page_account(page)

    if ref and re.search(r"\b(seen|before|similar|memory|past|history)\b", ql):
        c = run_tool("get_case", {"ref": ref}, reg, persona)
        if c.get("error"):
            return f"{DONT_KNOW} {c['error']}"
        hits = run_tool("search_memory", {"query": c.get("title", ref)}, reg, persona).get("items", [])[:3]
        if not hits:
            return f"Nothing similar in memory for [{ref}]. {DONT_KNOW}"
        body = "\n".join(f"- **{h['title']}** ({h['kind']}, {h['authored_by']}) [{h['ref']}]" for h in hits)
        return f"Closest past items for **{c['title']}** [{ref}]:\n{body}"

    if ref:
        c = run_tool("get_case", {"ref": ref}, reg, persona)
        if c.get("error"):
            return f"{DONT_KNOW} {c['error']}"
        if c.get("visible") is False:
            return f"**{c['title']}** [{ref}] is regulatory-sensitive. It is route-only to the QA head; ask them for details."
        ev = c.get("evidence") or []
        ev_txt = "\n".join(f"- {e['label']} ({e['source']}) [{e['id']}]" for e in ev[:4] if e.get("role") == "supporting") or \
            "\n".join(f"- {e['label']} [{e['id']}]" for e in ev[:3])
        owner = c.get("owner_role") or "the operations team"
        lines = [f"**{c['title']}** [{ref}]",
                 f"{str(c['severity']).title()}, risk {c['risk_score']}, {c['n_sources']} source systems agree. Stage: {c['stage']}. Owner: {owner}.",
                 f"Exposure {_fmt_inr(c['revenue_exposure_inr'])} (baseline 12-week order value, not a loss forecast)."]
        if ev_txt:
            lines.append("Evidence:\n" + ev_txt)
        if c.get("route_only"):
            lines.append("Regulatory-sensitive: route-only to the QA head with four-eyes. No clinical advice.")
        elif c.get("plan"):
            lines.append(f"Plan {c['plan']['id']} is {c['plan']['status']}.")
        return "\n".join(lines)

    if aid is not None:
        a = run_tool("get_account", {"account_id": aid}, reg, persona)
        if a.get("error"):
            return f"{DONT_KNOW} {a['error']}"
        lines = [f"**{a['name']}** [{a['account_id']}] — {a['type']}, {a['region']}, tier {a['tier']}.",
                 f"Baseline 12-week order value {_fmt_inr(a['value_12w_inr'])}."]
        if a["next_best_actions"]:
            lines.append("Next best actions:\n" + "\n".join(f"- {x['text']} ({x['owner_role']}) [{', '.join(x['evidence_ids'])}]" for x in a["next_best_actions"]))
        if a["cases"]:
            lines.append("Open cases:\n" + "\n".join(f"- {c['title']} [{c['ref']}]" for c in a["cases"][:3]))
        return "\n".join(lines)

    if re.search(r"\b(health|pillar|portfolio|how (?:is|are) (?:the )?(?:business|we))\b", ql):
        h = run_tool("get_business_health", {}, reg, persona)
        if h.get("error"):
            return DONT_KNOW
        idx = h["index"]
        pil = "\n".join(f"- {p['label']}: {p['value']}" + (f" ({p['delta_4w']:+} vs 4 weeks ago)" if p.get("delta_4w") is not None else "") for p in h["pillars"])
        mv = h["movers"][:2]
        mv_txt = ("\nBiggest movers:\n" + "\n".join(f"- {x['account']}: {x['signal']} [{x['ref']}]" for x in mv)) if mv else ""
        return f"Business health index **{idx['value']}** out of 100 ({idx['delta_4w']:+} over 4 weeks).\n{pil}{mv_txt}"

    if re.search(r"\b(simulat\w*|scenario\w*|what if|lab)\b", ql):
        s = run_tool("list_simulation_scenarios", {}, reg, persona)
        if s.get("error"):
            return f"{DONT_KNOW} {s['error']}"
        sc = s["scenarios"][:5]
        if not sc:
            return "No simulation scenarios are loaded yet."
        return "Scenarios you can run in the Lab (outcomes are illustrative):\n" + "\n".join(f"- **{x['title']}** — {x.get('one_liner') or ''} [{x['id']}]" for x in sc)

    if re.search(r"\b(level|levels|deadline|deadlines|waiting|approval|approvals|decide|decision)\b", ql):
        lv = run_tool("get_agentic_levels", {}, reg, persona)
        if not lv.get("error") and lv.get("items"):
            items = lv["items"][:5]
            return "Cases by risk level:\n" + "\n".join(f"- **{x['title']}** — level {x['level']} {x.get('level_label') or ''}, {str(x.get('status') or '').replace('_', ' ')} [{x['ref']}]" for x in items)

    if re.search(r"\b(opportunit\w*|growth|upsell|cross)\b", ql):
        p = run_tool("list_problems", {"limit": 3, "kind": "opportunity"}, reg, persona)
        if not p.get("items"):
            return "No open opportunities for your role right now."
        return "Open opportunities:\n" + "\n".join(_line(x) for x in p["items"])

    if re.search(r"\b(changed|new|since|this week|recent)\b", ql):
        p = run_tool("list_problems", {"limit": 10, "kind": "all"}, reg, persona)
        items = sorted(p.get("items", []), key=lambda x: x.get("age_days") if x.get("age_days") is not None else 9999)[:3]
        if not items:
            return "Nothing new for your role."
        return "Most recent items for you:\n" + "\n".join(_line(x) for x in items)

    if re.search(r"\b(brief\w*|summary|summari[sz]e|morning|overview)\b", ql) and not re.search(r"\b(top|first)\b", ql):
        b = run_tool("get_briefing", {}, reg, persona)
        top = b.get("priorities", [])[:3]
        return b["summary"] + ("\n" + "\n".join(_line(x) for x in top) if top else "")

    if re.search(r"\b(top|need|needs|urgent|priorit\w*|problem\w*|risk\w*|today|first|worst|incident\w*|case\w*|money|losing|exposure|exposed|"
                 r"waiting|approval\w*|decision\w*|decide)\b", ql):
        money = bool(re.search(r"\b(money|losing|exposure|exposed)\b", ql))
        p = run_tool("list_problems", {"limit": 10 if money else 3}, reg, persona)
        if not p.get("items"):
            return "Nothing needs you right now."
        if money:
            p["items"] = sorted(p["items"], key=lambda x: -(x.get("revenue_exposure_inr") or 0))[:3]
        head = f"{p['shown_total']} item{'s' if p['shown_total'] != 1 else ''} need you, ranked:" if p["shown_total"] else "Ranked items:"
        return head + "\n" + "\n".join(_line(x) for x in p["items"]) + "\nExposure is baseline 12-week order value, not a loss forecast."

    mem_q = re.sub(r"^(search|find|look up)\s+(the\s+)?memory\s+(for|about)\s+", "", q, flags=re.IGNORECASE)
    hits = run_tool("search_memory", {"query": mem_q}, reg, persona).get("items", [])[:3]
    if hits:
        return "From memory:\n" + "\n".join(f"- **{h['title']}** — {h['summary'][:140].rstrip()}… [{h['ref']}]" for h in hits)
    return f"{DONT_KNOW} Try asking about today's priorities, a case reference, an account number or business health."


# ------------------------------------------------------------------ Gemini path
SYSTEM_TMPL = """You are STRATA, the operations copilot inside a B2B operations console (demo data for a fictional company).
The signed-in user is the {role}. They are on page {page}. Data is as of {as_of}.

How to answer:
- Answer briefly and plainly: 2 to 6 short lines. Use **bold** for the key item and "- " bullets for lists. No headings, no tables, no links.
- Use the tools to look things up. Never guess. Only discuss data the tools returned.
- Numbers: use ONLY numbers that appear in tool results, copied exactly as written there (you may add thousands separators). Never compute, estimate, round differently or invent a number. If a number isn't in the results, leave it out.
- Cite the IDs you relied on in square brackets right after the claim, e.g. [INC-2026-0003], [EV-4821-order_volume_delta], [SOP-01], [ACC-4821]. Only cite IDs that appear in tool results.
- revenue exposure is baseline 12-week order value, not a predicted loss; say so if you mention it. Simulation outputs are illustrative, not measured.
- Regulatory or patient-safety topics (batch quality, suspected adverse events): say they are routed to the QA head with four-eyes review. Never give clinical, dosing or patient advice and never draft patient-facing text.
- If the data does not support an answer, say "I don't know from the data." and suggest what you can answer instead.
- You are read-only: you cannot approve plans, send messages or change anything. Tell the user where in the app to do it."""


class LLMUnavailable(Exception):
    """Any reason to fall back to the keyless path. The message is safe to log (never contains the key)."""


MAX_ROUNDS = 4  # model turns per question (tool calls included); beyond this we fall back to the templates
_REFUSALS = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"}


def _client() -> Any:
    from google import genai
    from google.genai import types
    return genai.Client(api_key=_key(), http_options=types.HttpOptions(timeout=int(API_TIMEOUT_S * 1000)))


def _contents(messages: list[dict[str, str]]) -> list[Any]:
    from google.genai import types
    return [types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part.from_text(text=m["content"])])
            for m in messages]


def llm_answer(messages: list[dict[str, str]], persona: str, page: str | None, reg: Registry) -> str:
    """Gemini with function calling over the whitelisted read-only TOOLS, or fail closed (LLMUnavailable)."""
    from google.genai import types

    from .app import sim_clock
    system = SYSTEM_TMPL.format(role=ROLE_LABELS.get(persona, persona), page=page or "unknown", as_of=sim_clock().date().isoformat())
    decls = [types.FunctionDeclaration(name=n, description=TOOLS[n]["description"], parameters_json_schema=TOOLS[n]["schema"])
             for n in available_tools()]
    config = types.GenerateContentConfig(
        system_instruction=system, temperature=0.1, max_output_tokens=MAX_TOKENS,
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW, include_thoughts=False),
        tools=[types.Tool(function_declarations=decls)],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    client = _client()
    contents = _contents(messages)
    sources = [system, *(m["content"] for m in messages if m["role"] == "user")]
    for _ in range(MAX_ROUNDS):
        if not BUDGET.take():
            raise LLMUnavailable("hourly LLM call budget reached")
        try:
            resp = client.models.generate_content(model=_model(), contents=contents, config=config)
        except Exception as exc:  # provider errors must not leak keys or bypass the deterministic fallback
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            raise LLMUnavailable(f"{type(exc).__name__}{f' {code}' if code else ''}") from None
        cand = (resp.candidates or [None])[0]
        reason = getattr(getattr(cand, "finish_reason", None), "name", None)
        if reason in _REFUSALS or getattr(getattr(resp, "prompt_feedback", None), "block_reason", None):
            raise LLMUnavailable(f"refused ({reason or 'blocked'})")
        if cand is None or cand.content is None:
            raise LLMUnavailable("empty reply")
        calls = [p.function_call for p in (cand.content.parts or []) if getattr(p, "function_call", None)]
        if calls:
            contents.append(cand.content)
            parts = []
            for fc in calls:
                result = run_tool(fc.name, dict(fc.args or {}), reg, persona)
                sources.append(_dumps(result))
                parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
            contents.append(types.Content(role="user", parts=parts))
            continue
        if reason == "MAX_TOKENS":
            raise LLMUnavailable("reply was cut off")
        text = "".join(p.text for p in (cand.content.parts or []) if getattr(p, "text", None) and not getattr(p, "thought", False)).strip()
        if not text:
            raise LLMUnavailable("empty reply")
        text = strip_unknown_citations(text, reg)
        text, dropped = guard_numbers(text, sources)
        if dropped:
            log.info("assistant: dropped %d unsupported sentence(s)", dropped)
        if not text.strip():
            raise LLMUnavailable("reply had no supported sentences")
        return text
    raise LLMUnavailable("tool-call round cap reached")


# ------------------------------------------------------------------ API
class ChatMsg(BaseModel):
    role: str
    content: str

class ChatIn(BaseModel):
    messages: list[ChatMsg] = Field(default_factory=list)
    persona: str = "operations_manager"
    page: str | None = None

def _normalise(msgs: list[ChatMsg]) -> list[dict[str, str]]:
    out = [{"role": m.role, "content": str(m.content)[:MAX_CHARS]} for m in msgs if m.role in ("user", "assistant") and str(m.content).strip()]
    out = out[-MAX_HISTORY:]
    while out and out[0]["role"] != "user":
        out.pop(0)
    merged: list[dict[str, str]] = []
    for m in out:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n\n" + m["content"]
        else:
            merged.append(dict(m))
    return merged


@router.get("/status")
def status() -> dict[str, Any]:
    ok = configured()
    return {"configured": ok, "provider": "gemini" if ok else "none", "model": _model() if ok else None}


@router.post("/chat")
def chat(body: ChatIn) -> dict[str, Any]:
    persona = body.persona if body.persona in ROLE_LABELS else "operations_manager"
    msgs = _normalise(body.messages)
    question = msgs[-1]["content"] if msgs and msgs[-1]["role"] == "user" else ""
    notice = None
    if question and _CLINICAL.search(question):
        reply = clinical_route(persona)
        return {"reply": reply, "citations": [], "provider": "none", "notice": None}
    if question and configured():
        reg = Registry()
        try:
            reply = llm_answer(msgs, persona, body.page, reg)
            return {"reply": reply, "citations": reg.cite(reply), "provider": "gemini", "notice": None}
        except LLMUnavailable as exc:
            log.warning("assistant: falling back to keyless (%s)", exc)
            notice = "The language model was unavailable, so this answer comes from STRATA's templates."
        except Exception:
            log.exception("assistant: unexpected LLM path error")
            notice = "The language model was unavailable, so this answer comes from STRATA's templates."
    reg = Registry()
    reply = keyless_answer(question, persona, body.page, reg)
    return {"reply": reply, "citations": reg.cite(reply), "provider": "none", "notice": notice}
