// npm run dev: starts the engine (FastAPI :8000) and the web app (Next.js :3000) together.
import { spawn } from "node:child_process";
const opts = { stdio: "inherit", shell: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } };
const engine = spawn("npm", ["run", "engine"], opts);
const web = spawn("npm", ["run", "web"], opts);
const stop = () => { engine.kill(); web.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
