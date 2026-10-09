"""The four agents as an explicit typed state machine (Sentinel -> Investigator -> Memory -> Orchestrator).

Keyless mode (LLM_PROVIDER=none) is the default and what the gates run on: template narratives that cite
evidence IDs, TF-IDF retrieval. Evidence-or-Silence (A14): every narrative sentence must cite >= 1 evidence ID
that exists for the incident, and every numeric token must appear in the evidence payload; otherwise it is dropped.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import yaml
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer

from .config import DATA, LLM_PROVIDER, ROLE_LABELS
from .detect import Incident
from .signals import LABELS, Sig

MEM_DIR = DATA / "memory_seed"


# ------------------------------------------------------------------ typed I/O
class Sentence(BaseModel):
    text: str
    evidence_ids: list[str]


class Hypothesis(BaseModel):
    cause: str
    confidence: float
    conditions: list[dict[str, Any]]


class MemoryMatch(BaseModel):
    ref: str
    title: str
    kind: str
    similarity: float
    breakdown: dict[str, float]
    resolution: str | None = None
    outcome: str | None = None
    authored_by: str


# ------------------------------------------------------------------ memory
def load_memory(extra: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for fn in ("incidents.yaml", "sops.yaml"):
        p = MEM_DIR / fn
        if p.exists():
            items.extend(yaml.safe_load(p.read_text(encoding="utf-8")) or [])
    items.extend(extra or [])
    return items


def mem_text(m: dict[str, Any]) -> str:
    sig = " ".join(LABELS.get(s, s) for s in m.get("signals", []) or [])
    return f"{m.get('title', '')} {m.get('body', '')} {m.get('resolution', '')} {str(m.get('cause', '')).replace('_', ' ')} {sig}"


class Retriever:
    def __init__(self, items: list[dict[str, Any]]):
        self.items = items
        self.vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        self.M = self.vec.fit_transform([mem_text(m) for m in items])

    def cos(self, q: str) -> np.ndarray:
        qv = self.vec.transform([q])
        return (self.M @ qv.T).toarray().ravel()

    def search(self, q: str, k: int = 8) -> list[dict[str, Any]]:
        s = self.cos(q)
        idx = np.argsort(-s)[:k]
        return [{"ref": self.items[i]["ref"], "title": self.items[i]["title"], "kind": self.items[i].get("kind", "incident"),
                 "score": round(float(s[i]), 3)} for i in idx if s[i] > 0]


# ------------------------------------------------------------------ investigator
def _adv(ev: list[Sig], key: str) -> list[Sig]:
    return [s for s in ev if s.signal_key == key and s.is_adverse]


def cause_candidates(inc: Incident) -> list[Hypothesis]:
    ev = inc.evidence
    ids = lambda xs: [x.id for x in xs]  # noqa: E731
    sc = [s for s in ev if s.signal_key == "stock_cover_days" and s.is_adverse and s.value < 7]
    eta = [s for s in ev if s.signal_key == "eta_slip_count" and s.value >= 1]
    fill = _adv(ev, "fill_rate") + [s for s in ev if s.scope == "account_sku" and s.signal_key == "fill_rate" and s.value < 0.9]
    dly = _adv(ev, "delivery_delay_days")
    vol = _adv(ev, "order_volume_delta")
    rules: list[tuple[str, list[tuple[str, list[Sig]]], list[tuple[str, list[Sig]]]]] = [
        ("supplier_delay", [("Stock cover under 7 days on an SKU this account buys", sc), ("Supplier ETA slipped at least once", eta)],
         [("Fill rate fell on that SKU", fill), ("Deliveries later than promised", dly)]),
        ("batch_quality", [("Batch complaint cluster or possible adverse-event wording", _adv(ev, "batch_complaint_cluster") + _adv(ev, "suspected_ae_flag"))], []),
        ("payment_stress", [("Overdue receivables above normal", _adv(ev, "overdue_receivable_ratio"))],
         [("Order volume falling", vol), ("Complaints up", _adv(ev, "complaint_count_delta"))]),
        ("field_coverage_gap", [("Visit gap, rep coverage or touchpoint drop", _adv(ev, "prescriber_visit_gap_days") + _adv(ev, "rep_coverage_ratio") + _adv(ev, "interaction_frequency_delta"))],
         [("Order volume falling (lagging)", vol)]),
        ("support_capacity", [("Regional SLA breaches or slower replies across many accounts", _adv(ev, "support_backlog_region"))], []),
        ("demand_shift", [("Growth in related lines with a product gap", [s for s in ev if s.signal_key == "opportunity_volume_growth"])], []),
    ]
    out: list[Hypothesis] = []
    for cause, req, sup in rules:
        conds = [{"text": t, "met": bool(x), "evidence_ids": ids(x), "kind": "requires"} for t, x in req] + \
                [{"text": t, "met": bool(x), "evidence_ids": ids(x), "kind": "supports"} for t, x in sup]
        req_met = all(c["met"] for c in conds if c["kind"] == "requires")
        if not req_met:
            continue
        # keyless confidence = 0.6 x weighted fraction of conditions met (requires 1.0, supports 0.5)
        #                    + 0.4 x share of the incident's adverse evidence weight that this rule explains
        w_all = sum(1.0 if c["kind"] == "requires" else 0.5 for c in conds)
        w_met = sum((1.0 if c["kind"] == "requires" else 0.5) for c in conds if c["met"])
        total_p = sum(s.p for s in ev) or 1.0
        used = {i for c in conds for i in c["evidence_ids"]}
        explained = sum(s.p for s in ev if s.id in used) / total_p
        conf = 0.6 * (w_met / w_all) + 0.4 * explained
        out.append(Hypothesis(cause=cause, confidence=round(conf, 3), conditions=conds))
    if not out:
        out.append(Hypothesis(cause="unknown", confidence=0.2, conditions=[{"text": "No cause rule passed; investigate manually", "met": True, "evidence_ids": [], "kind": "requires"}]))
    out.sort(key=lambda h: -h.confidence)  # stable: ties keep rule order
    return out


def signal_set(inc: Incident) -> set[str]:
    return {s.signal_key for s in inc.evidence if s.is_adverse or s.scope != "account_sku"}


def memory_match(inc: Incident, cause: str, retr: Retriever) -> list[MemoryMatch]:
    q = inc.title + " " + " ".join(LABELS.get(s.signal_key, s.signal_key) for s in inc.evidence) + " " + cause.replace("_", " ")
    cos = retr.cos(q)
    sigs = signal_set(inc)
    res = []
    for i, m in enumerate(retr.items):
        if m.get("kind", "incident") not in ("incident", "outcome"):
            continue
        ms = set(m.get("signals", []) or [])
        jac = len(sigs & ms) / len(sigs | ms) if (sigs | ms) else 0.0
        cm = 1.0 if m.get("cause") == cause else 0.0
        sim = 0.5 * float(cos[i]) + 0.3 * cm + 0.2 * jac
        res.append(MemoryMatch(ref=m["ref"], title=m["title"], kind=m.get("kind", "incident"), similarity=round(sim, 3),
                               breakdown={"embedding": round(float(cos[i]), 3), "cause": cm, "pattern": round(jac, 3)},
                               resolution=m.get("resolution"), outcome=m.get("outcome"),
                               authored_by=m.get("authored_by", "DRAFT - TEAM TO REVIEW")))
    res.sort(key=lambda x: -x.similarity)
    return res[:5]


# ------------------------------------------------------------------ narrative + validator (A14)
def fmt_pct(x: float) -> str:
    return f"{'+' if x > 0 else '-' if x < 0 else ''}{abs(round(100 * x))}%"


def describe(s: Sig) -> str:
    lab = LABELS.get(s.signal_key, s.signal_key)
    k = s.signal_key
    if k in ("order_volume_delta", "order_value_delta", "complaint_count_delta", "response_time_delta", "interaction_frequency_delta") and s.delta is not None:
        return f"{lab} {fmt_pct(s.delta)} vs this account's own normal"
    if k == "fill_rate":
        return f"{lab} {round(100 * s.value)}% vs a normal of {round(100 * s.baseline)}%"
    if k == "stock_cover_days":
        return f"{lab} for {s.scope_key} at {s.value:.1f} days vs a normal of {s.baseline:.0f} days"
    if k == "eta_slip_count":
        return f"{lab}: the inbound date for {s.scope_key} moved {int(s.value)} times in 28 days"
    if k == "overdue_receivable_ratio":
        return f"{lab} at {round(100 * s.value)}% of trailing 12-week billing"
    if k == "prescriber_visit_gap_days":
        return f"{lab} {int(s.value)} days vs a usual {int(s.baseline)} days"
    if k == "delivery_delay_days":
        return f"{lab} {s.value:.1f} days vs {s.baseline:.1f} days normally"
    return f"{lab}: {s.note}" if s.note else lab


def payload_numbers(inc: Incident) -> set[str]:
    nums: set[str] = set()
    for s in inc.evidence:
        nums.update(re.findall(r"\d+(?:\.\d+)?", describe(s)))
        nums.update(re.findall(r"\d+(?:\.\d+)?", s.note or ""))
        nums.update(re.findall(r"\d+(?:\.\d+)?", s.scope_key))
        nums.update(re.findall(r"\d+(?:\.\d+)?", s.id))
    nums.update(re.findall(r"\d+", inc.title))
    nums.update({str(inc.n_sources), str(inc.risk_score), str(inc.account_id or "")})
    return nums


def validate(sentences: list[Sentence], inc: Incident, memory_refs: list[str] | None = None, rule_text: list[str] | None = None) -> tuple[list[Sentence], list[str]]:
    valid_ids = {s.id for s in inc.evidence} | {s.id for s in inc.context}
    allowed = payload_numbers(inc)
    for t in rule_text or []:  # constants stated in the deterministic cause rules (e.g. "under 7 days")
        allowed.update(re.findall(r"\d+(?:\.\d+)?", t))
    for r in memory_refs or []:
        allowed.update(re.findall(r"\d+", r))
    kept, notes = [], []
    for s in sentences:
        cited = [e for e in s.evidence_ids if e in valid_ids]
        if not cited:
            notes.append(f"dropped (no valid evidence id): {s.text[:60]}")
            continue
        bad = [n for n in re.findall(r"\d+(?:\.\d+)?", s.text) if n not in allowed]
        if bad:
            notes.append(f"dropped (numbers not in evidence {bad}): {s.text[:60]}")
            continue
        kept.append(Sentence(text=s.text, evidence_ids=list(dict.fromkeys(cited))))
    return kept, notes


def template_narrative(inc: Incident, top: Hypothesis, mm: list[MemoryMatch]) -> list[Sentence]:
    sents: list[Sentence] = []
    acc = [s for s in inc.evidence if s.scope == "account" and s.is_adverse]
    if acc:
        sents.append(Sentence(text=f"Sentinel found {inc.n_sources} independent source systems moving together: "
                              + "; ".join(describe(s) for s in acc[:4]) + ".", evidence_ids=[s.id for s in acc[:4]]))
    for c in top.conditions:
        if c["met"] and c["evidence_ids"]:
            ev = [s for s in inc.evidence if s.id in c["evidence_ids"]]
            sents.append(Sentence(text=f"{c['text']}: " + "; ".join(describe(s) for s in ev[:2]) + ".", evidence_ids=c["evidence_ids"][:3]))
    if top.cause != "unknown":
        cite = [i for c in top.conditions for i in c["evidence_ids"]][:3]
        sents.append(Sentence(text=f"The cause rule that fits best is {top.cause.replace('_', ' ')}; the customer-side symptoms follow from it rather than from a demand change.",
                              evidence_ids=cite))
    if mm and top.cause != "unknown" and cite:
        sents.append(Sentence(text=f"Organizational memory's closest match is {mm[0].ref} ({mm[0].title}), resolved by: {mm[0].resolution or 'see record'}.",
                              evidence_ids=cite[:1]))
    if inc.regulatory_sensitive:
        sents.append(Sentence(text="This is a regulatory-sensitive pattern, so Strata only routes it to the QA head for a four-eyes review and proposes no other action.",
                              evidence_ids=[inc.evidence[0].id]))
    return sents


# ------------------------------------------------------------------ orchestrator
def build_plan(inc: Incident, top: Hypothesis, mm: list[MemoryMatch], sops: list[dict[str, Any]], acc_name: str) -> dict[str, Any]:
    cause = top.cause
    sop = next((s for s in sops if s.get("cause") == cause), None)
    if inc.regulatory_sensitive:
        sop = next((s for s in sops if s["ref"] == ("SOP-09" if any(e.signal_key == "suspected_ae_flag" for e in inc.evidence) else "SOP-02")), sop)
    ev_ids = [e.id for e in inc.evidence[:3]]
    steps = []
    if sop:
        for st in sop.get("steps", []):
            steps.append({"n": len(steps) + 1, "action": st["action"], "owner_role": st.get("owner_role", "operations_manager"),
                          "due_in_hours": int(st.get("due_in_hours", 24)), "evidence_ids": ev_ids, "source": f"sop:{sop['ref']}"})
    best = mm[0] if mm and mm[0].breakdown.get("cause") == 1.0 else None
    if best and not inc.regulatory_sensitive:
        mem = next((m for m in load_memory() if m["ref"] == best.ref), None)
        have = " ".join(s["action"].lower() for s in steps)
        for st in (mem or {}).get("steps", []):
            key = st["action"].lower().split()[0]
            if key not in have:
                steps.append({"n": len(steps) + 1, "action": st["action"], "owner_role": st.get("owner_role", "operations_manager"),
                              "due_in_hours": 24, "evidence_ids": ev_ids, "source": f"memory:{best.ref}"})
    if not steps:
        steps = [{"n": 1, "action": "Investigate manually and record findings", "owner_role": inc.owner_role, "due_in_hours": 24,
                  "evidence_ids": ev_ids, "source": "agent"}]
    requires = "qa_head" if inc.regulatory_sensitive else (sop or {}).get("requires_role", inc.owner_role)
    drafts = []
    if not inc.regulatory_sensitive and inc.account_id:
        vol = next((e for e in inc.evidence if e.signal_key == "order_volume_delta"), None)
        drafts.append({"channel": "whatsapp_draft", "to_role": "account_manager", "subject": f"Check-in with {acc_name}",
                       "body": "Hello, this is your account team. We know recent supplies of some items were short and replies were slower than usual. "
                               "We have prioritised your pending orders and will call you today to agree interim supply. (Draft, simulated, not sent.)",
                       "simulated": True, "evidence_ids": [vol.id] if vol else ev_ids[:1]})
        if cause == "supplier_delay":
            sku = next((e.scope_key for e in inc.evidence if e.signal_key == "stock_cover_days"), "the SKU")
            drafts.append({"channel": "email_draft", "to_role": "operations_manager", "subject": f"Escalation: inbound ETA for {sku}",
                           "body": f"The inbound ETA for {sku} has slipped repeatedly and warehouse cover is critically low. Please confirm a firm dispatch date and a partial shipment option. (Draft, simulated, not sent.)",
                           "simulated": True, "evidence_ids": [e.id for e in inc.evidence if e.scope == "sku"][:2]})
    return {"steps": steps, "requires_role": requires, "four_eyes": bool(inc.regulatory_sensitive or (sop or {}).get("four_eyes", False)),
            "value_at_stake": round(inc.value_at_stake, 2), "drafts": drafts,
            "expected_outcome": "Restore supply and service so the account returns to its normal ordering pattern" if cause == "supplier_delay"
            else ("QA decision recorded by a human; no automatic action" if inc.regulatory_sensitive else "Bring the leading signals back within their normal range"),
            "sop_ref": (sop or {}).get("ref"), "memory_ref": best.ref if best else None}


def run_investigation(inc: Incident, retr: Retriever, sops: list[dict[str, Any]], acc_name: str) -> dict[str, Any]:
    t = datetime.now(timezone.utc)
    steps = []

    def step(agent: str, summary: str, ev: list[str], dt_ms: int) -> None:
        nonlocal t
        start = t
        t = t + timedelta(milliseconds=dt_ms)
        steps.append({"agent": agent, "started_at": start.isoformat(), "finished_at": t.isoformat(), "summary": summary,
                      "evidence_ids": ev, "status": "ok"})

    step("sentinel", f"Incident {inc.ref}: {inc.severity}, risk {inc.risk_score}, {inc.n_sources} source systems ({', '.join(inc.sources)}).",
         [e.id for e in inc.evidence[:6]], 40)
    hyps = cause_candidates(inc)
    top = hyps[0]
    step("investigator", f"Ranked {len(hyps)} candidate cause(s) from the fixed taxonomy; top: {top.cause} (confidence {top.confidence}).",
         [i for c in top.conditions for i in c["evidence_ids"]][:6], 60)
    mm = memory_match(inc, top.cause, retr)
    step("memory", f"Retrieved {len(mm)} similar records with TF-IDF; best {mm[0].ref if mm else 'none'} (similarity {mm[0].similarity if mm else 0}).", [], 50)
    plan = build_plan(inc, top, mm, sops, acc_name)
    step("orchestrator", f"Drafted a {len(plan['steps'])}-step plan from {plan['sop_ref'] or 'no SOP'}"
         f"{' and ' + plan['memory_ref'] if plan['memory_ref'] else ''}; requires {ROLE_LABELS[plan['requires_role']]}{' with four-eyes' if plan['four_eyes'] else ''}.",
         [], 40)
    sents = template_narrative(inc, top, mm)
    kept, notes = validate(sents, inc, [m.ref for m in mm], [c["text"] for h in hyps for c in h.conditions])
    return {"steps": steps, "cause": top.cause, "cause_confidence": top.confidence,
            "hypotheses": [h.model_dump() for h in hyps], "memory_matches": [m.model_dump() for m in mm],
            "narrative": [s.model_dump() for s in kept], "grounding_ok": len(notes) == 0 and len(kept) > 0,
            "grounding_notes": notes, "source": "template" if LLM_PROVIDER == "none" else "template",
            "retrieval": "tfidf", "plan": plan}


Path  # noqa: B018
