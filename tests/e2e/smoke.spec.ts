import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { collectConsoleErrors, resetEngine } from "../shared/engine";

// Every route renders: no console errors, a page template with a question heading,
// no orphan metrics. Full-page screenshots go to tests/screens/after/. Accessibility lives in a11y.spec.ts.
const SCREENS = join(process.cwd(), "tests", "screens", "after");
mkdirSync(SCREENS, { recursive: true });

const PAGES: [string, string][] = [
  ["home", "/app"], ["briefing", "/app/briefing"], ["how-it-works", "/app/how-it-works"],
  ["problems", "/app/problems"], ["risks", "/app/risks"], ["health", "/app/health"], ["sources", "/app/sources"],
  ["opportunities", "/app/opportunities"], ["accounts", "/app/accounts"], ["account-4821", "/app/accounts/4821"],
  ["incidents", "/app/incidents"], ["incident-0001", "/app/incidents/INC-2026-0001"], ["memory", "/app/memory"],
  ["approvals", "/app/approvals"], ["workflows", "/app/workflows"], ["outcomes", "/app/outcomes"],
  ["time-to-action", "/app/time-to-action"], ["evaluation", "/app/evaluation"], ["audit", "/app/audit"],
  ["lab", "/app/lab"], ["notebook", "/app/notebook"], ["help", "/app/help"], ["help-decides", "/app/help/decides"],
  ["help-diagrams", "/app/help/diagrams"],
];

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => { await resetEngine(request); });
test.afterAll(async ({ request }) => { await resetEngine(request); });

test("landing", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "STRATA" })).toBeVisible();
  await expect(page.getByText("Arihant Chordia", { exact: false })).toBeVisible();
  await expect(page.getByText("Yogesh R Mehta", { exact: false })).toBeVisible();
  await expect(page.getByText("District 05", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: join(SCREENS, "landing.png"), fullPage: true });
  // starter -> how it works (loop diagram) -> game tutorial -> portals
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("diagram-loop")).toBeVisible();
  await page.getByRole("button", { name: "Play the tutorial" }).click();
  await expect(page.getByTestId("game-tutorial")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Company portal")).toBeVisible();
  await expect(page.getByText("User portal")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, path] of PAGES) {
  test(`page ${path}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByTestId("page-template")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first()).not.toBeEmpty();
    await expect(page.getByTestId("explain-button")).toBeVisible();
    const all = await page.locator("[data-metric]").count();
    const grouped = await page.locator("[data-metric-group] [data-metric]").count();
    expect(grouped, `orphan metrics on ${path}`).toBe(all);
    await page.waitForTimeout(800); // let charts finish their entry animation
    await page.screenshot({ path: join(SCREENS, `${name}.png`), fullPage: true });
    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}
