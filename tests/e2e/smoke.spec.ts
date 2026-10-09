import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectConsoleErrors, resetEngine } from "../shared/engine";

const SCREENS = join(process.cwd(), "tests", "screens");
mkdirSync(SCREENS, { recursive: true });

// [name, path, question in the PageHeader <h1>]
const PAGES: [string, string, string | null][] = [
  ["landing", "/", null],
  ["briefing", "/app", "What needs me today?"],
  ["health", "/app/health", "Is the business healthy right now, and what is dragging it?"],
  ["sources", "/app/sources", "Can we trust what we are looking at?"],
  ["risks", "/app/risks", "Which accounts need action, in what order?"],
  ["opportunities", "/app/opportunities", "Where is growth we are not acting on?"],
  ["accounts", "/app/accounts", "Which customers should we look at?"],
  ["account-4821", "/app/accounts/4821", "How is this customer doing and what should we do next for them?"],
  ["incidents", "/app/incidents", "What is open and who owns it?"],
  ["incident-0001", "/app/incidents/INC-2026-0001", "What is happening, why, what did we do last time, what should we do?"],
  ["memory", "/app/memory", "What have we learned and what is missing?"],
  ["approvals", "/app/approvals", "What is waiting for a human decision, and for how long?"],
  ["workflows", "/app/workflows", "Who owns what, and what is stuck?"],
  ["outcomes", "/app/outcomes", "Did our actions work?"],
  ["time-to-action", "/app/time-to-action", "How fast do we get from signal to executing workflow?"],
  ["evaluation", "/app/evaluation", "How good is Strata, honestly?"],
  ["audit", "/app/audit", "Who or what decided, when, based on what?"],
  ["lab", "/app/lab", "Show me it working on something new."],
  ["notebook", "/app/notebook", "What did we try, what failed, what did we change?"],
];

type AxeHit = { page: string; path: string; id: string; impact: string; help: string; nodes: number; targets: string[] };
const axeHits: AxeHit[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => { await resetEngine(request); });

test.afterAll(async ({ request }) => {
  const critical = axeHits.filter((h) => h.impact === "critical");
  const serious = axeHits.filter((h) => h.impact === "serious");
  writeFileSync(
    join(SCREENS, "axe-summary.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), counts: { critical: critical.length, serious: serious.length }, violations: axeHits }, null, 2),
  );
  await resetEngine(request);
});

for (const [name, path, question] of PAGES) {
  test(`page ${path}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(path, { waitUntil: "networkidle" });

    if (question === null) {
      await expect(page.getByRole("heading", { level: 1, name: "STRATA" })).toBeVisible();
      await expect(page.getByText("Arihant Chordia", { exact: false })).toBeVisible();
      await expect(page.getByText("Yogesh R Mehta", { exact: false })).toBeVisible();
      await expect(page.getByText("District 05", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Enter Strata" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
      await expect(page.getByText(/SYNTHETIC DATA/).first()).toBeVisible();
      // wait for loading skeletons to settle before screenshot/axe
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200); // let ECharts finish its entry animation before the screenshot
    }

    await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });

    if (path.startsWith("/app")) {
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of res.violations) {
        if (v.impact === "serious" || v.impact === "critical") {
          axeHits.push({ page: name, path, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) });
        }
      }
      const crit = res.violations.filter((v) => v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
      expect.soft(crit, `critical axe violations on ${path}`).toEqual([]);
    }

    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}
