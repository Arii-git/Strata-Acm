"""npm run engine:replay: start the engine in STRATA_MODE=replay (serves data/snapshots/replay.json only)."""
import os

os.environ["STRATA_MODE"] = "replay"
import uvicorn  # noqa: E402

uvicorn.run("strata_engine.app:app", host="127.0.0.1", port=8000)
