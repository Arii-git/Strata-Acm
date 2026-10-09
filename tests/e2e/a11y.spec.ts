import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/*
 * Lane E (L8) accessibility gate.
 *  1. axe on every console route, in Simple AND Detailed mode (localStorage "strata.viewmode"); fails on
 *     serious/critical; writes tests/screens/axe-summary-v2.json. In Detailed mode every <details> is opened
 *     first so collapsed content is scanned too. Routes that 404 (another lane has not merged them yet) are
 *     skipped with a note and listed in the summary.
 *  2. Keyboard only: from /app, Tab reaches the skip link first; skip, reach and activate a path card,
 *     then reach and activate "Explain this page", close it with Esc and check focus returns.
 */

const SCREENS = join(process.cwd(), "tests", "screens");
mkdirSync(SCREENS, { recursive: true });
// Playwright restarts the worker after a failing test, so each route writes its own result file and the
// summary is rebuilt from all of them (the first route of the run clears the folder).
const PARTS = join(tmpdir(), "strata-axe-v2-parts");

const ROUTES = [
  "/", "/app", "/app/briefing", "/app/problems", "/app/risks", "/app/health", "/app/sources", "/app/opportunities",
  "/app/accounts", "/app/accounts/4821", "/app/incidents", "/app/incidents/INC-2026-0001", "/app/memory",
  "/app/approvals", "/app/workflows", "/app/outcomes", "/app/time-to-action", "/app/evaluation", "/app/audit",
  "/app/lab", "/app/notebook", "/app/help", "/app/how-it-works",
];
const MODES = ["simple", "detailed"] as const;
type Mode = (typeof MODES)[number];

type Violation = { id: string; impact: string; help: string; nodes: number; targets: string[] };
type RouteResult = { path: string; mode: Mode; status: "ok" | "violations" | "skipped" | "error"; note?: string; violations: Violation[] };
function record(r: RouteResult, first: boolean) {
  if (first) rmSync(PARTS, { recursive: true, force: true });
  mkdirSync(PARTS, { recursive: true });
  const slug = `${String(ROUTES.indexOf(r.path)).padStart(2, "0")}-${r.mode}`;
  writeFileSync(join(PARTS, `${slug}.json`), JSON.stringify(r));
}
function loadResults(): RouteResult[] {
  try {
    return readdirSync(PARTS).filter((n) => n.endsWith(".json")).sort().map((n) => JSON.parse(readFileSync(join(PARTS, n), "utf8")) as RouteResult);
  } catch {
    return [];
  }
}

async function setMode(page: Page, mode: Mode) {
  await page.addInitScript((m) => {
    try { window.localStorage.setItem("strata.viewmode", m); } catch { /* ignore */ }
  }, mode);
}

/** Wait for data to load: network quiet, no busy skeletons, charts drawn. Never fails on its own. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

test.describe("axe: every route, Simple and Detailed", () => {
  test.afterAll(() => {
    const results = loadResults();
    const all = results.flatMap((r) => r.violations.map((v) => ({ path: r.path, mode: r.mode, ...v })));
    writeFileSync(
      join(SCREENS, "axe-summary-v2.json"),
      JSON.stringify({
        generated_at: new Date().toISOString(),
        tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        counts: {
          critical: all.filter((v) => v.impact === "critical").length,
          serious: all.filter((v) => v.impact === "serious").length,
          routes_checked: results.filter((r) => r.status === "ok" || r.status === "violations").length,
          routes_skipped: results.filter((r) => r.status === "skipped").length,
          routes_error: results.filter((r) => r.status === "error").length,
        },
        skipped: results.filter((r) => r.status === "skipped").map((r) => ({ path: r.path, mode: r.mode, note: r.note })),
        errors: results.filter((r) => r.status === "error").map((r) => ({ path: r.path, mode: r.mode, note: r.note })),
        violations: all,
      }, null, 2),
    );
  });

  for (const mode of MODES) {
    for (const path of ROUTES) {
      const first = mode === MODES[0] && path === ROUTES[0];
      test(`axe ${mode} ${path}`, async ({ page }) => {
        await setMode(page, mode);
        const res = await page.goto(path, { waitUntil: "domcontentloaded" });
        const status = res?.status() ?? 0;
        if (status === 404) {
          record({ path, mode, status: "skipped", note: "404: route not created yet by its lane; re-run after merge", violations: [] }, first);
          test.skip(true, `${path} returns 404 (not merged yet)`);
          return;
        }
        if (status >= 500) {
          record({ path, mode, status: "error", note: `HTTP ${status}`, violations: [] }, first);
          expect(status, `${path} returned HTTP ${status}`).toBeLessThan(500);
          return;
        }
        await settle(page);
        if (mode === "detailed") {
          await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
          await page.waitForTimeout(300);
        }

        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad: Violation[] = axe.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, impact: v.impact ?? "", help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
        record({ path, mode, status: bad.length ? "violations" : "ok", violations: bad }, first);
        expect(bad.map((v) => `${v.impact} ${v.id} x${v.nodes}: ${v.targets.join(" | ")}`), `serious/critical axe violations on ${path} (${mode})`).toEqual([]);
      });
    }
  }
});

test.describe("keyboard only", () => {
  /** Press Tab until `match` holds for the focused element (max `limit` presses). */
  async function tabTo(page: Page, match: (el: Element) => boolean, limit = 80): Promise<boolean> {
    const fn = match.toString();
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate((src) => {
        const el = document.activeElement;
        // eslint-disable-next-line no-new-func -- test-only predicate shipped into the page
        return !!el && (new Function(`return (${src})`)() as (e: Element) => boolean)(el);
      }, fn);
      if (hit) return true;
    }
    return false;
  }

  test("skip link, path card and Explain using only the keyboard", async ({ page }) => {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await settle(page);

    // 1. first Tab lands on the skip link
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute("href") }));
    expect(first.text, "first focusable element is the skip link").toMatch(/skip to main content/i);
    expect(first.href).toBe("#main");

    // 2. activating it moves focus into <main>
    await page.keyboard.press("Enter");
    const inMain = await page.evaluate(() => {
      const a = document.activeElement;
      const main = document.getElementById("main") ?? document.querySelector("main");
      return !!a && !!main && (a === main || main.contains(a));
    });
    expect(inMain, "skip link moves focus to main content").toBe(true);

    // 3. reach a path card (Home lane: six path cards) and activate it with Enter
    // a path card is an <li data-testid="path-<id>" class="home-path"> holding one link/button
    const reachedCard = await tabTo(page, (el) => (el.tagName === "A" || el.tagName === "BUTTON") && !!el.closest('.home-path, [data-testid^="path-"]'));
    test.skip(!reachedCard, "No path cards on /app yet (Home lane not merged); re-run after merge");
    const before = page.url();
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.toString() !== before, { timeout: 20_000 });
    await settle(page);

    // 4. reach "Explain this page" and open it with Enter; focus goes into the dialog
    const reachedExplain = await tabTo(page, (el) => el.getAttribute("data-testid") === "explain-button", 120);
    expect(reachedExplain, `Explain button reachable by Tab on ${page.url()}`).toBe(true);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("explain-drawer")).toBeVisible();
    const focusInDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(focusInDialog, "focus moves into the Explain dialog").toBe(true);

    // 5. Tab stays inside the dialog (focus trap)
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "focus is trapped in the dialog").toBe(true);

    // 6. Esc closes it and focus returns to the Explain button
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "focus returns to the opener").toBe("explain-button");
  });
});
