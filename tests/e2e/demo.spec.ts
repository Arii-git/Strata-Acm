import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ENGINE, collectConsoleErrors, resetEngine, setPersona } from "../shared/engine";

// The hero loop through the UI (docs/06_DEMO_AND_PITCH.md): Briefing -> Workbench -> Agent trace ->
// Memory -> Plan -> Approve -> Lab fast-forward -> Outcomes -> Audit.
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

test("hero loop: detect -> investigate -> plan -> approve -> advance -> outcome -> audit", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  // Briefing
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "What needs me today?" })).toBeVisible();
  await expect(page.getByText(/Good (morning|afternoon|evening), Operations Manager\./)).toBeVisible();
  await expect(page.getByText(HERO).first()).toBeVisible();
  await shot(page, "01-briefing");

  // Workbench
  await page.goto(`/app/incidents/${HERO}`, { waitUntil: "networkidle" });
  await expect(page.getByText(HERO).first()).toBeVisible();
  await page.getByRole("tab", { name: "Agent trace" }).click();
  await page.getByRole("button", { name: "Run investigation" }).click();
  const trace = page.getByRole("tabpanel").filter({ hasText: "Agent steps" });
  await expect(trace.getByText("Evidence-or-Silence validator passed")).toBeVisible();
  await expect(trace.getByText(/supplier/i).first()).toBeVisible();
  await page.waitForTimeout(1500); // step animation (180 ms/step)
  await shot(page, "02-agent-trace");

  // Memory
  await page.getByRole("tab", { name: "Memory" }).click();
  await expect(page.getByRole("tabpanel").filter({ hasText: "INC-017" }).getByText("INC-017").first()).toBeVisible();
  await shot(page, "03-memory");

  // Plan + drafts
  await page.getByRole("tab", { name: /^Plan/ }).click();
  const planPanel = page.getByRole("tabpanel").filter({ hasText: "Plan steps" });
  await expect(planPanel.getByText(/WhatsApp draft/).first()).toBeVisible();
  await expect(planPanel.getByText(/Simulated/).first()).toBeVisible();
  await shot(page, "04-plan");

  // Approve via the ApprovalBar
  const bar = page.getByRole("region", { name: "Plan decision" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan decision" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tasks created" })).toBeVisible();
  const tasksCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Tasks created" }) });
  await expect(tasksCard.getByRole("row").nth(1)).toBeVisible();
  await shot(page, "05-approved");

  // Lab fast-forward
  await page.goto("/app/lab", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Advance 14 simulated days" }).click();
  await expect(page.getByText("Scripted counterfactual, not a measured result.")).toBeVisible();
  await shot(page, "06-lab-advanced");

  // Outcomes
  await page.goto("/app/outcomes", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Did our actions work?" })).toBeVisible();
  await expect(page.getByRole("cell", { name: HERO }).or(page.getByText(HERO)).first()).toBeVisible();
  await expect(page.getByText(/illustrative/i).first()).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, "07-outcomes");

  // Audit chain
  await page.goto("/app/audit", { waitUntil: "networkidle" });
  await expect(page.getByText(/Hash chain verified/)).toBeVisible();
  await page.getByRole("button", { name: "Verify chain" }).click();
  await expect(page.getByText(/Hash chain verified \(\d+ rows\)/)).toBeVisible();
  await shot(page, "08-audit");

  expect(errors, "console errors during the hero loop").toEqual([]);
});

test("reject without a reason is impossible", async ({ page, request }) => {
  const r = await request.post(`${ENGINE}/incidents/${HERO}/investigate`);
  expect(r.ok()).toBeTruthy();
  await page.goto(`/app/incidents/${HERO}?tab=plan`, { waitUntil: "networkidle" });
  const bar = page.getByRole("region", { name: "Plan decision" });
  await bar.getByRole("button", { name: "Reject" }).click();
  const submit = bar.getByRole("button", { name: "Submit rejection" });
  await expect(submit).toBeDisabled();
  await bar.getByRole("textbox").last().fill("   ");
  await expect(submit).toBeDisabled();
  // Engine enforces it too.
  const plan = (await (await request.get(`${ENGINE}/incidents/${HERO}`)).json()).plan;
  const api = await request.post(`${ENGINE}/plans/${plan.id}/decision`, { data: { decision: "rejected", persona: "operations_manager", decided_by: "QA bot" } });
  expect(api.status()).toBe(400);
  await bar.getByRole("textbox").last().fill("Supplier already confirmed a new date");
  await expect(submit).toBeEnabled();
  await shot(page, "09-reject-needs-reason");
});

test("QA-routed incident cannot be approved by the Operations Manager", async ({ page, request }) => {
  const list = (await (await request.get(`${ENGINE}/incidents`)).json()).items as { id: string; regulatory_sensitive: boolean }[];
  const qa = list.find((i) => i.regulatory_sensitive);
  expect(qa, "a regulatory-sensitive incident exists").toBeTruthy();
  const r = await request.post(`${ENGINE}/incidents/${qa!.id}/investigate`);
  expect(r.ok()).toBeTruthy();

  await page.goto(`/app/incidents/${qa!.id}?tab=plan`, { waitUntil: "networkidle" });
  await expect(page.getByText("Route-only: QA Head + four-eyes.", { exact: false })).toBeVisible();
  const bar = page.getByRole("region", { name: "Plan decision" });
  await expect(bar.getByText(/Requires QA Head \+ four-eyes/)).toBeVisible();
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar.getByRole("alert")).toContainText(/cannot decide|QA Head/i);
  await expect(page.getByRole("region", { name: "Plan decision" })).toBeVisible(); // still awaiting
  await shot(page, "10-qa-route-denied");
});
