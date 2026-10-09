#!/usr/bin/env node
// Metric-dictionary coverage (A24, lane L6). Exit 1 if any <Metric id="..."> in apps/web/src/**/*.tsx
// (including Metrics inside <MetricGroup>) uses an id that is missing from config/metrics.yaml.
// Also reports Metric elements with a dynamic id expression (informational; they cannot be checked statically).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const webSrc = join(root, "apps", "web", "src");
const yamlText = readFileSync(join(root, "config", "metrics.yaml"), "utf8");
const known = new Set([...yamlText.matchAll(/^- id:\s*["']?([a-z0-9_]+)["']?\s*$/gm)].map((m) => m[1]));

const rel = (p) => relative(root, p).split(sep).join("/");
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules" && name !== ".next") walk(p, out); }
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Return the opening tag text starting at `start` ("<Metric ..."), skipping {...} expressions and quoted strings.
function openingTag(text, start) {
  let depth = 0; let quote = null;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== "\\") quote = null; continue; }
    if (depth === 0 && (c === '"' || c === "'")) { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

const missing = [];
const dynamic = [];
const used = new Set();
for (const f of walk(webSrc)) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/<Metric(?![A-Za-z0-9_])/g)) {
    const tag = openingTag(text, m.index);
    const line = text.slice(0, m.index).split("\n").length;
    // id="x" | id='x' | id={"x"} | id={'x'} | id={`x`}
    const lit = tag.match(/\bid=(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`$]*)["'`]\s*\})/);
    const dyn = !lit && /\bid=\{/.test(tag);
    if (lit) {
      const id = lit[1] ?? lit[2] ?? lit[3];
      used.add(id);
      if (!known.has(id)) missing.push(`${rel(f)}:${line}: id "${id}" is not in config/metrics.yaml`);
    } else if (dyn) {
      dynamic.push(`${rel(f)}:${line}: dynamic id (not checked)`);
    }
  }
}

if (dynamic.length) console.log(`check-metric-ids: ${dynamic.length} Metric(s) with a dynamic id:\n  ` + dynamic.join("\n  "));
if (missing.length) {
  console.error(`check-metric-ids: ${missing.length} metric id(s) missing from config/metrics.yaml:\n` + missing.join("\n"));
  process.exit(1);
}
console.log(`check-metric-ids: ok (${used.size} distinct id(s) used in source, ${known.size} in config/metrics.yaml)`);
