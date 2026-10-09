"""npm run scale: single-tenant prototype measurement at 10x accounts (2,400).

Generates a temporary store, then reports (provenance: computed, on this machine) the generation time,
engine evaluate() time, p95 latency of GET /risks over 20 calls, and whether the hero (S01) is still
detected as critical. Not a production benchmark.
"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
N = int(os.environ.get("SCALE_ACCOUNTS", "2400"))
tmp = Path(tempfile.mkdtemp())
os.environ["STRATA_STORE_DIR"] = str(tmp)
os.environ["STRATA_SEED"] = "scale"
os.environ["STRATA_STATE_DB"] = str(tmp / "state.db")
sys.path.insert(0, str(ROOT / "data"))
sys.path.insert(0, str(ROOT / "services" / "engine"))
import numpy as np  # noqa: E402
from generator import generate  # noqa: E402

t0 = time.perf_counter()
m = generate(20261009, tmp / "scale", accounts=N)
gen_s = time.perf_counter() - t0
from fastapi.testclient import TestClient  # noqa: E402

from strata_engine.app import E, app  # noqa: E402

t0 = time.perf_counter()
eng = E()
eval_s = time.perf_counter() - t0
c = TestClient(app)
lat = []
for _ in range(20):
    t = time.perf_counter()
    c.get("/risks?persona=operations_manager")
    lat.append(time.perf_counter() - t)
hero = next((i for i in eng.det.incidents if i.account_id == 4821), None)
res = {"accounts": N, "order_rows": m["rows"]["orders"], "generate_seconds": round(gen_s, 1),
       "engine_evaluate_seconds": round(eval_s, 2), "risks_p95_ms": round(float(np.percentile(lat, 95)) * 1000, 1),
       "incidents": len(eng.det.incidents), "hero_detected": bool(hero), "hero_severity": hero.severity if hero else None,
       "provenance": "computed", "note": "single-tenant prototype measurement on the build laptop; not a production benchmark"}
(ROOT / "data" / "store").mkdir(parents=True, exist_ok=True)
(ROOT / "data" / "store" / "scale_latest.json").write_text(json.dumps(res, indent=2))
print(json.dumps(res, indent=2))
