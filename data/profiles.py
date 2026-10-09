"""Industry profiles: one generated data estate per demo company (all fictional).

The generator always builds the same table shapes (so detection, cases and the evaluation work unchanged).
A profile then relabels the human-facing text for that company's industry: region and city names, account
names, product names, a few complaint texts and the people attached to accounts. Internal keys (account type,
SKU id, kind) never change. The engine reads the same profile to label account types and case titles.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

# account type key -> (display label, name suffix)
PHARMA_TYPES = {"stockist": ("Stockist", "Pharma Distributors"), "chemist_chain": ("Chemist chain", "Chemists"),
                "hospital_pharmacy": ("Hospital pharmacy", "Hospital Pharmacy"), "nephrology_clinic": ("Nephrology clinic", "Kidney Clinic")}

PROFILES: dict[str, dict[str, Any]] = {
    "pharma": {"types": PHARMA_TYPES},
    "fmcg": {
        "types": {"stockist": ("Distributor", "Distributors"), "chemist_chain": ("Modern trade chain", "Supermart"),
                  "hospital_pharmacy": ("HoReCa account", "Hotels & Caterers"), "nephrology_clinic": ("General trade outlet", "Kirana Stores")},
        "regions": {"Mumbai Metro": ["Mumbai", "Thane", "Navi Mumbai", "Vasai"], "Pune": ["Pune", "Pimpri", "Nashik", "Satara"],
                    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot"], "Bengaluru": ["Bengaluru", "Mysuru", "Tumakuru", "Hosur"],
                    "Hyderabad": ["Hyderabad", "Warangal", "Vijayawada", "Guntur"], "Chennai": ["Chennai", "Coimbatore", "Madurai", "Vellore"]},
        "products": {
            "SKU-ANM-01": "Mango fruit drink 1 L", "SKU-ANM-02": "Instant coffee 200 g jar", "SKU-ANM-03": "Green tea 100 bags",
            "SKU-ANM-04": "Lemon soda 600 ml", "SKU-ANM-05": "Energy drink 250 ml can",
            "SKU-CKD-01": "Basmati rice 5 kg", "SKU-CKD-02": "Sunflower oil 1 L", "SKU-CKD-03": "Whole wheat atta 10 kg",
            "SKU-CKD-04": "Toor dal 1 kg", "SKU-CKD-05": "Iodised salt 1 kg",
            "SKU-ELC-01": "Neem soap 4-pack", "SKU-ELC-02": "Herbal shampoo 340 ml", "SKU-ELC-03": "Toothpaste 150 g", "SKU-ELC-04": "Body lotion 400 ml",
            "SKU-NUT-01": "Oats 1 kg", "SKU-NUT-02": "Instant noodles 12-pack", "SKU-NUT-03": "Breakfast cereal 475 g", "SKU-NUT-04": "Peanut butter 340 g",
            "SKU-MED-01": "Dishwash liquid 750 ml", "SKU-MED-02": "Detergent powder 2 kg", "SKU-MED-03": "Floor cleaner 1 L",
            "SKU-MED-04": "Toilet cleaner 500 ml", "SKU-MED-05": "Mosquito repellent refill",
            "SKU-PAN-01": "Salted potato chips 90 g", "SKU-PAN-02": "Cream biscuits 300 g", "SKU-PAN-03": "Roasted namkeen 400 g",
        },
        "areas": {"renal_anemia": "beverages", "ckd_mbd": "staples", "electrolyte": "personal_care", "renal_nutrition": "packaged_foods",
                  "renal_medicine": "home_care", "pain": "snacks"},
        "complaints": {"Seal damaged on several vials": "Seal damaged on several packs",
                       "Discolouration noticed in vials of this batch": "Off smell noticed in packs of this lot",
                       "Pharmacist reports a patient felt unwell and dizzy after starting this product; requests guidance":
                           "Store reports a shopper felt unwell after consuming this product; requests guidance"},
        "contact": ("Category buyer", "category_management"),
        "titles": {"Possible adverse-event report from": "Possible consumer-safety report from",
                   "Quality complaint cluster on batch": "Quality complaint cluster on lot"},
    },
    "logistics": {
        "types": {"stockist": ("Enterprise shipper", "Industries"), "chemist_chain": ("E-commerce client", "Online Retail"),
                  "hospital_pharmacy": ("Cold-chain client", "Cold Chain Foods"), "nephrology_clinic": ("SME shipper", "Traders")},
        "regions": {"NCR hub": ["Gurugram", "Noida", "Kundli", "Faridabad"], "Mumbai & JNPT": ["Bhiwandi", "Nhava Sheva", "Thane", "Panvel"],
                    "Chennai port": ["Chennai", "Ennore", "Sriperumbudur", "Oragadam"], "Kolkata": ["Kolkata", "Howrah", "Durgapur", "Haldia"],
                    "Bengaluru": ["Bengaluru", "Hosur", "Nelamangala", "Tumakuru"], "Ahmedabad & Mundra": ["Ahmedabad", "Mundra", "Sanand", "Vadodara"]},
        "products": {
            "SKU-ANM-01": "Express parcel (next day)", "SKU-ANM-02": "Reefer truck 2-8 C", "SKU-ANM-03": "Air cargo, metro pairs",
            "SKU-ANM-04": "Same-day intra-city", "SKU-ANM-05": "Reverse pickup",
            "SKU-CKD-01": "Full truckload, Delhi-Mumbai lane", "SKU-CKD-02": "Full truckload, Mumbai-Chennai lane",
            "SKU-CKD-03": "Part truckload, North zone", "SKU-CKD-04": "Part truckload, South zone", "SKU-CKD-05": "Rail container, ICD Tughlakabad",
            "SKU-ELC-01": "Warehouse pallet storage", "SKU-ELC-02": "Pick-and-pack per order", "SKU-ELC-03": "Kitting and labelling", "SKU-ELC-04": "Cross-dock handling",
            "SKU-NUT-01": "Import customs clearance", "SKU-NUT-02": "Export documentation", "SKU-NUT-03": "Bonded warehouse slot", "SKU-NUT-04": "Port drayage",
            "SKU-MED-01": "Last-mile van, metro", "SKU-MED-02": "Last-mile bike, metro", "SKU-MED-03": "Rural delivery partner",
            "SKU-MED-04": "Cash-on-delivery remittance", "SKU-MED-05": "Fleet GPS tracking",
            "SKU-PAN-01": "Packaging material", "SKU-PAN-02": "Transit insurance", "SKU-PAN-03": "Proof-of-delivery scans",
        },
        "areas": {"renal_anemia": "express", "ckd_mbd": "line_haul", "electrolyte": "warehousing", "renal_nutrition": "customs",
                  "renal_medicine": "last_mile", "pain": "value_added"},
        "complaints": {"Seal damaged on several vials": "Several cartons arrived crushed",
                       "Discolouration noticed in vials of this batch": "Temperature log shows an excursion on this consignment",
                       "Carton seal broken on receipt": "Pallet wrap torn on receipt",
                       "Pharmacist reports a patient felt unwell and dizzy after starting this product; requests guidance":
                           "Driver reports a near-miss during unloading at this site; requests a safety review"},
        "contact": ("Site manager", "site_operations"),
        "titles": {"Possible adverse-event report from": "Possible safety incident at",
                   "Quality complaint cluster on batch": "Damage claim cluster on consignment batch"},
    },
}


def type_label(industry: str, key: str) -> str:
    return PROFILES.get(industry, PROFILES["pharma"])["types"].get(key, PHARMA_TYPES.get(key, (key, key)))[0]


def title(industry: str, text: str) -> str:
    for old, new in PROFILES.get(industry, {}).get("titles", {}).items():
        text = text.replace(old, new)
    return text


def apply(industry: str, t: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """Relabel one generated estate for an industry. Pharma is the generator's native vocabulary (no-op)."""
    p = PROFILES.get(industry)
    if not p or industry == "pharma":
        return t
    t = {k: v.copy() for k, v in t.items()}
    old_regions = list(t["regions"]["name"])
    new_regions = list(p["regions"])
    t["regions"]["name"] = new_regions[: len(old_regions)]
    acc = t["accounts"]
    city_of = {rid: p["regions"][new_regions[rid - 1]] for rid in range(1, len(new_regions) + 1)}
    acc["city"] = [city_of[int(r)][int(a) % 4] for r, a in zip(acc["region_id"], acc["id"])]
    for key, (_, pharma_suffix) in PHARMA_TYPES.items():
        new_suffix = p["types"][key][1]
        acc["name"] = acc["name"].str.replace(pharma_suffix, new_suffix, regex=False)
    t["products"]["name"] = t["products"]["sku"].map(p["products"]).fillna(t["products"]["name"])
    t["products"]["therapy_area"] = t["products"]["therapy_area"].map(p["areas"]).fillna(t["products"]["therapy_area"])
    t["complaints"]["body"] = t["complaints"]["body"].replace(p["complaints"])
    role, specialty = p["contact"]
    if len(t["prescribers"]):
        t["prescribers"]["name"] = [f"{role} {i} (fictional)" for i in t["prescribers"]["id"]]
        t["prescribers"]["specialty"] = specialty
    return t
