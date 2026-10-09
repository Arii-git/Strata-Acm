"""Signal engine (Sentinel's deterministic core).

Implements contracts/signal_catalog.yaml: robust z of the current 4-week window
against the account's own rolling 4-week baseline (median/MAD), seasonality index
from the prior year + common-mode adjustment, noisy-OR aggregation with
source-diversity factor and hard rules. Pure function of the data <= as_of.
The engine NEVER reads eval_labels or scenarios.yaml.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from .config import CATALOG, SIM_NOW, WEEKS

D0 = SIM_NOW.date()
CUR = WEEKS - 1  # index of the last week (current window = CUR-3..CUR)
BASE_END = WEEKS - 6  # baseline windows end at or before as_of - 5w
WEAK_Z = float(CATALOG["conventions"]["weak_threshold_z"])
SIG = {s["key"]: s for s in CATALOG["signals"]}
LABELS = {
    "order_volume_delta": "Order volume", "order_value_delta": "Order value", "fill_rate": "Fill rate",
    "delivery_delay_days": "Delivery delay", "stock_cover_days": "Stock cover", "eta_slip_count": "Supplier ETA slips",
    "complaint_count_delta": "Complaints", "response_time_delta": "Response time",
    "support_backlog_region": "Regional SLA breaches", "interaction_frequency_delta": "Touchpoints",
    "prescriber_visit_gap_days": "Nephrologist visit gap", "rep_coverage_ratio": "Rep coverage",
    "overdue_receivable_ratio": "Overdue receivables", "batch_complaint_cluster": "Batch complaint cluster",
    "suspected_ae_flag": "Possible adverse-event report", "opportunity_volume_growth": "Growth with product gap",
}
UNITS = {"order_volume_delta": "pct", "order_value_delta": "pct", "fill_rate": "ratio", "delivery_delay_days": "days",
         "stock_cover_days": "days", "eta_slip_count": "count", "complaint_count_delta": "pct",
         "response_time_delta": "pct", "interaction_frequency_delta": "pct", "prescriber_visit_gap_days": "days",
         "overdue_receivable_ratio": "ratio", "support_backlog_region": "ratio"}


def week_start(w: int) -> date:
    return D0 - timedelta(days=7 * (WEEKS - w))


def week_idx(d: pd.Series) -> np.ndarray:
    dd = pd.to_datetime(d)
    if getattr(dd.dt, "tz", None) is not None:
        dd = dd.dt.tz_localize(None)
    return ((dd - pd.Timestamp(week_start(0))).dt.days // 7).to_numpy()


def roll4(m: np.ndarray) -> np.ndarray:
    """Rolling 4-week sums; column i = sum of weeks i-3..i (cols <3 are nan)."""
    c = np.cumsum(np.pad(m, ((0, 0), (1, 0))), axis=1)
    out = np.full(m.shape, np.nan)
    out[:, 3:] = c[:, 4:] - c[:, :-4]
    return out


@dataclass
class Sig:
    id: str
    signal_key: str
    scope: str
    scope_key: str
    account_id: int | None
    value: float
    baseline: float
    robust_z: float
    delta: float | None
    series: dict[str, Any] | None = None
    note: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def meta(self) -> dict[str, Any]:
        return SIG.get(self.signal_key, {})

    @property
    def source(self) -> str:
        return str(self.meta.get("source", "orders"))

    @property
    def klass(self) -> str:
        return str(self.meta.get("class", "commercial"))

    @property
    def adverse_dir(self) -> str:
        return str(self.meta.get("adverse", "down"))

    @property
    def is_adverse(self) -> bool:
        if self.adverse_dir == "down":
            return self.robust_z <= -WEAK_Z
        if self.adverse_dir == "up":
            return self.robust_z >= WEAK_Z
        return False

    @property
    def is_favourable(self) -> bool:
        if self.adverse_dir == "down":
            return self.robust_z >= WEAK_Z
        if self.adverse_dir == "up":
            return self.robust_z <= -WEAK_Z
        return self.robust_z >= WEAK_Z

    @property
    def direction(self) -> str:
        return "adverse" if self.is_adverse else ("favourable" if self.is_favourable else "neutral")

    @property
    def p(self) -> float:
        if not self.is_adverse:
            return 0.0
        return float(self.meta.get("weight", 0.3)) * float(np.clip(abs(self.robust_z) / 4.0, 0, 1))

    def to_dict(self, role: str = "supporting") -> dict[str, Any]:
        return {
            "id": self.id, "signal_key": self.signal_key, "label": LABELS.get(self.signal_key, self.signal_key),
            "source": self.source, "class": self.klass, "scope": self.scope, "scope_key": self.scope_key,
            "value": _r(self.value), "baseline": _r(self.baseline), "robust_z": _r(self.robust_z, 2),
            "delta": _r(self.delta), "direction": self.direction, "role": role,
            "caption": self.meta.get("caption", ""), "unit": UNITS.get(self.signal_key, "value"),
            "definition": self.meta.get("definition", ""), "series": self.series, "note": self.note,
        }


def _r(x: float | None, n: int = 3) -> float | None:
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return None
    return round(float(x), n)


def robust(x_now: np.ndarray, base: np.ndarray, floor_abs: float = 0.0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (median, mad_scaled, z) per row; base is rows x windows (nan ignored)."""
    med = np.nanmedian(base, axis=1)
    mad = np.nanmedian(np.abs(base - med[:, None]), axis=1)
    mad = np.maximum(mad, np.maximum(0.05 * np.abs(med), floor_abs))
    mad = np.where(mad <= 0, 1e-6, mad)
    z = (x_now - med) / (1.4826 * mad)
    return med, 1.4826 * mad, z


