"""npm run seed: generate seed A (dev), seed B (hold-out) and one estate per extra demo company into data/store/."""
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

# One data estate per extra demo company: its own random draw, relabelled for its industry (data/profiles.py).
import pandas as pd  # noqa: E402
from profiles import apply  # noqa: E402

companies = yaml.safe_load((ROOT / "config" / "demo_companies.yaml").read_text(encoding="utf-8"))["companies"]
for co in companies:
    ds = co.get("dataset")
    if not ds or ds in ("seed_dev", "seed_holdout") or not co.get("seed"):
        continue
    out = ROOT / "data" / "store" / ds
    m = generate(int(co["seed"]), out)
    tables = {p.stem: pd.read_pickle(p) for p in out.glob("*.pkl")}
    for name, df in apply(co.get("profile", "pharma"), tables).items():
        df.to_pickle(out / f"{name}.pkl")
    print(ds, co["seed"], co.get("profile"), m["rows"])
