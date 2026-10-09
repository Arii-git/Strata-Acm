#!/usr/bin/env node
// Fails (exit 1) if any colour literal (#hex or rgb()/rgba()) appears in apps/web/src outside styles/tokens.css.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcDir = join(root, "apps", "web", "src");
const allowed = join(srcDir, "styles", "tokens.css");
const exts = new Set([".ts", ".tsx", ".css", ".js", ".jsx", ".mjs"]);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\(/g;

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (p === allowed) continue;
    const ext = name.slice(name.lastIndexOf("."));
    if (!exts.has(ext)) continue;
    readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
      // ignore hex-looking anchors in hrefs like href="#main"
      const hexHits = [...line.matchAll(HEX)].filter((m) => !/href=["']$/.test(line.slice(0, m.index)));
      if (hexHits.length || RGB.test(line)) hits.push(`${relative(root, p).split(sep).join("/")}:${i + 1}: ${line.trim()}`);
      RGB.lastIndex = 0;
    });
  }
}
walk(srcDir);
if (hits.length) {
  console.error(`lint-hex: ${hits.length} colour literal(s) outside tokens.css:\n` + hits.join("\n"));
  process.exit(1);
}
console.log("lint-hex: ok (no colour literals outside apps/web/src/styles/tokens.css)");
