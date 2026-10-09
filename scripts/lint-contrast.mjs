#!/usr/bin/env node
// Recomputes WCAG 2.x contrast for the text/background token pairs in apps/web/src/styles/tokens.css,
// with apps/web/src/styles/tokens-v2.css applied on top (v2 = review-1 readability overrides; later wins).
// Exit 1 if any pair is below 4.5:1 (AA, normal text) or a v2 readability size drops below its floor
// (base text 16px, captions 14px, targets 44px, table rows 48px). Resolves var() chains.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const styles = join(root, "apps", "web", "src", "styles");
const FILES = [join(styles, "tokens.css"), join(styles, "tokens-v2.css")];
const MIN = 4.5;

// Per file: first declaration wins (skips the reduced-motion override; it does not touch colours).
// Across files: the later file (v2) overrides v1, as in the browser cascade.
const vars = new Map();
for (const file of FILES) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const local = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!local.has(m[1])) local.set(m[1], m[2].trim());
  for (const [k, v] of local) vars.set(k, v);
}

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
for (const fg of ["--ink", "--ink-2", "--ink-3"]) {
  for (const bg of ["--surface", "--canvas", "--surface-2"]) pairs.push([fg, bg, fg === "--ink-3" ? "caption 14px (v2 --fs-12)" : ""]);
}
for (const sev of ["healthy", "watch", "elevated", "high", "critical"]) pairs.push([`--sev-${sev}-fg`, `--sev-${sev}-bg`, "severity pill"]);
pairs.push(["--ink-inverse", "--indigo-800", "primary button / sidebar text"]);
pairs.push(["--ink-inverse", "--indigo-700", "nav item hover / active, primary button hover"]);
pairs.push(["--crimson-700", "--surface", "crimson text"]);
pairs.push(["--crimson-700", "--crimson-100", "bad pill / reject hover"]);
pairs.push(["--indigo-200", "--indigo-800", "nav section labels + sidebar hints (v2)"]);
pairs.push(["--indigo-200", "--indigo-700", "sidebar hints on hovered / active item"]);
pairs.push(["--ink-2", "--indigo-50", "neutral pill, ghost hover, assumption badge"]);
pairs.push(["--ink", "--indigo-50", "row hover, selected palette item"]);
pairs.push(["--indigo-700", "--surface", "metric 'next' links, evidence chips"]);
pairs.push(["--indigo-600", "--surface", "body links"]);
pairs.push(["--indigo-800", "--surface", "skip link, selected tab"]);
pairs.push(["--indigo-800", "--indigo-100", "current stage dot"]);
pairs.push(["--sky-600", "--sky-100", "info pill, synthetic badge"]);
pairs.push(["--amber-600", "--amber-100", "warn pill, illustrative badge, synthetic chip"]);
pairs.push(["--green-700", "--green-100", "ok pill"]);
pairs.push(["--ink", "--indigo-200", "text selection"]);

// v2 readability floors (px).
const FLOORS = [
  ["--fs-13", 16, "base text"],
  ["--fs-12", 14, "captions / helper text"],
  ["--control-h", 44, "minimum target size"],
  ["--row-h", 48, "table rows"],
];

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
for (const [name, min, note] of FLOORS) {
  try {
    const v = resolve(name);
    const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
    const ok = !!px && Number(px[1]) >= min;
    if (!ok) fails++;
    rows.push(`${ok ? "ok  " : "FAIL"} ${name} = ${v} (floor ${min}px)  [${note}]`);
  } catch (e) {
    fails++;
    rows.push(`FAIL ${name}: ${e.message}`);
  }
}
console.log(rows.join("\n"));
if (fails) { console.error(`lint-contrast: ${fails} check(s) failed (contrast below ${MIN}:1 or a v2 size floor)`); process.exit(1); }
console.log(`lint-contrast: ok (${pairs.length} pairs >= ${MIN}:1; ${FLOORS.length} v2 size floors met; tokens.css + tokens-v2.css)`);
