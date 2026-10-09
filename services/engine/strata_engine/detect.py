"""Sentinel: turn signals into incidents (deterministic), plus portfolio views.

Rules (contracts/signal_catalog.yaml):
- account incidents: noisy-OR score >= 50 (elevated+); single-source capped at elevated; high/critical need >= 3 sources.
- SKU-scope supply signals are corroborating context: they attach to an account that bought the SKU in the last
  8 weeks AND already shows adverse signals from >= 2 of its own source systems (see docs/OPEN_QUESTIONS.md Q4).
  Other exposed buyers are listed as Blast Radius (A3), not as separate incidents.
- regulatory-sensitive signals (batch cluster, suspected AE) always create a QA-routed, four-eyes incident.
- region-scope support capacity and rep-vacancy drift create ONE grouped incident each.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from .config import SIM_NOW, WEEKS
from .signals import (CUR, D0, LABELS, Frames, Sig, account_signals, band, noisy_or, previous_run, roll4, sku_signals,
                      week_idx, week_start)

AE_WORDS = ("dizzy", "unwell", "reaction", "rash", "hospitalised", "hospitalized", "vomit", "swelling", "breathless")
CAUSE_OWNER = {"supplier_delay": "operations_manager", "payment_stress": "account_manager",
               "field_coverage_gap": "account_manager", "support_capacity": "support_manager",
               "batch_quality": "qa_head", "demand_shift": "sales_manager", "unknown": "operations_manager"}
DRIVER_OWNER = {"supply": "operations_manager", "commercial": "account_manager", "service": "support_manager",
                "field": "account_manager", "finance": "account_manager", "quality": "qa_head"}


@dataclass
class Incident:
    ref: str
    kind: str
    title: str
    scope: str
    scope_key: str
    account_id: int | None
    severity: str
    risk_score: int
    n_sources: int
    sources: list[str]
    evidence: list[Sig]
    value_at_stake: float
    driver: str
    regulatory_sensitive: bool = False
    owner_role: str = "operations_manager"
    onset: str | None = None
    silent_period_days: float | None = None
    silent_basis: str = ""
    blast: list[dict[str, Any]] = field(default_factory=list)
    context: list[Sig] = field(default_factory=list)
    sim_run_id: str | None = None
    persistence_bonus: bool = False

    @property
    def id(self) -> str:
        return self.ref


@dataclass
class Detection:
    frames: Frames
    acc_sigs: dict[int, list[Sig]]
    sku_sigs: dict[str, list[Sig]]
    incidents: list[Incident]
    account_scores: dict[int, tuple[int, int, list[str]]]
    value_12w: dict[int, float]
    signals_checked: int
    notices: list[dict[str, str]]


def value_12w(f: Frames) -> dict[int, float]:
    r = roll4(f.value)
    med = np.nanmedian(r[:, 3:WEEKS - 5], axis=1)
    return {int(a): float(med[k] * 3) for k, a in enumerate(f.ids)}


def onset_estimate(series: np.ndarray, lookback: int = 16) -> int:
    """CUSUM-style change point: the week k maximising |sum_{j>=k}(x_j - mu)| / sqrt(n)."""
    hist = series[: WEEKS - lookback]
    mu = float(np.median(hist)) if len(hist) else float(np.mean(series))
    best, best_k = -1.0, WEEKS - 4
    for k in range(WEEKS - lookback, WEEKS - 1):
        tail = series[k:] - mu
        s = abs(tail.sum()) / np.sqrt(len(tail))
        if s > best:
            best, best_k = s, k
    return best_k


def manual_review_catch(series: np.ndarray, onset_w: int) -> int | None:
    """ASSUMPTION (labelled): a weekly manual review compares the last 4 weeks' units with the 4 weeks before
    and flags a drop > 25%. Returns the first week index after onset when that rule fires, else None."""
    for w in range(onset_w + 1, WEEKS):
        cur = series[w - 3: w + 1].sum()
        prev = series[w - 7: w - 3].sum()
        if prev > 0 and cur / prev - 1 < -0.25:
            return w
    return None


def evaluate(t: dict[str, pd.DataFrame], ref_prefix: str = "INC-2026-") -> Detection:
    f = Frames(t)
    feeds = t["source_feeds"]
    notices: list[dict[str, str]] = []
    stale_sources: set[str] = set()
    for _, fd in feeds.iterrows():
        lag = (SIM_NOW - pd.Timestamp(fd["last_ingested_at"]).to_pydatetime()).total_seconds() / 60 / fd["expected_every_minutes"]
        if lag > 3 or fd["status"] != "fresh":
            stale_sources.add(str(fd["system"]))
            notices.append({"system": str(fd["system"]), "message": f"{fd['system']} feed is stale or degraded; its signals are paused (Data Health Guard)."})
    dup_accounts: set[int] = set()
    if "duplicate_ratio_by_account" in t:
        d = t["duplicate_ratio_by_account"]
        dup_accounts = set(int(x) for x in d[d["duplicate_ratio"] > 0.05]["account_id"])
        for a in sorted(dup_accounts):
            notices.append({"system": "orders", "message": f"Duplicate order rows for account {a}; its order signals are suppressed."})
    acc_sigs = account_signals(f, suppressed_order_accounts=dup_accounts | (set(int(a) for a in f.ids) if "orders" in stale_sources else set()))
    sku_sigs = sku_signals(f) if "inventory" not in stale_sources else {}
    v12 = value_12w(f)
    acc_by_id = f.acc.set_index("id")
    incidents: list[Incident] = []

    # ---------------- region-scope support capacity (S10-type) ----------------
    s = f.s[f.s["w"] >= 0].copy()
    s["region_id"] = s["account_id"].map(acc_by_id["region_id"])
    sla_h = 8.0
    s["breach"] = s["resp_h"] > sla_h
    reg_week = s.groupby(["region_id", "w"])["breach"].mean().unstack(fill_value=0)
    regional_accounts: set[int] = set()
    regions = t["regions"].set_index("id")["name"].to_dict()
    for rid, row in reg_week.iterrows():
        vals = row.reindex(range(WEEKS), fill_value=0).to_numpy()
        x = vals[CUR - 1: CUR + 1].mean()
        base = np.array([vals[i - 1: i + 1].mean() for i in range(1, WEEKS - 5)])
        med = float(np.median(base))
        mad = max(float(np.median(np.abs(base - med))), 0.05 * med, 0.01)
        z = (x - med) / (1.4826 * mad)
        accs = [int(a) for a in f.acc[f.acc["region_id"] == rid]["id"]]
        slow = [a for a in accs for sg in acc_sigs[a] if sg.signal_key == "response_time_delta" and sg.robust_z >= 2]
        if z >= 3 and len(slow) >= 5 and "support" not in stale_sources:
            sig = Sig(id=f"EV-R{rid}-support_backlog_region", signal_key="support_backlog_region", scope="region",
                      scope_key=str(rid), account_id=None, value=float(x), baseline=med, robust_z=float(z), delta=float(x - med),
                      series={"labels": f.week_labels[-26:], "values": [round(float(v), 3) for v in vals[-26:]], "baseline": round(med, 3)},
                      note=f"{len(slow)} accounts in the region answered slower than their own normal")
            regional_accounts.update(accs)
            witnesses = [sg for a in slow for sg in acc_sigs[a] if sg.signal_key == "response_time_delta"]
            score, n, srcs = noisy_or([sig] + witnesses)
            exposure = sum(v12[a] for a in slow)  # only the accounts actually answering slower
            onset_w = onset_estimate(vals, 8)
            incidents.append(Incident(ref="", kind="risk", title=f"Support response slowed across {regions[rid]}",
                                      scope="region", scope_key=str(rid), account_id=None, severity=band(score),
                                      risk_score=score, n_sources=n, sources=srcs, evidence=[sig], value_at_stake=exposure,
                                      driver="service", owner_role="support_manager",
                                      onset=week_start(onset_w).isoformat(),
                                      blast=[{"account_id": a, "exposure_basis": "same_region", "exposure_value": round(v12[a], 2)} for a in slow]))

    # ---------------- rep vacancy drift (S08-type) ----------------
    reps = t["reps"]
    rep_accounts: set[int] = set()
    for _, rp in reps[~reps["active"].astype(bool)].iterrows():
        accs = [int(a) for a in f.acc[f.acc["rep_id"] == rp["id"]]["id"]]
        drifting = [a for a in accs for sg in acc_sigs[a] if sg.signal_key == "interaction_frequency_delta" and sg.robust_z <= -2]
        if len(drifting) >= 5:
            zs = [sg.robust_z for a in drifting for sg in acc_sigs[a] if sg.signal_key == "interaction_frequency_delta"]
            crm = Sig(id=f"EV-REP{rp['id']}-interaction_frequency_delta", signal_key="interaction_frequency_delta", scope="rep",
                      scope_key=str(rp["id"]), account_id=None, value=float(len(drifting)), baseline=float(len(accs)),
                      robust_z=float(np.median(zs)), delta=None, note=f"{len(drifting)} of {len(accs)} accounts of this rep lost touchpoints")
            wf = Sig(id=f"EV-REP{rp['id']}-rep_coverage_ratio", signal_key="rep_coverage_ratio", scope="rep", scope_key=str(rp["id"]),
                     account_id=None, value=0.0, baseline=1.0, robust_z=-4.0, delta=-1.0, note=f"{rp['name']} left on {rp['left_on']}; no replacement assigned")
            score, n, srcs = noisy_or([crm, wf])
            rep_accounts.update(accs)
            incidents.append(Incident(ref="", kind="risk", title=f"Rep vacancy: {len(drifting)} accounts drifting since {rp['name']} left",
                                      scope="rep", scope_key=str(rp["id"]), account_id=None, severity=max(band(score), "watch", key=_sev_rank),
                                      risk_score=score, n_sources=n, sources=srcs, evidence=[crm, wf],
                                      value_at_stake=sum(v12[a] for a in drifting), driver="field", owner_role="account_manager",
                                      onset=str(rp["left_on"]),
                                      blast=[{"account_id": a, "exposure_basis": "same_rep", "exposure_value": round(v12[a], 2)} for a in drifting]))

    # ---------------- account-scope risk incidents ----------------
    recent = f.o[f.o["w"] >= WEEKS - 8]
    bought = recent.groupby("account_id")["sku"].apply(set).to_dict()
    scores: dict[int, tuple[int, int, list[str]]] = {}
    for aid, sigs in acc_sigs.items():
        own = [sg for sg in sigs if not (aid in regional_accounts and sg.signal_key == "response_time_delta")
               and not (aid in rep_accounts and sg.signal_key == "interaction_frequency_delta")]
        own_sources = {sg.source for sg in own if sg.is_adverse}
        attached: list[Sig] = []
        if len(own_sources) >= 2:
            for sku in sorted(bought.get(aid, set())):
                o_sku = recent[(recent["account_id"] == aid) & (recent["sku"] == sku) & (recent["w"] >= WEEKS - 4)]
                sku_fill = o_sku["qty_filled"].sum() / max(o_sku["qty_ordered"].sum(), 1)
                if sku_fill >= 0.9:
                    continue  # the shortage has not reached this account: listed as blast radius only
                for sg in sku_sigs.get(sku, []):
                    if sg.is_adverse:
                        attached.append(sg)
                attached.append(Sig(id=f"EV-{aid}-{sku}-fill_rate", signal_key="fill_rate", scope="account_sku",
                                    scope_key=f"{aid}/{sku}", account_id=aid, value=float(sku_fill), baseline=0.975,
                                    robust_z=float((sku_fill - 0.975) / (1.4826 * 0.02)), delta=float(sku_fill - 0.975),
                                    note=f"Fill rate on {sku} for this account, last 4 weeks"))
        prev_sc, _, _ = noisy_or(previous_run(own))
        persistent = prev_sc >= 50  # same pattern already at incident level in the previous weekly run
        sc, n, srcs = noisy_or(own + attached, persistent=persistent)
        scores[aid] = (sc, n, srcs)
        if sc < 50:
            continue
        adv = [sg for sg in own + attached if sg.is_adverse]
        contrib: dict[str, float] = {}
        for sg in adv:
            contrib[sg.klass] = contrib.get(sg.klass, 0) + sg.p
        driver = max(contrib, key=lambda k: contrib[k])
        k = f.pos[aid]
        ow = onset_estimate(f.units_adj[k])
        catch = manual_review_catch(f.units_adj[k], ow)
        if catch is None:
            silent = float((D0 - week_start(ow)).days)
            basis = "Not yet caught by a weekly manual review of order totals (assumption: flags a >25% month-on-month drop); days since estimated onset."
        else:
            silent = float((week_start(catch) + timedelta(days=7) - week_start(ow)).days)
            basis = "Days from estimated onset until a weekly manual review of order totals would flag it (assumption: flags a >25% month-on-month drop)."
        a = acc_by_id.loc[aid]
        blast: list[dict[str, Any]] = []
        for sg in attached:
            if sg.signal_key == "stock_cover_days":
                sku = sg.scope_key
                for other, skus in bought.items():
                    if other == aid or sku not in skus:
                        continue
                    fr = [x for x in acc_sigs[other] if x.signal_key == "fill_rate"]
                    o_sku = recent[(recent["account_id"] == other) & (recent["sku"] == sku) & (recent["w"] >= WEEKS - 4)]
                    sku_fill = o_sku["qty_filled"].sum() / max(o_sku["qty_ordered"].sum(), 1)
                    if sku_fill < 0.92 or (fr and fr[0].is_adverse):
                        blast.append({"account_id": int(other), "exposure_basis": "same_sku_shortage",
                                      "exposure_value": round(v12[int(other)], 2), "sku": sku, "sku_fill_rate": round(float(sku_fill), 3)})
        incidents.append(Incident(ref="", kind="risk", title=_title(driver, str(a["name"])), scope="account", scope_key=str(aid),
                                  account_id=aid, severity=band(sc), risk_score=sc, n_sources=n, sources=srcs,
                                  evidence=sorted(adv, key=lambda x: -x.p), value_at_stake=v12[aid], driver=driver,
                                  owner_role=DRIVER_OWNER.get(driver, "operations_manager"), onset=week_start(ow).isoformat(),
                                  silent_period_days=silent, silent_basis=basis, blast=blast, persistence_bonus=persistent,
                                  context=[sg for sg in own if not sg.is_adverse and abs(sg.robust_z) < 1 and sg.signal_key in ("tickets",)]))

    # ---------------- regulatory-sensitive (always QA-routed) ----------------
    c = f.c
    cutoff21 = pd.Timestamp(D0 - timedelta(days=21))
    q = c[(c["kind"] == "quality") & (pd.to_datetime(c["opened_at"]) >= cutoff21) & c["batch_id"].notna()]
    for batch, g in q.groupby("batch_id"):
        if g["account_id"].nunique() >= 2:
            sig = Sig(id=f"EV-{batch}-batch_complaint_cluster", signal_key="batch_complaint_cluster", scope="batch", scope_key=str(batch),
                      account_id=None, value=float(len(g)), baseline=0.0, robust_z=9.9, delta=float(len(g)),
                      note=f"{len(g)} quality complaints from {g['account_id'].nunique()} accounts in 21 days",
                      extra={"complaint_ids": [int(x) for x in g["id"]]})
            accs = sorted(int(x) for x in g["account_id"].unique())
            sc, n, srcs = noisy_or([sig])
            incidents.append(Incident(ref="", kind="risk", title=f"Quality complaint cluster on batch {batch}", scope="batch",
                                      scope_key=str(batch), account_id=None, severity="high", risk_score=sc, n_sources=n, sources=srcs,
                                      evidence=[sig], value_at_stake=sum(v12[a] for a in accs), driver="quality",
                                      regulatory_sensitive=True, owner_role="qa_head",
                                      onset=str(pd.to_datetime(g["opened_at"]).min().date()),
                                      blast=[{"account_id": a, "exposure_basis": "same_batch", "exposure_value": round(v12[a], 2)} for a in accs]))
    cutoff14 = pd.Timestamp(D0 - timedelta(days=14))
    ae = c[(pd.to_datetime(c["opened_at"]) >= cutoff14) &
           ((c["kind"] == "suspected_adverse_event") | c["body"].str.lower().str.contains("|".join(AE_WORDS)))]
    for _, r in ae.iterrows():
        aid = int(r["account_id"])
        sig = Sig(id=f"EV-C{int(r['id'])}-suspected_ae_flag", signal_key="suspected_ae_flag", scope="account", scope_key=str(aid),
                  account_id=aid, value=1.0, baseline=0.0, robust_z=9.9, delta=1.0,
                  note="Complaint wording matched the possible-adverse-event routing list (keyword routing, not a medical judgement)",
                  extra={"complaint_id": int(r["id"])})
        sc, n, srcs = noisy_or([sig])
        incidents.append(Incident(ref="", kind="risk", title=f"Possible adverse-event report from {acc_by_id.loc[aid, 'name']}",
                                  scope="account", scope_key=str(aid), account_id=aid, severity="high", risk_score=sc,
                                  n_sources=n, sources=srcs, evidence=[sig], value_at_stake=v12[aid], driver="quality",
                                  regulatory_sensitive=True, owner_role="qa_head", onset=str(pd.to_datetime(r["opened_at"]).date())))

    # ---------------- opportunities (A11) ----------------
    nutrition = f.area_units.get("renal_nutrition")
    area_r4 = {ar: roll4(m) for ar, m in f.area_units.items()}  # once per area, not per account
    for k, aid in enumerate(f.ids):
        aid = int(aid)
        growing = []
        for ar, m in f.area_units.items():
            r4 = area_r4[ar]
            x = r4[k, CUR]
            base = r4[k, 3:WEEKS - 5]
            med = float(np.nanmedian(base))
            if med <= 0:
                continue
            mad = max(float(np.nanmedian(np.abs(base - med))), 0.05 * med)
            z = (x - med) / (1.4826 * mad)
            wk_med = float(np.median(m[k, :WEEKS - 5]))
            persistent = int(np.sum(m[k, CUR - 3: CUR + 1] > wk_med * 1.05)) >= 3
            if z >= 3 and persistent:
                growing.append((ar, float(x / med - 1), float(z), med))
        gap = nutrition is not None and float(nutrition[k, WEEKS - 12:].sum()) == 0
        if len(growing) >= 2 and gap:
            g = float(np.mean([x[1] for x in growing]))
            sig = Sig(id=f"EV-{aid}-opportunity_volume_growth", signal_key="opportunity_volume_growth", scope="account", scope_key=str(aid),
                      account_id=aid, value=g, baseline=0.0, robust_z=float(np.mean([x[2] for x in growing])), delta=g,
                      note="Growing in " + ", ".join(x[0].replace("_", " ") for x in growing) + "; no renal-nutrition purchases in 12 weeks",
                      series={"labels": f.week_labels[-26:], "values": [round(float(v), 1) for v in (f.area_units[growing[0][0]][k] + f.area_units[growing[1][0]][k])[-26:]],
                              "baseline": round(sum(x[3] for x in growing) / 4, 1)},
                      extra={"areas": [x[0] for x in growing], "gap_area": "renal_nutrition"})
            score = int(round(100 * min(1.0, 0.5 * min(1, sig.robust_z / 4) + 0.2)))
            incidents.append(Incident(ref="", kind="opportunity", title=f"Cross-sell gap: {acc_by_id.loc[aid, 'name']}", scope="account",
                                      scope_key=str(aid), account_id=aid, severity="watch", risk_score=score, n_sources=1, sources=["orders"],
                                      evidence=[sig], value_at_stake=v12[aid], driver="commercial", owner_role="sales_manager",
                                      onset=week_start(onset_estimate(f.units_adj[k])).isoformat()))

    # ---------------- refs, ordering ----------------
    incidents.sort(key=lambda i: (i.kind != "risk", -int(i.regulatory_sensitive) * 0, -i.risk_score, -i.value_at_stake))
    for n_, inc in enumerate(incidents, start=1):
        inc.ref = f"{ref_prefix}{n_:04d}"
    checked = sum(len(v) for v in acc_sigs.values()) + sum(len(v) for v in sku_sigs.values())
    return Detection(frames=f, acc_sigs=acc_sigs, sku_sigs=sku_sigs, incidents=incidents, account_scores=scores,
                     value_12w=v12, signals_checked=checked, notices=notices)


SEV_ORDER = ["healthy", "watch", "elevated", "high", "critical"]


def _sev_rank(s: str) -> int:
    return SEV_ORDER.index(s)


def _title(driver: str, name: str) -> str:
    return {
        "supply": f"Orders and service deteriorating at {name}",
        "commercial": f"Order decline at {name}",
        "service": f"Service experience worsening at {name}",
        "field": f"Relationship coverage fading at {name}",
        "finance": f"Payment stress with falling orders at {name}",
    }.get(driver, f"Cross-system risk pattern at {name}")


def sig_label(key: str) -> str:
    return LABELS.get(key, key)


__all__ = ["evaluate", "Detection", "Incident", "week_idx", "SEV_ORDER"]
