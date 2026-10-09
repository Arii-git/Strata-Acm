import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "engine"))
os.environ["STRATA_STATE_DB"] = str(Path(tempfile.mkdtemp()) / "test_state.db")
