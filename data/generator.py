"""STRATA synthetic data generator (data lane).

Generates a fictional nephrology-pharma data estate and plants the scenarios
from contracts/scenarios.yaml. Writes eval_labels (ground truth) separately; the
engine never reads them for detection.

All data is SYNTHETIC. Account names are obviously fictional. No real people.
Usage: python data/generator.py --seed 20261009 --out data/store/seed_dev
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SIM_NOW = datetime.fromisoformat("2026-10-09T09:00:00+05:30")
D0 = SIM_NOW.date()  # first day AFTER the history
WEEKS = 104
N_ACCOUNTS = 240
FIRST_ID = 4701  # ids 4701..4940, hero = 4821
HERO = 4821
REGIONS = ["Delhi NCR", "Haryana", "Punjab", "UP West", "Rajasthan East", "Uttarakhand"]
CITIES = {
    "Delhi NCR": ["Gurugram", "Noida", "New Delhi", "Faridabad"],
    "Haryana": ["Panipat", "Karnal", "Rohtak", "Hisar"],
    "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala"],
    "UP West": ["Meerut", "Ghaziabad", "Saharanpur", "Moradabad"],
    "Rajasthan East": ["Jaipur", "Alwar", "Ajmer", "Bharatpur"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani"],
}
TYPES = ["stockist", "chemist_chain", "hospital_pharmacy", "nephrology_clinic"]
TYPE_P = [0.30, 0.25, 0.25, 0.20]

# 26 generic SKUs across six therapy areas (generic naming mode; no real brands)
PRODUCTS = [
    ("SKU-ANM-01", "Erythropoiesis support injection 4000 IU", "renal_anemia", True, 24, 1450.0),
    ("SKU-ANM-02", "Iron sucrose injection 100 mg", "renal_anemia", True, 24, 520.0),
    ("SKU-ANM-03", "Ferric carboxymaltose 500 mg", "renal_anemia", True, 24, 2350.0),
    ("SKU-ANM-04", "Folic acid + B12 tablet", "renal_anemia", True, 24, 95.0),
    ("SKU-ANM-05", "Oral iron complex syrup", "renal_anemia", True, 18, 140.0),
    ("SKU-CKD-01", "Phosphate binder 800 mg tablet", "ckd_mbd", True, 36, 610.0),
    ("SKU-CKD-02", "Calcitriol 0.25 mcg capsule", "ckd_mbd", True, 24, 180.0),
    ("SKU-CKD-03", "Cinacalcet 30 mg tablet", "ckd_mbd", True, 36, 890.0),
    ("SKU-CKD-04", "Calcium acetate 667 mg tablet", "ckd_mbd", True, 36, 160.0),
    ("SKU-CKD-05", "Paricalcitol 1 mcg capsule", "ckd_mbd", True, 24, 760.0),
    ("SKU-ELC-01", "Sodium bicarbonate 500 mg tablet", "electrolyte", True, 36, 75.0),
    ("SKU-ELC-02", "Potassium binder sachet", "electrolyte", True, 24, 420.0),
    ("SKU-ELC-03", "Oral rehydration electrolyte powder", "electrolyte", False, 24, 35.0),
    ("SKU-ELC-04", "Magnesium supplement tablet", "electrolyte", False, 24, 110.0),
    ("SKU-NUT-01", "Renal nutrition protein powder 400 g", "renal_nutrition", True, 18, 690.0),
    ("SKU-NUT-02", "Keto-analogue tablet", "renal_nutrition", True, 24, 540.0),
    ("SKU-NUT-03", "Renal multivitamin capsule", "renal_nutrition", True, 24, 130.0),
    ("SKU-NUT-04", "Low-electrolyte feed 200 ml", "renal_nutrition", False, 12, 210.0),
    ("SKU-MED-01", "Antihypertensive CCB 10 mg tablet", "renal_medicine", True, 36, 120.0),
    ("SKU-MED-02", "Loop diuretic 40 mg tablet", "renal_medicine", True, 36, 45.0),
    ("SKU-MED-03", "SGLT2 inhibitor 10 mg tablet", "renal_medicine", True, 36, 380.0),
    ("SKU-MED-04", "Uric acid lowering 40 mg tablet", "renal_medicine", True, 36, 160.0),
    ("SKU-MED-05", "Immunosuppressant 0.5 mg capsule", "renal_medicine", True, 24, 980.0),
    ("SKU-PAN-01", "Paracetamol 650 mg tablet", "pain", False, 36, 30.0),
    ("SKU-PAN-02", "Pregabalin 75 mg capsule", "pain", False, 36, 190.0),
    ("SKU-PAN-03", "Topical analgesic gel 30 g", "pain", False, 24, 150.0),
]
HERO_SKU = "SKU-CKD-01"
NAME_A = ["Northwind", "Bluebell", "Saffron", "Riverbend", "Lotus", "Kestrel", "Meadow", "Banyan", "Silverline",
          "Peacock", "Harbor", "Amberleaf", "Tamarind", "Cedar", "Monsoon", "Juniper", "Pebble", "Marigold",
          "Falcon", "Orchid", "Sunpath", "Willow", "Granite", "Coral"]
NAME_B = {"stockist": "Pharma Distributors (Fictional)", "chemist_chain": "Chemists (Fictional)",
          "hospital_pharmacy": "Hospital Pharmacy (Fictional)", "nephrology_clinic": "Kidney Clinic (Fictional)"}


def week_start(w: int) -> date:
    """Week w (0..103) covers [week_start(w), week_start(w)+7)."""
    return D0 - timedelta(days=7 * (WEEKS - w))


@dataclass
class Gen:
    seed: int

    def __post_init__(self) -> None:
        self.rng = np.random.default_rng(self.seed)

    # ------------------------------------------------------------------ reference
    def reference(self) -> None:
        r = self.rng
        self.regions = pd.DataFrame({"id": range(1, 7), "name": REGIONS})
        reps = []
        for i in range(28):
            reps.append({"id": 101 + i, "name": f"Rep {101 + i} (fictional)", "region_id": 1 + i % 6,
                         "active": True, "left_on": None})
        self.reps = pd.DataFrame(reps)
        self.products = pd.DataFrame(PRODUCTS, columns=["sku", "name", "therapy_area", "is_chronic",
                                                        "shelf_life_mo", "unit_price"])
        self.products["naming_source"] = "generic"
        ids = list(range(FIRST_ID, FIRST_ID + N_ACCOUNTS))
        types = r.choice(TYPES, size=N_ACCOUNTS, p=TYPE_P)
        size = np.exp(r.normal(0, 0.55, N_ACCOUNTS))
        acc = []
        for k, aid in enumerate(ids):
            t = str(types[k])
            if aid == HERO:
                t = "stockist"
                size[k] = 3.2
            region_id = 1 + int(r.integers(0, 6))
            reg_reps = [p["id"] for p in reps if p["region_id"] == region_id]
            acc.append({
                "id": aid,
                "name": f"{NAME_A[k % len(NAME_A)]} {NAME_B[t]} {aid}",
                "type": t, "region_id": region_id,
                "city": CITIES[REGIONS[region_id - 1]][int(r.integers(0, 4))],
                "rep_id": int(r.choice(reg_reps)),
                "onboarded_on": (date(2023, 10, 3) + timedelta(days=int(r.integers(0, 120)))).isoformat(),
                "size": float(size[k]),
            })
        self.accounts = pd.DataFrame(acc)
        q = self.accounts["size"].quantile([0.5, 0.85]).values
        self.accounts["tier"] = np.where(self.accounts["size"] >= q[1], "A",
                                         np.where(self.accounts["size"] >= q[0], "B", "C"))
        self.accounts["credit_limit"] = (self.accounts["size"] * 800000).round(-3)
        # baskets: 4-7 SKUs; HERO_SKU restricted to the hero + a small set (blast radius)
        baskets: dict[int, list[str]] = {}
        all_skus = [p[0] for p in PRODUCTS if p[0] != HERO_SKU]
        for aid in ids:
            n = int(r.integers(4, 8))
            baskets[aid] = list(r.choice(all_skus, size=n, replace=False))
        others = [a for a in ids if a != HERO]
        self.hero_sku_buyers = [int(x) for x in r.choice(others, size=9, replace=False)]
        baskets[HERO] = [HERO_SKU, "SKU-CKD-02", "SKU-ANM-02", "SKU-MED-02", "SKU-ELC-01"]
        for aid in self.hero_sku_buyers:
            baskets[aid] = [HERO_SKU] + baskets[aid][:5]
        self.baskets = baskets
        # prescribers at hospitals/clinics
        pres = []
        hosp = self.accounts[self.accounts["type"].isin(["hospital_pharmacy", "nephrology_clinic"])]
        for i, (_, a) in enumerate(hosp.sample(n=min(60, len(hosp)), random_state=self.seed % 1000).iterrows()):
            pres.append({"id": 9001 + i, "name": f"Dr. Prescriber {9001 + i} (fictional)", "specialty": "nephrology",
                         "account_id": int(a["id"]), "rep_id": int(a["rep_id"])})
        self.prescribers = pd.DataFrame(pres)

    # ------------------------------------------------------------------ helpers
    def select(self) -> None:
        """Resolve scenario selectors (rank = by baseline order size, desc)."""
        a = self.accounts.sort_values(["size", "id"], ascending=[False, True])
        a = a[a["id"] != HERO]

        def pick(df: pd.DataFrame, rank: int) -> int:
            return int(df.iloc[rank - 1]["id"])

        taken = {HERO, *self.hero_sku_buyers}
        a_free = a[~a["id"].isin(taken)]
        self.s07 = pick(a_free[(a_free["type"] == "stockist") & (a_free["tier"] == "A")], 5)
        taken.add(self.s07)
        a_free = a[~a["id"].isin(taken)]
        self.s09 = pick(a_free[a_free["type"] == "hospital_pharmacy"], 1)
        taken.add(self.s09)
        a_free = a[~a["id"].isin(taken)]
        self.s06 = pick(a_free[a_free["type"] == "hospital_pharmacy"], 2)
        taken.add(self.s06)
        a_free = a[~a["id"].isin(taken)]
        self.s12 = [pick(a_free[a_free["type"] == "stockist"], 2), pick(a_free[a_free["type"] == "stockist"], 4)]
        taken.update(self.s12)
        # S04: 3 accounts in different regions that buy the batch SKU
        self.s04_sku = "SKU-ANM-02"
        s04 = []
        for reg in [2, 4, 6]:
            cand = a[(a["region_id"] == reg) & (~a["id"].isin(taken))]
            s04.append(int(cand.iloc[3]["id"]))
        self.s04 = s04
        taken.update(s04)
        hp = a[(a["type"] == "hospital_pharmacy") & (~a["id"].isin(taken))]
        self.s05 = int(hp.iloc[6]["id"])
        taken.add(self.s05)
        # S10: one region (Punjab = 3); hero region must differ
        hero_region = int(self.accounts.loc[self.accounts["id"] == HERO, "region_id"].iloc[0])
        self.s10_region = 3 if hero_region != 3 else 5
        # S08: one rep's accounts (rep with most accounts outside S10 region and hero region)
        cand_reps = self.accounts[~self.accounts["region_id"].isin([self.s10_region, hero_region])]
        counts = cand_reps[~cand_reps["id"].isin(taken)].groupby("rep_id").size().sort_values(ascending=False)
        self.s08_rep = int(counts.index[0])
        self.s08 = [int(x) for x in self.accounts[(self.accounts["rep_id"] == self.s08_rep)
                                                  & (~self.accounts["id"].isin(taken))]["id"]]
        # ensure s09 basket: anemia + ckd lines, no renal nutrition
        b = [s for s in self.baskets[self.s09] if not s.startswith("SKU-NUT")]
        for s in ["SKU-ANM-01", "SKU-ANM-03", "SKU-CKD-02", "SKU-CKD-03"]:
            if s not in b:
                b.append(s)
        self.baskets[self.s09] = b[:7]
        for aid in s04:
            if self.s04_sku not in self.baskets[aid]:
                self.baskets[aid] = [self.s04_sku] + self.baskets[aid][:5]

    def season(self, d: date) -> float:
        doy = d.timetuple().tm_yday
        s = 1.0 + 0.04 * np.sin(2 * np.pi * (doy - 60) / 365.25)
        # festival-season dip (S11 decoy) — same calendar window every year: 25 Sep .. 9 Oct
        md = (d.month, d.day)
        if (9, 25) <= md <= (10, 9):
            s *= 0.85
        return float(s)

    # ------------------------------------------------------------------ facts
    def facts(self) -> None:
        r = self.rng
        prod = self.products.set_index("sku")
        order_rows = []
        weeks = [week_start(w) for w in range(WEEKS)]
        seas = np.array([self.season(ws + timedelta(days=3)) for ws in weeks])
        for _, a in self.accounts.iterrows():
            aid = int(a["id"])
            drift_sd = 0.003 if aid == HERO else 0.004
            drift = np.exp(np.cumsum(r.normal(0, drift_sd, WEEKS)))
            drift /= drift[-30:].mean() if aid != HERO else drift.mean()
            for sku in self.baskets[aid]:
                base_qty = a["size"] * r.uniform(20, 60) * (300 / max(prod.loc[sku, "unit_price"], 30)) ** 0.35
                sigma = 0.08 if aid == HERO else 0.15
                noise = np.exp(r.normal(0, sigma, WEEKS))
                for w in range(WEEKS):
                    q = base_qty * seas[w] * drift[w] * noise[w]
                    fill = min(1.0, r.normal(0.975, 0.015))
                    delay = int(r.poisson(0.4))
                    ws = weeks[w]
                    days_before = (D0 - ws).days
                    # ---- planted scenarios on orders
                    if aid == HERO and days_before <= 35:
                        ramp = min(1.0, (35 - days_before + 7) / 7)  # linear first 7 days, then plateau
                        q *= 1 - 0.31 * ramp
                        if sku == HERO_SKU:
                            fill = 0.62 if ramp >= 1 else 0.94 - 0.32 * ramp
                            delay += 6
                    if aid in self.hero_sku_buyers[:6] and sku == HERO_SKU and days_before <= 28:
                        fill = min(fill, r.uniform(0.80, 0.88))  # mild loss: blast radius
                    if aid == self.s07 and days_before <= 30:
                        q *= 0.78
                    if aid == self.s09 and days_before <= 40 and prod.loc[sku, "therapy_area"] in ("renal_anemia", "ckd_mbd"):
                        q *= 1.38
                    if aid == self.s06 and days_before <= 28:
                        q *= 0.82
                    if aid in self.s12 and w == WEEKS - 3:
                        q *= 2.8
                    qty = max(1, int(round(q)))
                    filled = int(round(qty * fill))
                    od = ws + timedelta(days=int(r.integers(0, 5)))
                    promised = od + timedelta(days=3)
                    order_rows.append((aid, od, sku, qty, filled, round(filled * prod.loc[sku, "unit_price"], 2),
                                       promised, promised + timedelta(days=delay)))
        o = pd.DataFrame(order_rows, columns=["account_id", "order_date", "sku", "qty_ordered", "qty_filled",
                                              "value", "promised_date", "delivered_date"])
        o.insert(0, "id", np.arange(1, len(o) + 1))
        self.orders = o
        self._support()
        self._crm()
        self._inventory()
        self._finance()
        self._feeds()

    def _hero_window_count(self, weekly: np.ndarray, mult: float) -> np.ndarray:
        """Plant a designed effect: last-4-week total = round(mult x median of the account's own
        pre-onset rolling 4-week totals). The scenario defines the effect relative to the account's
        own baseline (see scenarios.yaml hero_numbers_target)."""
        base_end = WEEKS - 6  # baseline windows end at or before week 98 (pre-current-window buffer)
        sums = np.array([weekly[i - 3:i + 1].sum() for i in range(3, base_end + 1)])
        target = int(round(mult * float(np.median(sums))))
        per = np.full(4, target // 4)
        per[: target % 4] += 1
        weekly = weekly.copy()
        weekly[-4:] = per
        return weekly

    def _support(self) -> None:
        r = self.rng
        tickets, comps = [], []
        bodies = {
            "service": ["Order status not shared on time", "Sales return credit pending", "Need updated price list"],
            "delivery": ["Short supply against PO", "Delivery delayed beyond promised date", "Partial dispatch received"],
            "billing": ["Invoice amount mismatch", "Credit note not adjusted", "Payment reconciliation query"],
        }
        for _, a in self.accounts.iterrows():
            aid = int(a["id"])
            lam_t = 8.0 if aid == HERO else 0.6 + 0.9 * a["size"]
            lam_c = 7.0 if aid == HERO else 0.15 + 0.35 * a["size"]
            base_resp_h = float(np.exp(r.normal(np.log(6), 0.25)))
            n_t = r.poisson(lam_t, WEEKS)
            n_c = r.poisson(lam_c, WEEKS)
            if aid == HERO:
                n_c = self._hero_window_count(n_c, 1.47)
            if aid == self.s07:
                n_c = n_c.copy()
            for w in range(WEEKS):
                ws = week_start(w)
                days_before = (D0 - ws).days
                resp_mult = 1.0
                if aid == HERO and days_before <= 28:
                    resp_mult = 1.22
                if int(a["region_id"]) == self.s10_region and days_before <= 14:
                    resp_mult *= 1.60
                for _ in range(int(n_t[w])):
                    opened = datetime.combine(ws + timedelta(days=int(r.integers(0, 7))), datetime.min.time()) + \
                        timedelta(hours=float(r.uniform(9, 19)))
                    sigma = 0.08 if (aid == HERO and resp_mult > 1) else 0.30
                    resp = base_resp_h * resp_mult * float(np.exp(r.normal(0, sigma)))
                    tickets.append((aid, opened, opened + timedelta(hours=resp),
                                    opened + timedelta(hours=resp + float(r.uniform(4, 48))),
                                    str(r.choice(["phone", "whatsapp", "email"])), "general"))
                for _ in range(int(n_c[w])):
                    kind = str(r.choice(["service", "delivery", "billing"], p=[0.4, 0.4, 0.2]))
                    if aid == HERO and days_before <= 28:
                        kind = str(r.choice(["service", "delivery"], p=[0.3, 0.7]))
                    opened = datetime.combine(ws + timedelta(days=int(r.integers(0, 7))), datetime.min.time()) + \
                        timedelta(hours=float(r.uniform(9, 19)))
                    comps.append((aid, opened, kind, None, None, str(r.choice(bodies[kind])), "support"))
            if aid == self.s07:  # billing complaints x3 in the last 30 days
                for k in range(9):
                    opened = datetime.combine(D0 - timedelta(days=int(r.integers(2, 29))), datetime.min.time()) + timedelta(hours=11)
                    comps.append((aid, opened, "billing", None, None, "Overdue reminder dispute; requests extended credit", "support"))
        # S04: 7 quality complaints on ONE batch within 9 days from 3 accounts in different regions
        self.s04_batch = "B-ANM02-2608"
        qtexts = ["Seal damaged on several vials", "Discolouration noticed in vials of this batch", "Carton seal broken on receipt"]
        for k in range(7):
            aid = self.s04[k % 3]
            opened = datetime.combine(D0 - timedelta(days=int(1 + k)), datetime.min.time()) + timedelta(hours=10 + k)
            comps.append((aid, opened, "quality", self.s04_sku, self.s04_batch, qtexts[k % 3], "qa"))
        # S05: one possible adverse-event description (synthetic, non-graphic)
        opened = datetime.combine(D0 - timedelta(days=2), datetime.min.time()) + timedelta(hours=15)
        comps.append((self.s05, opened, "suspected_adverse_event", "SKU-MED-03", None,
                      "Pharmacist reports a patient felt unwell and dizzy after starting this product; requests guidance", "qa"))
        t = pd.DataFrame(tickets, columns=["account_id", "opened_at", "first_response_at", "resolved_at", "channel", "category"])
        t.insert(0, "id", np.arange(1, len(t) + 1))
        c = pd.DataFrame(comps, columns=["account_id", "opened_at", "kind", "sku", "batch_id", "body", "routed_to"])
        c.insert(0, "id", np.arange(1, len(c) + 1))
        self.support_interactions, self.complaints = t, c

    def _crm(self) -> None:
        r = self.rng
        rows = []
        pres_by_acc = self.prescribers.groupby("account_id")["id"].apply(list).to_dict()
        for _, a in self.accounts.iterrows():
            aid = int(a["id"])
            lam = 10.0 if aid == HERO else 1.0 + 1.2 * a["size"]
            n = r.poisson(lam, WEEKS)
            if aid == HERO:
                n = self._hero_window_count(n, 0.60)
            for w in range(WEEKS):
                ws = week_start(w)
                days_before = (D0 - ws).days
                k = int(n[w])
                if aid in self.s08 and days_before <= 25:
                    k = int(round(k * 0.45))
                for _ in range(k):
                    kind = str(r.choice(["visit", "call", "whatsapp", "meeting"], p=[0.35, 0.25, 0.35, 0.05]))
                    pid = None
                    if aid in pres_by_acc and kind == "visit":
                        pid = int(r.choice(pres_by_acc[aid]))
                    occ = datetime.combine(ws + timedelta(days=int(r.integers(0, 7))), datetime.min.time()) + timedelta(hours=float(r.uniform(9, 18)))
                    rows.append((aid, occ, kind, int(a["rep_id"]), pid, int(r.integers(5, 45))))
        df = pd.DataFrame(rows, columns=["account_id", "occurred_at", "kind", "rep_id", "prescriber_id", "duration_min"])
        # S06: hospital — nephrologist visits stop for the last 61 days
        df = df[~((df["account_id"] == self.s06) & (df["prescriber_id"].notna()) &
                  (df["occurred_at"] >= datetime.combine(D0 - timedelta(days=61), datetime.min.time())))]
        df = df.sort_values("occurred_at").reset_index(drop=True)
        df.insert(0, "id", np.arange(1, len(df) + 1))
        self.account_interactions = df
        # S08: rep leaves
        self.reps.loc[self.reps["id"] == self.s08_rep, ["active", "left_on"]] = [False, (D0 - timedelta(days=25)).isoformat()]

    def _inventory(self) -> None:
        r = self.rng
        rows = []
        o = self.orders.copy()
        o["w"] = ((pd.to_datetime(o["order_date"]) - pd.Timestamp(week_start(0))).dt.days // 7).clip(0, WEEKS - 1)
        disp = o.groupby(["sku", "w"])["qty_filled"].sum().unstack(fill_value=0)
        for sku in self.products["sku"]:
            daily = (disp.loc[sku].values / 7.0) if sku in disp.index else np.ones(WEEKS)
            target_cover = r.uniform(22, 40)
            for w in range(WEEKS):
                snap = week_start(w) + timedelta(days=6)
                mean_daily = max(daily[max(0, w - 3): w + 1].mean(), 0.1)
                cover = target_cover * float(np.exp(r.normal(0, 0.12)))
                slips = 0
                if sku == HERO_SKU and (D0 - snap).days <= 18:
                    cover = float(r.uniform(1.2, 2.8))
                    slips = 2
                rows.append((snap, sku, int(cover * mean_daily), int(mean_daily * 21),
                             snap + timedelta(days=10 + 7 * slips), slips))
        self.warehouse_stock = pd.DataFrame(rows, columns=["snapshot_date", "sku", "on_hand", "inbound_qty", "inbound_eta", "eta_slips"])
        self.batches = pd.DataFrame([
            {"batch_id": self.s04_batch, "sku": self.s04_sku, "mfg_date": "2026-08-01", "expiry_date": "2028-07-31", "qty_produced": 40000},
        ])
        self.channel_stock = pd.DataFrame(columns=["snapshot_date", "account_id", "sku", "batch_id", "qty", "expiry_date"])

    def _finance(self) -> None:
        r = self.rng
        rows = []
        o = self.orders.copy()
        o["m"] = pd.to_datetime(o["order_date"]).dt.to_period("M")
        billed = o.groupby(["account_id", "m"])["value"].sum().reset_index()
        for _, b in billed.iterrows():
            aid = int(b["account_id"])
            inv = b["m"].to_timestamp(how="end").date()
            if inv >= D0:
                inv = D0 - timedelta(days=1)
            due = inv + timedelta(days=30)
            late = r.random() < 0.08
            pay_days = int(r.integers(5, 29)) if not late else int(r.integers(31, 60))
            if aid == self.s07 and (D0 - inv).days <= 75:
                pay_days = 999  # stops paying recent invoices: overdue ratio rises
            paid_on = inv + timedelta(days=pay_days)
            rows.append((aid, inv, due, round(float(b["value"]), 2), paid_on if pay_days < 999 else None))
        f = pd.DataFrame(rows, columns=["account_id", "invoice_date", "due_date", "amount", "paid_on"])
        f.insert(0, "id", np.arange(1, len(f) + 1))
        self.receivables = f

    def _feeds(self) -> None:
        now = SIM_NOW
        self.source_feeds = pd.DataFrame([
            {"system": "orders", "label": "Orders / invoicing export", "last_ingested_at": now - timedelta(minutes=40), "expected_every_minutes": 60, "rows_last_run": int(len(self.orders) / WEEKS), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "support", "label": "Support desk & complaints", "last_ingested_at": now - timedelta(minutes=12), "expected_every_minutes": 30, "rows_last_run": int(len(self.support_interactions) / WEEKS), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "crm", "label": "Field CRM / visit log", "last_ingested_at": now - timedelta(minutes=95), "expected_every_minutes": 240, "rows_last_run": int(len(self.account_interactions) / WEEKS), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "inventory", "label": "Warehouse stock snapshot", "last_ingested_at": now - timedelta(minutes=300), "expected_every_minutes": 1440, "rows_last_run": len(self.products), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "workforce", "label": "Rep roster", "last_ingested_at": now - timedelta(hours=20), "expected_every_minutes": 1440, "rows_last_run": len(self.reps), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "finance", "label": "Receivables ledger", "last_ingested_at": now - timedelta(hours=6), "expected_every_minutes": 1440, "rows_last_run": int(len(self.receivables) / 24), "duplicate_ratio": 0.0, "status": "fresh"},
            {"system": "docs", "label": "SOPs & incident notes", "last_ingested_at": now - timedelta(hours=30), "expected_every_minutes": 10080, "rows_last_run": 34, "duplicate_ratio": 0.0, "status": "fresh"},
        ])

    # ------------------------------------------------------------------ labels
    def labels(self) -> list[dict]:
        L = [
            {"scenario": "S01", "kind": "risk", "scope": "account", "keys": [HERO], "cause": "supplier_delay", "expected_detected": True, "expected_severity": "critical", "regulatory_sensitive": False, "onset_days_before_now": 35},
            {"scenario": "S02", "kind": "risk", "scope": "account", "keys": [], "cause": "channel_stockout", "expected_detected": True, "planted": False, "note": "not planted in Core tier (cut)"},
            {"scenario": "S03", "kind": "risk", "scope": "account", "keys": [], "cause": "inventory_mismatch", "expected_detected": True, "planted": False, "note": "not planted in Core tier (cut)"},
            {"scenario": "S04", "kind": "risk", "scope": "batch", "keys": self.s04, "batch": self.s04_batch, "cause": "batch_quality", "expected_detected": True, "regulatory_sensitive": True, "onset_days_before_now": 9},
            {"scenario": "S05", "kind": "risk", "scope": "account", "keys": [self.s05], "cause": "batch_quality", "expected_detected": True, "regulatory_sensitive": True, "onset_days_before_now": 2},
            {"scenario": "S06", "kind": "risk", "scope": "account", "keys": [self.s06], "cause": "field_coverage_gap", "expected_detected": True, "expected_severity": "elevated", "onset_days_before_now": 42},
            {"scenario": "S07", "kind": "risk", "scope": "account", "keys": [self.s07], "cause": "payment_stress", "expected_detected": True, "expected_severity": "high", "onset_days_before_now": 30},
            {"scenario": "S08", "kind": "risk", "scope": "rep", "keys": self.s08, "rep_id": self.s08_rep, "cause": "field_coverage_gap", "expected_detected": True, "onset_days_before_now": 25},
            {"scenario": "S09", "kind": "opportunity", "scope": "account", "keys": [self.s09], "cause": "demand_shift", "expected_detected": True, "onset_days_before_now": 40},
            {"scenario": "S10", "kind": "risk", "scope": "region", "keys": [self.s10_region], "cause": "support_capacity", "expected_detected": True, "onset_days_before_now": 14},
            {"scenario": "S11", "kind": "decoy", "scope": "portfolio", "keys": [], "expected_detected": False},
            {"scenario": "S12", "kind": "decoy", "scope": "account", "keys": self.s12, "expected_detected": False},
        ]
        for x in L:
            x.setdefault("planted", True)
        return L

    def write(self, out: Path) -> None:
        out.mkdir(parents=True, exist_ok=True)
        acc = self.accounts.drop(columns=["size"]).copy()
        acc["is_synthetic"] = True
        acc["size_param"] = self.accounts["size"]
        tables = {
            "regions": self.regions, "reps": self.reps, "accounts": acc, "products": self.products,
            "prescribers": self.prescribers, "batches": self.batches, "orders": self.orders,
            "support_interactions": self.support_interactions, "complaints": self.complaints,
            "account_interactions": self.account_interactions, "warehouse_stock": self.warehouse_stock,
            "channel_stock": self.channel_stock, "receivables": self.receivables, "source_feeds": self.source_feeds,
        }
        for name, df in tables.items():
            df.to_pickle(out / f"{name}.pkl")
        (out / "eval_labels.json").write_text(json.dumps({"seed": self.seed, "sim_now": SIM_NOW.isoformat(),
                                                          "labels": self.labels(),
                                                          "hero_sku_buyers": self.hero_sku_buyers}, indent=2))
        (out / "manifest.json").write_text(json.dumps({"seed": self.seed, "sim_now": SIM_NOW.isoformat(),
                                                       "rows": {k: int(len(v)) for k, v in tables.items()},
                                                       "synthetic": True}, indent=2))


def generate(seed: int, out: Path, accounts: int = 240) -> dict:
    global N_ACCOUNTS
    N_ACCOUNTS = accounts
    g = Gen(seed)
    g.reference()
    g.select()
    g.facts()
    g.write(out)
    return json.loads((out / "manifest.json").read_text())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261009)
    ap.add_argument("--out", type=str, default=str(ROOT / "data" / "store" / "seed_dev"))
    args = ap.parse_args()
    m = generate(args.seed, Path(args.out))
    print(json.dumps(m["rows"]))
