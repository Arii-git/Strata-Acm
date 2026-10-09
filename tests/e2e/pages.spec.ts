import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, setPersona } from "../shared/engine";

// Lane C (L1 + L3): every page is wrapped in PageTemplate, every Metric lives in a MetricGroup of at most 3,
// at most 3 widgets sit above the Details, and the Problems board shows all 7 fields on every card.
// Read-only: does not reset the engine.

const PAGES: [string, string][] = [
  ["problems", "/app/problems"],
  ["risks", "/app/risks"],
  ["health", "/app/health"],
  ["sources", "/app/sources"],
  ["opportunities", "/app/opportunities"],
  ["accounts", "/app/accounts"],
  ["account", "/app/accounts/4821"],
  ["memory", "/app/memory"],
  ["workflows", "/app/workflows"],
  ["outcomes", "/app/outcomes"],
  ["time-to-action", "/app/time-to-action"],
  ["evaluation", "/app/evaluation"],
  ["audit", "/app/audit"],
  ["lab", "/app/lab"],
  ["notebook", "/app/notebook"],
];

const FIELDS = ["category", "severity", "stage", "scope", "owner", "age", "exposure"] as const;

async function simpleMode(page: Page) {
  await page.addInitScript(() => { try { window.localStorage.setItem("strata.viewmode", "simple"); } catch { /* ignore */ } });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[role=status][aria-live=polite]").filter({ hasText: /Loading/ })).toHaveCount(0, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

for (const [name, path] of PAGES) {
  test(`page template and metric grouping: ${name}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await simpleMode(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByTestId("page-template")).toBeVisible();
    await settle(page);

    const report = await page.evaluate(() => {
      const metrics = [...document.querySelectorAll("[data-metric]")];
      const orphans = metrics.filter((m) => !m.closest("[data-metric-group]")).map((m) => m.getAttribute("data-metric"));
      const groups = [...document.querySelectorAll("[data-metric-group]")].map((g) => g.querySelectorAll("[data-metric]").length);
      const tpl = document.querySelector("[data-testid=page-template]");
      const widgets = tpl ? [...tpl.children].filter((c) => c.tagName !== "HEADER" && !c.classList.contains("page-template__details")).length : -1;
      return { orphans, groups, widgets };
    });
    expect(report.orphans, "Metric outside a MetricGroup").toEqual([]);
    for (const n of report.groups) expect(n, "metrics per MetricGroup").toBeLessThanOrEqual(3);
    expect(report.widgets, "widgets above the Details").toBeLessThanOrEqual(3);
    expect(report.widgets).toBeGreaterThan(0);
    await expect(page.getByTestId("takeaway")).not.toHaveText("");
    expect(errors.filter((e) => !/Failed to load resource/.test(e)), "console errors").toEqual([]);
  });
}

test("problems board: every card shows all 7 fields and links to its case", async ({ page }) => {
  await setPersona(page, "operations_manager");
  await page.goto("/app/problems", { waitUntil: "networkidle" });
  const cards = page.getByTestId("problem-card");
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    for (const f of FIELDS) {
      const el = card.locator(`[data-field="${f}"]`);
      await expect(el, `card ${i} field ${f}`).toHaveCount(1);
      await expect(el).not.toHaveText(/^\s*$/);
    }
    await expect(card.locator("[data-field=exposure]")).toContainText("exposed");
    await expect(card.locator("[data-field=category] [data-testid=category-chip] svg")).toHaveCount(1);
    await expect(card.getByRole("link")).toHaveAttribute("href", /\/app\/incidents\/[A-Z]+-\d{4}-\d{4}/);
  }
  await expect(page.getByTestId("alert-budget")).toContainText(/shown, \d+ held back for your role/);
});

test("problems board: a category filter reduces the cards and is kept in the URL", async ({ page }) => {
  await page.goto("/app/problems", { waitUntil: "networkidle" });
  const cards = page.getByTestId("problem-card");
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();
  const cats = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-category")));
  const counts = new Map<string, number>();
  cats.forEach((c) => counts.set(c ?? "", (counts.get(c ?? "") ?? 0) + 1));
  const [pick, expected] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
  test.skip(counts.size < 2, "only one category present; nothing to filter");
  await page.getByTestId(`filter-cat-${pick}`).click();
  await expect(page).toHaveURL(new RegExp(`cat=${pick}`));
  await expect(cards).toHaveCount(expected);
  expect(expected).toBeLessThan(before);
  for (const c of await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-category")))) expect(c).toBe(pick);
  await expect(page.getByTestId(`filter-cat-${pick}`)).toHaveAttribute("aria-pressed", "true");
});

test("problems board: list toggle switches to the table and back", async ({ page }) => {
  await page.goto("/app/problems", { waitUntil: "networkidle" });
  await expect(page.getByTestId("problem-board")).toBeVisible();
  const n = await page.getByTestId("problem-card").count();
  await page.getByTestId("view-list").click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByTestId("problem-table")).toBeVisible();
  await expect(page.getByTestId("problem-board")).toHaveCount(0);
  const rows = page.locator("[data-testid=problem-table] tbody tr");
  await expect(rows).toHaveCount(n);
  for (const f of FIELDS) await expect(rows.first().locator(`[data-field="${f}"]`)).toHaveCount(1);
  await page.getByTestId("view-board").click();
  await expect(page).not.toHaveURL(/view=list/);
  await expect(page.getByTestId("problem-board")).toBeVisible();
});

test("problems board: deep link with ?view=list opens the list", async ({ page }) => {
  await page.goto("/app/problems?view=list&minsev=high", { waitUntil: "networkidle" });
  await expect(page.getByTestId("problem-table")).toBeVisible();
  const sev = await page.locator("[data-testid=problem-table] tbody [data-field=severity]").allInnerTexts();
  for (const s of sev) expect(s).toMatch(/Critical|High/);
});

test("problems board: Alert Budget drawer and How-we-classify panel", async ({ page }) => {
  await page.goto("/app/problems", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "see why" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Alert Budget");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const panel = page.getByTestId("classify-panel");
  await panel.locator("summary").click();
  await expect(panel.getByTestId("category-chip")).toHaveCount(8);
  await expect(panel).toContainText("Usual owner");
  await expect(panel).toContainText("First action");
});

test("risks page is the problem list with the same fields", async ({ page }) => {
  await page.goto("/app/risks", { waitUntil: "networkidle" });
  await expect(page.getByTestId("page-template")).toBeVisible();
  const rows = page.locator("[data-testid=problem-table] tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const f of FIELDS) await expect(rows.first().locator(`[data-field="${f}"]`)).toHaveCount(1);
});

test("evaluation shows the ML corroboration column in words", async ({ page }) => {
  await page.goto("/app/evaluation", { waitUntil: "networkidle" });
  await expect(page.getByRole("columnheader", { name: /ML also flagged/ }).first()).toBeVisible();
});
