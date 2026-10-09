"""npm run seed: generate seed A (dev) and seed B (hold-out) into data/store/."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data"))
import yaml  # noqa: E402
from generator import generate  # noqa: E402

sim = yaml.safe_load((ROOT / "contracts" / "scenarios.yaml").read_text(encoding="utf-8"))["sim"]
for name, seed in (("seed_dev", sim["seed_dev"]), ("seed_holdout", sim["seed_holdout"])):
    m = generate(int(seed), ROOT / "data" / "store" / name)
    print(name, seed, m["rows"])
