import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "../shared/engine";

// Lane L6 (A24): glossary, "How STRATA decides" and the Explain drawer. Read-only: no engine state is changed.

test.describe("help and glossary", () => {
  test("glossary lists at least 40 entries and search filters them", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/app/help");
    const glossary = page.getByTestId("glossary");
    await expect(glossary).toBeVisible();
    // metrics arrive from /metrics/dictionary; wait for a metric anchor before counting
    await expect(page.locator("#metric-risk_score")).toBeVisible();
    const entries = glossary.getByTestId("glossary-entry");
    const total = await entries.count();
    expect(total).toBeGreaterThanOrEqual(40);
    await expect(page.locator("#term-baseline")).toBeVisible();
    await expect(page.locator("#category-supply")).toBeVisible();
    await expect(page.locator("#stage-detected")).toBeVisible();

    await page.getByTestId("glossary-search").fill("fill rate");
    await expect.poll(async () => entries.count()).toBeLessThan(total);
    const filtered = await entries.count();
    expect(filtered).toBeGreaterThan(0);
    for (let i = 0; i < filtered; i++) await expect(entries.nth(i)).toContainText(/fill rate/i);
    await expect(page.getByTestId("glossary-count")).toContainText(`${filtered} of ${total}`);

    await page.getByTestId("glossary-search").fill("");
    await expect.poll(async () => entries.count()).toBe(total);
    expect(errors).toEqual([]);
  });

  test("glossary links to How STRATA decides and the diagram gallery", async ({ page }) => {
    await page.goto("/app/help");
    await page.getByRole("link", { name: "How STRATA decides" }).first().click();
    await expect(page).toHaveURL(/\/app\/help\/decides$/);
    await page.goto("/app/help");
    await page.getByRole("link", { name: "Diagram gallery" }).first().click();
    await expect(page).toHaveURL(/\/app\/help\/diagrams$/);
  });

  test("decides page shows the noisy-OR diagram with the hero case worked example", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/app/help/decides");
    const diagram = page.getByTestId("diagram-noisy-or");
    await expect(diagram).toBeVisible();
    await expect(diagram.locator("svg[role=img]")).toBeVisible();
    await expect(diagram.locator("figcaption")).toContainText("INC-2026-0001");
    await expect(page.getByTestId("takeaway")).toContainText(/warning signals from \d+ systems/);
    // text alternative exists and lists each witness
    await diagram.getByText("Text version of this diagram").click();
    await expect(diagram.locator("details li").first()).toContainText("p =");
    expect(errors).toEqual([]);
  });

  for (const path of ["/app/help", "/app/help/decides", "/app/help/diagrams"]) {
    test(`Explain button opens a drawer with "What this page is" on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.getByTestId("explain-button").click();
      const drawer = page.getByTestId("explain-drawer");
      await expect(drawer).toBeVisible();
      const what = drawer.locator("section").filter({ hasText: "What this page is" }).locator("p");
      await expect(what).toBeVisible();
      expect(((await what.textContent()) ?? "").trim().length).toBeGreaterThan(20);
      await page.keyboard.press("Escape");
    });
  }

  test("diagram gallery renders the noisy-OR diagram once", async ({ page }) => {
    await page.goto("/app/help/diagrams");
    await expect(page.getByTestId("diagram-noisy-or")).toHaveCount(1);
    await expect(page.getByTestId("diagram-noisy-or")).toBeVisible();
  });
});
