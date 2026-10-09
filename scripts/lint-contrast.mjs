#!/usr/bin/env node
// Recomputes WCAG 2.x contrast for the text/background token pairs in apps/web/src/styles/tokens.css.
// Exit 1 if any pair is below 4.5:1 (AA, normal text). Resolves var() chains.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const file = join(root, "apps", "web", "src", "styles", "tokens.css");
const MIN = 4.5;

// Only top-level :root declarations (skip the reduced-motion override; it does not touch colours).
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const vars = new Map();
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());

function resolve(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle resolving ${name}`);
  seen.add(name);
  const v = vars.get(name);
  if (v === undefined) throw new Error(`undefined token ${name}`);
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
  return ref ? resolve(ref[1], seen) : v;
}

function toRgb(value, name) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  if (m) return [m[1], m[2], m[3]].map(Number);
  throw new Error(`${name}: cannot parse colour "${value}"`);
}

const lum = ([r, g, b]) => {
  const ch = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const pairs = [];
for (const fg of ["--ink", "--ink-2", "--ink-3"]) for (const bg of ["--surface", "--canvas"]) pairs.push([fg, bg, ""]);
for (const sev of ["healthy", "watch", "elevated", "high", "critical"]) pairs.push([`--sev-${sev}-fg`, `--sev-${sev}-bg`, "severity pill"]);
pairs.push(["--ink-inverse", "--indigo-800", "primary button / sidebar text"]);
pairs.push(["--crimson-700", "--surface", "crimson text"]);
pairs.push(["--indigo-200", "--indigo-800", "nav section labels"]);

let fails = 0;
const rows = [];
for (const [fg, bg, note] of pairs) {
  try {
    const r = ratio(toRgb(resolve(fg), fg), toRgb(resolve(bg), bg));
    const ok = r >= MIN;
    if (!ok) fails++;
    rows.push(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1  ${fg} (${resolve(fg)}) on ${bg} (${resolve(bg)})${note ? `  [${note}]` : ""}`);
  } catch (e) {
    fails++;
    rows.push(`FAIL ${fg} on ${bg}: ${e.message}`);
  }
}
console.log(rows.join("\n"));
if (fails) { console.error(`lint-contrast: ${fails} pair(s) below ${MIN}:1`); process.exit(1); }
console.log(`lint-contrast: ok (${pairs.length} pairs >= ${MIN}:1)`);
