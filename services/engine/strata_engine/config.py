"""Engine configuration: paths, clocks, flags. SIM_NOW drives all data logic."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "contracts"
DATA = ROOT / "data"
STORE_DIR = Path(os.environ.get("STRATA_STORE_DIR", DATA / "store"))
SEED_NAME = os.environ.get("STRATA_SEED", "seed_dev")
SIM_NOW = datetime.fromisoformat(os.environ.get("SIM_NOW", "2026-10-09T09:00:00+05:30"))
WEEKS = 104
MODE = os.environ.get("STRATA_MODE", "live")
STORE = os.environ.get("STRATA_STORE", "file")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "none")
ENGINE_VERSION = "0.1.0"

CATALOG = yaml.safe_load((CONTRACTS / "signal_catalog.yaml").read_text(encoding="utf-8"))
ENGAGEMENT = yaml.safe_load((CONTRACTS / "engagement_rules.yaml").read_text(encoding="utf-8"))

ALL_FEATURES = ["A1", "A2", "A3", "A4", "A7", "A10", "A11", "A12", "A13", "A14", "A16", "A17", "A18", "A19", "A20", "A21", "A22"]
FEATURES = [x.strip() for x in os.environ.get("STRATA_FEATURES", ",".join(ALL_FEATURES)).split(",") if x.strip()]

ROLE_LABELS = {
    "operations_manager": "Operations Manager", "account_manager": "Account Manager",
    "sales_manager": "Sales Manager", "support_manager": "Support Manager",
    "business_head": "Business Head", "qa_head": "QA Head",
}