class Frames:
    """Weekly matrices computed once from the store's fact tables."""

    def __init__(self, t: dict[str, pd.DataFrame]):
        self.t = t
        acc = t["accounts"].sort_values("id").reset_index(drop=True)
        self.acc = acc
        self.ids = acc["id"].to_numpy()
        self.pos = {int(a): i for i, a in enumerate(self.ids)}
        A = len(acc)
        o = t["orders"].copy()
        o["w"] = week_idx(o["order_date"])
        o = o[(o["w"] >= 0) & (o["w"] < WEEKS)]
        o["a"] = o["account_id"].map(self.pos)
        o["delay"] = (pd.to_datetime(o["delivered_date"]) - pd.to_datetime(o["promised_date"])).dt.days.clip(lower=0)
        self.o = o

        def mat(df: pd.DataFrame, col: str | None) -> np.ndarray:
            m = np.zeros((A, WEEKS))
            if col is None:
                g = df.groupby(["a", "w"]).size()
            else:
                g = df.groupby(["a", "w"])[col].sum()
            idx = g.index.to_frame().to_numpy().astype(int)
            m[idx[:, 0], idx[:, 1]] = g.to_numpy()
            return m

        self.units = mat(o, "qty_ordered")
        self.filled = mat(o, "qty_filled")
        self.value = mat(o, "value")
        self.delay_sum = mat(o, "delay")
        self.n_lines = mat(o, None)
        # seasonality index from the prior year (portfolio weekly totals), orders only
        T = self.units.sum(axis=0)
        si = np.ones(WEEKS)
        for w in range(52, WEEKS):
            ly = w - 52
            nb = T[max(0, ly - 6): ly + 7]
            si[w] = T[ly] / np.median(nb) if np.median(nb) > 0 else 1.0
        self.si = si
        self.units_adj = self.units / si
        self.value_adj = self.value / si
        c = t["complaints"].copy()
        c["w"] = week_idx(c["opened_at"])
        c["a"] = c["account_id"].map(self.pos)
        self.c = c
        cc = c[c["kind"].isin(["service", "delivery", "billing"]) & (c["w"] >= 0)]
        self.complaints = mat(cc, None)
        s = t["support_interactions"].copy()
        s["w"] = week_idx(s["opened_at"])
        s["a"] = s["account_id"].map(self.pos)
        s["resp_h"] = (pd.to_datetime(s["first_response_at"]) - pd.to_datetime(s["opened_at"])).dt.total_seconds() / 3600
        self.s = s
        self.tickets = mat(s[s["w"] >= 0], None)
        i = t["account_interactions"].copy()
        i["w"] = week_idx(i["occurred_at"])
        i["a"] = i["account_id"].map(self.pos)
        self.i = i
        self.touch = mat(i[i["w"] >= 0], None)
        self.visits = mat(i[(i["w"] >= 0) & (i["kind"] == "visit")], None)
        prod = t["products"].set_index("sku")
        o["area"] = o["sku"].map(prod["therapy_area"])
        self.areas = sorted(prod["therapy_area"].unique())
        self.area_units = {}
        for ar in self.areas:
            self.area_units[ar] = mat(o[o["area"] == ar], "qty_ordered") / si
        self.week_labels = [week_start(w).isoformat() for w in range(WEEKS)]


