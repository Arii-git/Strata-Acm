import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors } from "../shared/engine";

// Lane A (review 1): calm Home, briefing only on click, clickable loop diagram, guided path (A23), nav.

/** Force the A23 flag on or off in /health so the guided-path tests do not depend on the engine's flag defaults. */
async function setA23(page: Page, on: boolean) {
  await page.route("**/api/engine/health", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const f: string[] = (json.features ?? []).filter((x: string) => x !== "A23");
    json.features = on ? [...f, "A23"] : f;
    await route.fulfill({ response: res, json });
  });
}

test.describe.configure({ mode: "serial" });

test("Home leads with today's numbers, then the briefing is one click away", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByTestId("home-welcome")).toContainText(/Overnight I checked/);
  // the summaries the owner asked for: yesterday, last 7 days, pipeline, trends, numbers, what you missed
  for (const id of ["Yesterday", "Last 7 days", "Look what you missed"]) {
    await expect(page.getByRole("heading", { name: id }).first()).toBeVisible();
  }
  await page.getByTestId("show-briefing").click();
  await expect(page).toHaveURL(/\/app\/briefing$/);
  await expect(page.getByTestId("briefing-priorities").or(page.getByText("Nothing needs you today"))).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Home has no role picker and no loop diagram (role comes from login; the loop lives in How it works)", async ({ page }) => {
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByTestId("persona-picker")).toHaveCount(0);
  await expect(page.getByTestId("diagram-loop")).toHaveCount(0);
  await expect(page.getByTestId("run-simulation")).toBeVisible();
});

test("guided path: start, Next x5 to step 6, exit", async ({ page }) => {
  await setA23(page, true);
  await page.goto("/app", { waitUntil: "networkidle" });
  await page.getByTestId("start-guided").click();
  const bar = page.getByTestId("guided-bar");
  await expect(bar).toBeVisible();
  await expect(page.getByTestId("guided-step")).toHaveText("Step 1 of 6");
  await expect(page).toHaveURL(/\/app\/incidents\/[^/?]+\?tab=happened/);

  for (let n = 2; n <= 6; n++) {
    await page.getByTestId("guided-next").click();
    await expect(page.getByTestId("guided-step")).toHaveText(`Step ${n} of 6`);
  }
  await expect(page).toHaveURL(/\/app\/outcomes$/);
  await expect(bar.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");

  // survives a reload (state in localStorage)
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("guided-step")).toHaveText("Step 6 of 6");

  await page.getByTestId("guided-exit").click();
  await expect(page.getByTestId("guided-bar")).toHaveCount(0);
});

test("guided path button is hidden when A23 is off", async ({ page }) => {
  await setA23(page, false);
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByTestId("home-welcome")).toBeVisible();
  await expect(page.getByTestId("start-guided")).toHaveCount(0);
});

test("sidebar highlights Home vs Briefing and folds reviewer pages in Simple mode", async ({ page }) => {
  await page.goto("/app", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Pages" });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toContainText("Home");
  await page.goto("/app/briefing", { waitUntil: "networkidle" });
  await expect(nav.locator('[aria-current="page"]')).toContainText("Today's briefing");

  const reviewers = page.getByTestId("nav-group-reviewers");
  await expect(reviewers).toBeVisible();
  const toggle = reviewers.getByRole("button", { name: /For reviewers/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(reviewers.getByRole("link", { name: /Evaluation/ })).toBeHidden();
  await toggle.click();
  await expect(reviewers.getByRole("link", { name: /Evaluation/ })).toBeVisible();

  // g-shortcuts: g g = Home, g b = briefing
  await page.locator("#main").focus();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.keyboard.press("g");
  await page.keyboard.press("b");
  await expect(page).toHaveURL(/\/app\/briefing$/);
});

test("Ctrl K palette lists every page with a hint", async ({ page }) => {
  await page.goto("/app", { waitUntil: "networkidle" });
  await page.locator("#main").focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(20);
  await page.keyboard.type("approval");
  await expect(dialog.getByRole("option").first()).toContainText("Approvals");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/approvals$/);
});
