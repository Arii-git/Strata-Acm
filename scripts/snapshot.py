"""npm run snapshot: record engine responses into data/snapshots/replay.json for STRATA_MODE=replay.

Runs against a throw-away state DB: resets, records GET views, runs every investigation (keyless,
deterministic) and records the post-investigation views, so replay shows agent traces with their
original timestamps. Replay is read-only: no data store, no keys, no network.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["STRATA_STATE_DB"] = str(Path(tempfile.mkdtemp()) / "snapshot_state.db")
os.environ["STRATA_MODE"] = "live"
sys.path.insert(0, str(ROOT / "services" / "engine"))
from fastapi.testclient import TestClient  # noqa: E402

from strata_engine.app import app  # noqa: E402

PERSONAS = ["operations_manager", "account_manager", "sales_manager", "support_manager", "business_head", "qa_head"]
c = TestClient(app)
c.post("/lab/reset")
rec: dict[str, object] = {}


def get(path: str) -> dict:
    r = c.get(path)
    if r.status_code == 200:
        rec[f"GET {path}"] = r.json()
        return r.json()
    return {}


incs = get("/incidents")["items"]
for ref in [i["ref"] for i in incs]:
    rec[f"POST /incidents/{ref}/investigate"] = c.post(f"/incidents/{ref}/investigate").json()
for p in ["/incidents", "/opportunities", "/portfolio/health", "/sources", "/signals/catalog", "/accounts", "/memory/items",
          "/memory/items?kind=outcome", "/memory/items?kind=incident", "/memory/items?kind=sop", "/eval/latest", "/routines",
          "/workflows", "/outcomes", "/notes", "/audit", "/audit/verify", "/time-to-action", "/notebook"]:
    get(p)
for ps in PERSONAS:
    for p in ["/briefing", "/risks", "/approvals", "/workflows", "/notes"]:
        get(f"{p}?persona={ps}")
accs = {i["account_id"] for i in incs if i["account_id"]} | {a["id"] for a in rec["GET /accounts"]["items"][:40]}
for ref in [i["ref"] for i in incs]:
    d = get(f"/incidents/{ref}")
    for b in d.get("blast_radius", []):
        accs.add(b["account_id"])
for a in sorted(accs):
    get(f"/accounts/{a}")
out = ROOT / "data" / "snapshots"
out.mkdir(parents=True, exist_ok=True)
(out / "replay.json").write_text(json.dumps(rec), encoding="utf-8")
print(f"recorded {len(rec)} responses -> data/snapshots/replay.json")