def series_for(f: Frames, m: np.ndarray, a: int, base_val: float | None, weeks: int = 26) -> dict[str, Any]:
    vals = m[a, WEEKS - weeks:]
    return {"labels": f.week_labels[WEEKS - weeks:], "values": [round(float(v), 2) for v in vals],
            "baseline": None if base_val is None else round(float(base_val), 2)}


def common_mode(delta: np.ndarray) -> float:
    d = delta[np.isfinite(delta)]
    if len(d) == 0:
        return 0.0
    med = float(np.median(d))
    share = float(np.mean(np.sign(d) == np.sign(med))) if med != 0 else 0.0
    return med if share > 0.6 else 0.0


def account_signals(f: Frames, suppressed_order_accounts: set[int] | None = None) -> dict[int, list[Sig]]:
    """Compute every account-scope signal for every account at as_of = SIM_NOW."""
    suppressed_order_accounts = suppressed_order_accounts or set()
    A = len(f.ids)
    out: dict[int, list[Sig]] = {int(a): [] for a in f.ids}
    base_slice = slice(3, BASE_END + 1)

    def count_signal(key: str, m: np.ndarray, weekly_for_series: np.ndarray, floor_abs: float, cm: bool) -> None:
        r = roll4(m)
        x = r[:, CUR]
        med, smad, z = robust(x, r[:, base_slice], floor_abs)
        delta = np.where(med > 0, x / np.where(med > 0, med, 1) - 1, np.nan)
        if cm:
            cmv = common_mode(delta)
            if cmv != 0.0:
                x = x - cmv * med
                delta = delta - cmv
                z = (x - med) / smad
        for k, aid in enumerate(f.ids):
            if key.startswith("order") and int(aid) in suppressed_order_accounts:
                continue
            out[int(aid)].append(Sig(
                id=f"EV-{aid}-{key}", signal_key=key, scope="account", scope_key=str(aid), account_id=int(aid),
                value=float(x[k]), baseline=float(med[k]), robust_z=float(z[k]),
                delta=None if not np.isfinite(delta[k]) else float(delta[k]),
                series=series_for(f, weekly_for_series, k, med[k] / 4.0)))

    count_signal("order_volume_delta", f.units_adj, f.units_adj, 0.0, True)
    count_signal("order_value_delta", f.value_adj, f.value_adj, 0.0, True)
    count_signal("complaint_count_delta", f.complaints, f.complaints, 0.5, True)
    count_signal("interaction_frequency_delta", f.touch, f.touch, 0.5, True)

    # ratio signals: fill rate and delivery delay
    def ratio_signal(key: str, num: np.ndarray, den: np.ndarray, floor_abs: float) -> None:
        rn, rd = roll4(num), roll4(den)
        with np.errstate(divide="ignore", invalid="ignore"):
            ratio = np.where(rd > 0, rn / rd, np.nan)
        x = ratio[:, CUR]
        med, smad, z = robust(x, ratio[:, base_slice], floor_abs)
        with np.errstate(divide="ignore", invalid="ignore"):
            wk = np.where(den > 0, num / den, np.nan)
        for k, aid in enumerate(f.ids):
            if int(aid) in suppressed_order_accounts or not np.isfinite(x[k]):
                continue
            out[int(aid)].append(Sig(
                id=f"EV-{aid}-{key}", signal_key=key, scope="account", scope_key=str(aid), account_id=int(aid),
                value=float(x[k]), baseline=float(med[k]), robust_z=float(z[k]),
                delta=float(x[k] - med[k]), series=series_for(f, np.nan_to_num(wk, nan=0.0), k, med[k])))

    ratio_signal("fill_rate", f.filled, f.units, 0.01)
    ratio_signal("delivery_delay_days", f.delay_sum, f.n_lines, 0.25)

    # response time: median first-response hours per 4-week window
    s = f.s[f.s["w"] >= 0]
    resp = np.full((A, WEEKS), np.nan)
    wk_med = np.full((A, WEEKS), np.nan)
    for a_i, g in s.groupby("a"):
        w = g["w"].to_numpy()
        h = g["resp_h"].to_numpy()
        for i in range(3, WEEKS):
            sel = h[(w >= i - 3) & (w <= i)]
            if len(sel):
                resp[int(a_i), i] = np.median(sel)
        for i in range(WEEKS):
            sel = h[w == i]
            if len(sel):
                wk_med[int(a_i), i] = np.median(sel)
    x = resp[:, CUR]
    med, smad, z = robust(x, resp[:, base_slice], 0.0)
    delta = x / med - 1
    for k, aid in enumerate(f.ids):
        if np.isfinite(x[k]):
            out[int(aid)].append(Sig(
                id=f"EV-{aid}-response_time_delta", signal_key="response_time_delta", scope="account",
                scope_key=str(aid), account_id=int(aid), value=float(x[k]), baseline=float(med[k]),
                robust_z=float(z[k]), delta=float(delta[k]),
                series=series_for(f, np.nan_to_num(wk_med, nan=0.0), k, med[k])))
    f.resp_window = resp

    # overdue receivable ratio at each week end
    rcv = f.t["receivables"].copy()
    due = pd.to_datetime(rcv["due_date"]).to_numpy()
    paid = pd.to_datetime(rcv["paid_on"]).to_numpy()
    amt = rcv["amount"].to_numpy(dtype=float)
    ra = rcv["account_id"].map(f.pos).to_numpy()
    ratio = np.full((A, WEEKS), np.nan)
    bill12 = np.cumsum(np.pad(f.value, ((0, 0), (1, 0))), axis=1)
    for wi in range(12, WEEKS):
        t_end = np.datetime64(week_start(wi) + timedelta(days=7))
        od = (due < t_end) & (np.isnat(paid) | (paid > t_end))
        overdue = np.bincount(ra[od], weights=amt[od], minlength=A)
        b = bill12[:, wi + 1] - bill12[:, wi - 11]
        ratio[:, wi] = np.where(b > 0, overdue / np.maximum(b, 1), np.nan)
    x = ratio[:, CUR]
    med, smad, z = robust(x, ratio[:, 12:BASE_END + 1], 0.15)
    for k, aid in enumerate(f.ids):
        if np.isfinite(x[k]):
            out[int(aid)].append(Sig(
                id=f"EV-{aid}-overdue_receivable_ratio", signal_key="overdue_receivable_ratio", scope="account",
                scope_key=str(aid), account_id=int(aid), value=float(x[k]), baseline=float(med[k]),
                robust_z=float(z[k]), delta=float(x[k] - med[k]),
                series=series_for(f, np.nan_to_num(ratio, nan=0.0), k, med[k])))

    # prescriber visit gap (hospital / clinic accounts with linked prescribers)
    iv = f.i[f.i["prescriber_id"].notna()]
    now = pd.Timestamp(D0)
    for a_i, g in iv.groupby("a"):
        aid = int(f.ids[int(a_i)])
        ts = pd.to_datetime(g["occurred_at"]).sort_values()
        gaps = ts.diff().dt.days.dropna().to_numpy()
        hist_gaps = gaps[: max(1, len(gaps) - 2)]
        if len(hist_gaps) < 10:
            continue
        cur_gap = float((now - ts.iloc[-1]).days)
        med_gap = float(np.median(hist_gaps))
        mad = max(float(np.median(np.abs(hist_gaps - med_gap))), 0.05 * med_gap, 1.0)
        z = (cur_gap - med_gap) / (1.4826 * mad)
        out[aid].append(Sig(id=f"EV-{aid}-prescriber_visit_gap_days", signal_key="prescriber_visit_gap_days",
                            scope="account", scope_key=str(aid), account_id=aid, value=cur_gap, baseline=med_gap,
                            robust_z=float(z), delta=cur_gap - med_gap,
                            series=series_for(f, f.visits, int(a_i), None)))
    return out


