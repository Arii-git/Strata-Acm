"""npm run demo:reset: restore simulated state (never deletes notebook entries or human-authored memory)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "engine"))
from strata_engine import state  # noqa: E402

state.reset_simulated()
print("Simulated state restored. Notebook entries kept:", len(state.notebook_list()))
