"""npm run eval: detection + keyless investigation on seed A (tuning) and seed B (hold-out, never tuned).
Compares against eval_labels written by the generator. Writes data/store/eval_latest.json."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "engine"))
from strata_engine.agents import cause_candidates  # noqa: E402
from strata_engine.detect import evaluate  # noqa: E402

TITLES = {s["id"]: s["title"] for s in __import__("yaml").safe_load((ROOT / "contracts" / "scenarios.yaml").read_text(encoding="utf-8"))["scenarios"]}


def isolation_flags(det, contamination: float = 0.05) -> set[int]:
    """Secondary corroboration only (rules + statistics decide; ML corroborates): IsolationForest over each
    account's signal z-scores. Returns the account ids in the most anomalous `contamination` share."""
    from sklearn.ensemble import IsolationForest
    keys = sorted({s.signal_key for sigs in det.acc_sigs.values() for s in sigs})
    ids = sorted(det.acc_sigs)
    X = np.array([[next((s.robust_z for s in det.acc_sigs[a] if s.signal_key == k), 0.0) for k in keys] for a in ids])
    X = np.nan_to_num(np.clip(X, -10, 10))
    model = IsolationForest(n_estimators=200, contamination=contamination, random_state=0).fit(X)
    pred = model.predict(X)
    return {a for a, p in zip(ids, pred) if p == -1}


def run(seed_dir: Path, is_holdout: bool) -> dict:
    t = {p.stem: pd.read_pickle(p) for p in seed_dir.glob("*.pkl")}
    lab = json.loads((seed_dir / "eval_labels.json").read_text())
    det = evaluate(t)
    if_flag = isolation_flags(det)
    matched: set[str] = set()
    per = []
    for L in lab["labels"]:
        keys = {str(k) for k in L["keys"]}
        hits = []
        for inc in det.incidents:
            ok = False
            if L["scope"] == "account" and inc.account_id is not None and str(inc.account_id) in keys:
                ok = True
            if L["scope"] == "batch" and inc.scope == "batch":
                ok = True
            if L["scope"] == "region" and inc.scope == "region" and inc.scope_key in keys:
                ok = True
            if L["scope"] == "rep" and inc.scope == "rep" and inc.scope_key == str(L.get("rep_id")):
                ok = True
            if ok and (L["kind"] == "decoy" or (inc.kind == "opportunity") == (L["kind"] == "opportunity")):
                hits.append(inc)
        if L["kind"] == "decoy":
            hits = [h for h in hits if h.kind == "risk" or True]
        for h in hits:
            matched.add(h.ref)
        detected = bool(hits)
        cause = cause_candidates(hits[0])[0].cause if hits else None
        planted = L.get("planted", True)
        hit = (detected == L["expected_detected"]) if planted else None
        per.append({"id": L["scenario"], "title": TITLES.get(L["scenario"], ""), "kind": L["kind"], "planted": planted,
                    "expected": "detected" if L["expected_detected"] else "silent", "detected": detected,
                    "incidents": [h.ref for h in hits], "severity": hits[0].severity if hits else None,
                    "risk_score": hits[0].risk_score if hits else None, "cause": cause, "truth_cause": L.get("cause"),
                    "cause_ok": (cause == L.get("cause")) if (hits and L["kind"] != "decoy") else None, "hit": hit,
                    "note": L.get("note", ""),
                    "if_flagged": (any(int(k) in if_flag for k in L["keys"] if str(k).isdigit()) if L["scope"] in ("account", "batch", "rep") and L["keys"] else None)})
    risky = [i for i in det.incidents]
    real = [p for p in per if p["planted"] and p["kind"] != "decoy"]
    tp_inc = [i for i in risky if i.ref in matched and not any(p["kind"] == "decoy" and i.ref in p["incidents"] for p in per)]
    fa = [i.ref for i in risky if i.ref not in matched]
    decoy_fa = [r for p in per if p["kind"] == "decoy" for r in p["incidents"]]
    precision = len(tp_inc) / len(risky) if risky else None
    recall = sum(1 for p in real if p["detected"]) / len(real)
    cause_rows = [p for p in real if p["detected"]]
    rca = sum(1 for p in cause_rows if p["cause_ok"]) / len(cause_rows) if cause_rows else None
    return {"seed": lab["seed"], "is_holdout": is_holdout,
            "metrics": {"precision": round(precision, 3) if precision is not None else None, "recall": round(recall, 3),
                        "root_cause_acc": round(rca, 3) if rca is not None else None,
                        "incidents": len(risky), "false_alarms": len(fa) + len(decoy_fa), "false_alarm_refs": fa + decoy_fa,
                        "scenarios_planted": len(real), "scenarios_detected": sum(1 for p in real if p["detected"]),
                        "if_corroborated": sum(1 for p in real if p.get("if_flagged")),
                        "if_checked": sum(1 for p in real if p.get("if_flagged") is not None)},
            "per_scenario": per,
            "hero": next(({"orders_delta": s.delta, "key": s.signal_key} for s in det.acc_sigs.get(4821, []) if s.signal_key == "order_volume_delta"), None),
            "hero_deltas": {s.signal_key: round(float(s.delta), 3) for s in det.acc_sigs.get(4821, []) if s.delta is not None and s.signal_key in
                            ("order_volume_delta", "complaint_count_delta", "response_time_delta", "interaction_frequency_delta")}}


if __name__ == "__main__":
    store = ROOT / "data" / "store"
    runs = [run(store / "seed_dev", False), run(store / "seed_holdout", True)]
    out = {"runs": runs, "caveat": "Seed B (hold-out) uses the same generator and scenarios with a different random draw. It guards against "
           "over-fitting to one sample; it is NOT independent validation. Real validation needs real company data.",
           "lead_time": "Not computed in this build (needs a weekly backtest); listed as a known gap.",
           "isolation_forest": "Secondary corroboration only: IsolationForest (200 trees, 5% contamination, random_state 0) over each account's signal z-scores. if_flagged = the unsupervised model also ranked a planted account among the most anomalous 5%. It never decides detection."}
    (store / "eval_latest.json").write_text(json.dumps(out, indent=2, default=lambda o: float(o) if isinstance(o, np.floating) else str(o)))
    for r in runs:
        print("holdout" if r["is_holdout"] else "seed A ", r["metrics"], r["hero_deltas"])
        for p in r["per_scenario"]:
            print("   ", p["id"], p["expected"], "detected" if p["detected"] else "-", p["severity"], p["cause"], "OK" if p["hit"] else ("cut" if p["hit"] is None else "MISS"))
