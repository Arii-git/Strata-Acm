import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ENGINE, collectConsoleErrors, resetEngine, setPersona } from "../shared/engine";

// The demo journey after review 1 (docs/REVIEW_FEEDBACK_1.md):
// Landing -> Home (no numbers, no news) -> briefing only on click -> case file -> Why (investigate) ->
// What to do (consequence panel) -> Approve -> Lab fast-forward -> Outcomes (illustrative) -> case Learned -> Audit.
const SCREENS = join(process.cwd(), "tests", "screens");
mkdirSync(SCREENS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SCREENS, `demo-${name}.png`), fullPage: true });

const HERO = "INC-2026-0001";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request, page }) => {
  await resetEngine(request);
  await setPersona(page, "operations_manager");
});

test.afterAll(async ({ request }) => { await resetEngine(request); });

test("demo journey: home -> briefing on click -> case -> approve -> outcome -> learned -> audit", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  // Home (signed in): today's numbers first, then the briefing one click away
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByTestId("home-welcome")).toContainText(/Overnight I checked/);
  await shot(page, "01-home");

  await page.getByTestId("show-briefing").click();
  await expect(page).toHaveURL(/\/app\/briefing/);
  await expect(page.getByTestId("briefing-priorities")).toBeVisible();
  await shot(page, "02-briefing");

  // Case file: stage tracker + three tabs
  await page.goto(`/app/incidents/${HERO}`, { waitUntil: "networkidle" });
  const tracker = page.getByTestId("stage-tracker");
  await expect(tracker.locator('[aria-current="step"]')).toContainText("Detected");
  await expect(page.getByRole("tab")).toHaveCount(3);
  await shot(page, "03-case-detected");

  // Why: investigate
  await page.getByRole("tab", { name: "Why and what we did last time" }).click();
  await page.getByRole("button", { name: "Run investigation" }).click();
  await expect(page.getByRole("tabpanel").getByText(/supplier/i).first()).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("INC-017").first()).toBeVisible();
  await expect(tracker.locator('[aria-current="step"]')).toContainText("Awaiting approval");
  await shot(page, "04-case-why");

  // What to do: consequence panel, then approve
  await page.getByRole("tab", { name: /^What to do/ }).click();
  await expect(page.getByTestId("consequence-panel")).toBeVisible();
  await expect(page.getByTestId("expected-result")).toHaveText(/^(Last time \(INC-017|No basis yet)/);
  await expect(page.getByText(/Simulated/).first()).toBeVisible();
  await shot(page, "05-case-consequence");
  await page.getByRole("region", { name: "Plan decision" }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByTestId("decision-result")).toBeVisible();
  await expect(tracker.locator('[aria-current="step"]')).toContainText("In progress");
  await shot(page, "06-case-approved");

  // Lab fast-forward -> outcome (illustrative)
  await page.goto("/app/lab", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Advance 14 simulated days" }).click();
  await expect(page.getByText(/Scripted counterfactual, not a measured result/).first()).toBeVisible();
  await page.goto("/app/outcomes", { waitUntil: "networkidle" });
  await expect(page.getByText(HERO).first()).toBeVisible();
  await expect(page.getByText(/illustrative/i).first()).toBeVisible();
  await shot(page, "07-outcomes");

  // The case is now Learned, and the timeline shows the memory update
  await page.goto(`/app/incidents/${HERO}`, { waitUntil: "networkidle" });
  await expect(tracker.locator('[aria-current="step"]')).toContainText("Learned");
  await expect(page.getByTestId("case-timeline").locator('[data-event-type="memory_updated"]')).toBeVisible();
  await shot(page, "08-case-learned");

  // Audit chain
  await page.goto("/app/audit", { waitUntil: "networkidle" });
  await expect(page.getByText(/Hash chain verified/).first()).toBeVisible();
  await shot(page, "09-audit");

  expect(errors, "console errors during the demo journey").toEqual([]);
});

test("reject without a reason is impossible (UI and engine)", async ({ page, request }) => {
  expect((await request.post(`${ENGINE}/incidents/${HERO}/investigate`)).ok()).toBeTruthy();
  await page.goto(`/app/incidents/${HERO}?tab=todo`, { waitUntil: "networkidle" });
  const bar = page.getByRole("region", { name: "Plan decision" });
  await bar.getByRole("button", { name: "Reject", exact: true }).click();
  const submit = bar.getByRole("button", { name: "Submit rejection" });
  await expect(submit).toBeDisabled();
  await bar.getByRole("textbox").last().fill("   ");
  await expect(submit).toBeDisabled();
  const plan = (await (await request.get(`${ENGINE}/incidents/${HERO}`)).json()).plan;
  const api = await request.post(`${ENGINE}/plans/${plan.id}/decision`, { data: { decision: "rejected", persona: "operations_manager", decided_by: "QA bot" } });
  expect(api.status()).toBe(400);
  await bar.getByRole("textbox").last().fill("Supplier already confirmed a new date");
  await expect(submit).toBeEnabled();
});

test("QA-routed case cannot be approved by the Operations Manager", async ({ page, request }) => {
  const list = (await (await request.get(`${ENGINE}/incidents`)).json()).items as { id: string; regulatory_sensitive: boolean }[];
  const qa = list.find((i) => i.regulatory_sensitive);
  expect(qa, "a regulatory-sensitive incident exists").toBeTruthy();
  expect((await request.post(`${ENGINE}/incidents/${qa!.id}/investigate`)).ok()).toBeTruthy();
  await page.goto(`/app/incidents/${qa!.id}?tab=todo`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("route-only")).toBeVisible();
  const bar = page.getByRole("region", { name: "Plan decision" });
  await bar.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(bar.getByRole("alert")).toContainText(/cannot decide|QA Head/i);
  await expect(page.getByRole("region", { name: "Plan decision" })).toBeVisible();
});