def sku_signals(f: Frames) -> dict[str, list[Sig]]:
    ws = f.t["warehouse_stock"].copy()
    ws["w"] = week_idx(ws["snapshot_date"])
    out: dict[str, list[Sig]] = {}
    disp = f.o.groupby(["sku", "w"])["qty_filled"].sum().unstack(fill_value=0)
    for sku, g in ws.groupby("sku"):
        g = g.sort_values("w")
        d = disp.loc[sku].reindex(range(WEEKS), fill_value=0).to_numpy() / 7.0 if sku in disp.index else np.ones(WEEKS)
        mean_daily = np.array([max(d[max(0, w - 3): w + 1].mean(), 0.1) for w in g["w"]])
        cover = g["on_hand"].to_numpy() / mean_daily
        x = float(cover[-1])
        base = cover[: -5]
        med = float(np.median(base))
        mad = max(float(np.median(np.abs(base - med))), 0.05 * med)
        z = (x - med) / (1.4826 * mad)
        sigs = [Sig(id=f"EV-{sku}-stock_cover_days", signal_key="stock_cover_days", scope="sku", scope_key=sku,
                    account_id=None, value=x, baseline=med, robust_z=float(z), delta=x - med,
                    series={"labels": [str(v) for v in g["snapshot_date"].astype(str).tolist()[-26:]],
                            "values": [round(float(v), 1) for v in cover[-26:]], "baseline": round(med, 1)})]
        slips = float(g["eta_slips"].to_numpy()[-4:].max())
        bs = g["eta_slips"].to_numpy()[:-5].astype(float)
        bmed = float(np.median(bs))
        bmad = max(float(np.median(np.abs(bs - bmed))), 0.5)
        sigs.append(Sig(id=f"EV-{sku}-eta_slip_count", signal_key="eta_slip_count", scope="sku", scope_key=sku,
                        account_id=None, value=slips, baseline=bmed, robust_z=(slips - bmed) / (1.4826 * bmad),
                        delta=slips - bmed))
        out[str(sku)] = sigs
    return out


def noisy_or(sigs: list[Sig]) -> tuple[int, int, list[str]]:
    adv = [s for s in sigs if s.is_adverse]
    sources = sorted({s.source for s in adv})
    if not adv:
        return 0, 0, []
    raw = 1 - float(np.prod([1 - s.p for s in adv]))
    n = len(sources)
    div = {1: 0.55, 2: 0.80}.get(n, 1.0)
    score = int(round(100 * min(1.0, raw * div)))
    if n < 3:
        score = min(score, 69)  # hard rule: high/critical need >= 3 independent sources
    return score, n, sources


def band(score: int) -> str:
    if score >= 85:
        return "critical"
    if score >= 70:
        return "high"
    if score >= 50:
        return "elevated"
    if score >= 30:
        return "watch"
    return "healthy"


def now_iso() -> str:
    return SIM_NOW.isoformat()


def as_dt(d: date) -> datetime:
    return datetime.combine(d, datetime.min.time()).replace(tzinfo=SIM_NOW.tzinfo)
