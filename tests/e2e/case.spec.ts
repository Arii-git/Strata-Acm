import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ENGINE, collectConsoleErrors, resetEngine, setPersona } from "../shared/engine";

// Lane B (L5): the case file is the workflow in one place — stage tracker, three tabs, consequence panel,
// decision result, case timeline. Runs against the shared dev servers; resets engine state before and after.
const SCREENS = join(process.cwd(), "tests", "screens");
mkdirSync(SCREENS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SCREENS, `case-${name}.png`), fullPage: true });

const HERO = "INC-2026-0001";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  await resetEngine(request);
  await setPersona(page, "operations_manager");
});

test.afterAll(async ({ request }) => { await resetEngine(request); });

async function noOrphanMetrics(page: Page) {
  const all = await page.locator("[data-metric]").count();
  const grouped = await page.locator("[data-metric-group] [data-metric]").count();
  expect(grouped, "every Metric sits inside a MetricGroup").toBe(all);
}

test("case file: detect -> investigate -> consequence -> approve -> result -> timeline", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(`/app/incidents/${HERO}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("page-template")).toBeVisible();
  const tracker = page.getByTestId("stage-tracker");
  await expect(tracker.locator('[aria-current="step"]')).toContainText("Detected");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: "What happened" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("category-chip").first()).toBeVisible();
  await expect(page.getByTestId("diagram-signals")).toBeVisible();
  await expect(page.getByTestId("diagram-channel")).toBeVisible();
  await expect(page.getByTestId("case-timeline").locator('[data-testid="event-row"][data-event-type="detected"]')).toBeVisible();
  await noOrphanMetrics(page);
  await shot(page, "01-happened");

  // Why: run the investigation
  await page.getByRole("tab", { name: "Why and what we did last time" }).click();
  await expect(page).toHaveURL(/tab=why/);
  await page.getByRole("button", { name: "Run investigation" }).click();
  const why = page.getByRole("tabpanel");
  await expect(why.getByText(/supplier/i).first()).toBeVisible();
  await expect(why.getByText("INC-017").first()).toBeVisible();
  await expect(page.getByTestId("diagram-similarity")).toBeVisible();
  await expect(tracker.locator('[aria-current="step"]')).toContainText("Awaiting approval");
  await shot(page, "02-why");

  // What to do: consequence panel above the approval bar
  await page.getByRole("tab", { name: /^What to do/ }).click();
  const panel = page.getByTestId("consequence-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("diagram-consequence")).toBeVisible();
  await expect(page.getByTestId("expected-result")).toHaveText(/^(Last time \(INC-017|No basis yet — STRATA will record the result and learn from it\.)/);
  await expect(panel).toContainText("a reason is required");
  await shot(page, "03-todo-consequence");

  // Reject without a reason is impossible
  const bar = page.getByRole("region", { name: "Plan decision" });
  await bar.getByRole("button", { name: "Reject", exact: true }).click();
  const submit = bar.getByRole("button", { name: "Submit rejection" });
  await expect(submit).toBeDisabled();
  await bar.getByRole("textbox").last().fill("   ");
  await expect(submit).toBeDisabled();
  await bar.getByRole("button", { name: "Reject", exact: true }).click(); // close the reason box

  // Approve -> result panel lists what was created
  await bar.getByRole("button", { name: "Approve", exact: true }).click();
  const result = page.getByTestId("decision-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText(/task/i);
  await expect(result.getByRole("link", { name: /T-\d+/ }).first()).toBeVisible();
  await expect(result.locator('a[href="/app/workflows"]').first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan decision" })).toHaveCount(0);
  await expect(page.getByTestId("consequence-panel")).toHaveCount(0);
  await expect(tracker.locator('[aria-current="step"]')).toContainText("In progress");
  await expect(page.getByTestId("case-timeline").locator('[data-testid="event-row"][data-event-type="approved"]')).toBeVisible();
  await noOrphanMetrics(page);
  await shot(page, "04-approved");

  expect(errors, "console errors on the case file").toEqual([]);
});

test("QA-routed case shows the route-only line in the consequence panel", async ({ page, request }) => {
  const list = (await (await request.get(`${ENGINE}/incidents`)).json()).items as { id: string; regulatory_sensitive: boolean }[];
  const qa = list.find((i) => i.regulatory_sensitive);
  expect(qa, "a regulatory-sensitive incident exists").toBeTruthy();
  expect((await request.post(`${ENGINE}/incidents/${qa!.id}/investigate`)).ok()).toBeTruthy();
  await page.goto(`/app/incidents/${qa!.id}?tab=todo`, { waitUntil: "networkidle" });
  const panel = page.getByTestId("consequence-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("route-only")).toHaveText("Route-only: QA Head approves, a second QA reviewer confirms (four-eyes). STRATA gives no clinical advice.");
  await expect(page.getByTestId("expected-result")).toHaveText(/^(Last time \(INC-\d+|No basis yet — STRATA will record the result and learn from it\.)/);
  await shot(page, "05-qa-route-only");
});

test("region case shows the schematic region tiles", async ({ page, request }) => {
  const list = (await (await request.get(`${ENGINE}/incidents`)).json()).items as { id: string; scope: string; region: string }[];
  const reg = list.find((i) => i.scope === "region");
  test.skip(!reg, "no region-scope incident in this dataset");
  await page.goto(`/app/incidents/${reg!.id}`, { waitUntil: "networkidle" });
  const tiles = page.getByTestId("diagram-region");
  await expect(tiles).toBeVisible();
  await expect(tiles).toContainText(`Affected region`);
  await expect(tiles).toContainText(/Schematic tiles, not geographic/);
});

test("/app/cases/{id} redirects to the case file; approvals link into the What to do tab", async ({ page, request }) => {
  await page.goto(`/app/cases/${HERO}`, { waitUntil: "networkidle" });
  await expect(page).toHaveURL(new RegExp(`/app/incidents/${HERO}$`));

  expect((await request.post(`${ENGINE}/incidents/${HERO}/investigate`)).ok()).toBeTruthy();
  await page.goto("/app/approvals", { waitUntil: "networkidle" });
  await expect(page.getByTestId("page-template")).toBeVisible();
  const card = page.getByTestId("approval-card").filter({ hasText: HERO });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("category-chip")).toBeVisible();
  await expect(page.locator('[data-metric-group] [data-metric="approvals_waiting"]')).toBeVisible();
  await expect(page.locator('[data-metric-group] [data-metric="oldest_wait_hours"]')).toBeVisible();
  await noOrphanMetrics(page);
  await card.getByRole("link", { name: "Review the plan and decide" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/incidents/${HERO}\\?tab=todo`));
  await expect(page.getByRole("tab", { name: /^What to do/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("consequence-panel")).toBeVisible();

  await page.goto("/app/incidents", { waitUntil: "networkidle" });
  await expect(page.getByTestId("page-template")).toBeVisible();
  await expect(page.getByTestId("category-chip").first()).toBeVisible();
  await noOrphanMetrics(page);
  await shot(page, "06-list");
});
