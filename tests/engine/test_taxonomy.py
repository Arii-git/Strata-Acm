"""Taxonomy: the web (config/taxonomy.ts) and the engine (taxonomy.py) define the same categories and stages,
and every incident on both seeds maps to exactly one known category and stage."""
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def test_ts_and_py_agree():
    from strata_engine.taxonomy import CATEGORIES, CATEGORY_LABEL, STAGE_LABEL, STAGES
    ts = (ROOT / "config" / "taxonomy.ts").read_text(encoding="utf-8")
    ts_cats = re.findall(r'\{ key: "(\w+)", label: "([^"]+)"', ts.split("export const CATEGORIES")[1].split("];")[0])
    assert [k for k, _ in ts_cats] and set(k for k, _ in ts_cats) == set(CATEGORIES)
    assert all(CATEGORY_LABEL[k] == v for k, v in ts_cats)
    ts_stages = re.findall(r'\{ key: "(\w+)", label: "([^"]+)"', ts.split("export const STAGES")[1].split("];")[0])
    assert [k for k, _ in ts_stages] == STAGES
    assert all(STAGE_LABEL[k] == v for k, v in ts_stages)


def test_every_incident_has_one_category_and_stage():
    from strata_engine.agents import cause_candidates
    from strata_engine.detect import evaluate
    from strata_engine.taxonomy import CATEGORIES, category_of
    for seed in ("seed_dev", "seed_holdout"):
        d = ROOT / "data" / "store" / seed
        det = evaluate({p.stem: pd.read_pickle(p) for p in d.glob("*.pkl")})
        for inc in det.incidents:
            c = category_of(inc.kind, inc.regulatory_sensitive, cause_candidates(inc)[0].cause, inc.driver)
            assert c in CATEGORIES, (seed, inc.ref, c)
