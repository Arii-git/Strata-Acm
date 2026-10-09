#!/usr/bin/env node
// Honesty lint (AGENTS.md §2, §4). Exit 1 on any hit, printing file:line.
//  1. Banned phrases (case-insensitive) in apps/web/src/** (every subfolder, incl. components/diagrams and
//     components/features/*), repo-root config/** (UI copy: explain, terms, taxonomy) and docs/*.md
//     (minus the prompt/scaffolding docs).
//  2. Every <Metric ...> / <ChartFrame ...> / <DataTable ...> JSX element in apps/web/src/**/*.tsx must carry
//     provenance= (DataTable also caption=); in components/diagrams/** any <...Frame> wrapper must too.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
// Optional args (for self-tests): lint-honesty.mjs [webSrcDir] [docsDir]
const webSrc = process.argv[2] ? resolvePath(process.argv[2]) : join(root, "apps", "web", "src");
const docsDir = process.argv[3] ? resolvePath(process.argv[3]) : join(root, "docs");
// UI copy that lives outside apps/web/src (scanned on the default run only, not in self-tests)
const configDir = process.argv[2] ? null : join(root, "config");
const DOC_EXCLUDE = new Set([
  "01_BLUEPRINT.md", "02_CODEX_MASTER_PROMPT.md", "03_LANE_PROMPTS.md", "00_START_HERE.md",
  "04_TOOLKIT.md", "05_PHASE5_DEPLOY_PROMPT.md", "06_DEMO_AND_PITCH.md", "AGENTS.md",
]);
const BANNED = ["guaranteed", "proven", "saves ₹", "% more accurate", "real customers", "deployed at"];
// Word-bounded so "provenance" does not match "proven".
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Boundaries only at letter edges ("% more accurate" must still match "30% more accurate"; "saves ₹" must match "saves ₹5").
const BANNED_RE = BANNED.map((b) => [b, new RegExp(
  `${/^\p{L}/u.test(b) ? "(?<![\\p{L}\\p{N}])" : ""}${esc(b)}${/\p{L}$/u.test(b) ? "(?![\\p{L}\\p{N}])" : ""}`, "iu")]);
const SRC_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md", ".json"]);

const rel = (p) => relative(root, p).split(sep).join("/");
const ext = (p) => p.slice(p.lastIndexOf("."));
const SKIP_DIRS = new Set(["node_modules", ".next", "__pycache__"]);
function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); } else out.push(p);
  }
  return out;
}

const hits = [];
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

// 1. banned phrases
const phraseFiles = [
  ...walk(webSrc).filter((p) => SRC_EXT.has(ext(p))),
  ...(configDir ? walk(configDir).filter((p) => SRC_EXT.has(ext(p))) : []),
  ...readdirSync(docsDir).filter((n) => n.endsWith(".md") && !DOC_EXCLUDE.has(n)).map((n) => join(docsDir, n)),
];
for (const f of phraseFiles) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [b, re] of BANNED_RE) if (re.test(line)) hits.push(`${rel(f)}:${i + 1}: banned phrase "${b}": ${line.trim().slice(0, 160)}`);
  });
}

// 2. <Metric> / <ChartFrame> / <DataTable> (and diagram *Frame wrappers) must carry provenance=
// Scan from the tag start to the closing '>' of the opening tag, skipping {...} expressions and quoted strings.
function openingTag(text, start) {
  let depth = 0; let quote = null;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}
const tsxFiles = walk(webSrc).filter((p) => p.endsWith(".tsx"));
const isDiagram = (f) => `/${rel(f)}`.includes("/components/diagrams/");
for (const f of tsxFiles) {
  // Blank out comments (keeping newlines so line numbers stay right).
  const blank = (c) => c.replace(/[^\n]/g, " ");
  const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank);
  const tagRe = isDiagram(f) ? /<(Metric|ChartFrame|DataTable|[A-Z]\w*Frame)(?=[\s/>])/g : /<(Metric|ChartFrame|DataTable)(?=[\s/>])/g;
  for (const m of text.matchAll(tagRe)) {
    const el = openingTag(text, m.index);
    const note = /\{\s*\.\.\./.test(el) ? " (props spread; provenance not visible)" : "";
    if (!/\bprovenance\s*=/.test(el)) {
      hits.push(`${rel(f)}:${lineOf(text, m.index)}: <${m[1]}> without provenance=${note}: ${el.replace(/\s+/g, " ").slice(0, 140)}`);
    }
    if (m[1] === "DataTable" && !/\bcaption\s*=/.test(el)) {
      hits.push(`${rel(f)}:${lineOf(text, m.index)}: <DataTable> without caption=${note}: ${el.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
}

if (hits.length) {
  console.error(`lint-honesty: ${hits.length} hit(s)\n` + hits.join("\n"));
  process.exit(1);
}
console.log(`lint-honesty: ok (${phraseFiles.length} files scanned for banned phrases; Metric/ChartFrame/DataTable provenance present in ${tsxFiles.length} .tsx files)`);
