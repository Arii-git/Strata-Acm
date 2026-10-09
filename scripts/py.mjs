// Cross-platform Python launcher: finds .venv/Scripts/python.exe (Windows) or .venv/bin/python.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cands = [join(root, ".venv", "Scripts", "python.exe"), join(root, ".venv", "bin", "python")];
let py = cands.find((p) => existsSync(p));
const args = process.argv.slice(2);
if (args[0] === "--setup") {
  if (!py) {
    const sys = process.platform === "win32" ? "python" : "python3";
    spawnSync(sys, ["-m", "venv", join(root, ".venv")], { stdio: "inherit" });
    py = cands.find((p) => existsSync(p));
  }
  const r = spawnSync(py, ["-m", "pip", "install", "-q", "-r", join(root, "services", "engine", "requirements.txt")], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
if (!py) { console.error("No .venv found. Run `npm run setup` first."); process.exit(1); }

// Load the untracked .env (GEMINI_*, SMTP_*, ...) for the engine and scripts. Shell values win.
// Never for pytest: tests must stay keyless and must never send real mail.
function readDotenv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    out[m[1]] = v;
  }
  return out;
}
const dotenv = args.includes("pytest") ? {} : readDotenv(join(root, ".env"));
const env = { ...dotenv, ...process.env, PYTHONPATH: join(root, "services", "engine") };
const r = spawnSync(py, args, { stdio: "inherit", env, cwd: root });
process.exit(r.status ?? 1);
