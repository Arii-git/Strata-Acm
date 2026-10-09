import type { APIRequestContext, Page } from "@playwright/test";

export const ENGINE = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";

export async function resetEngine(request: APIRequestContext): Promise<void> {
  const r = await request.post(`${ENGINE}/lab/reset`);
  if (!r.ok()) throw new Error(`POST /lab/reset failed: ${r.status()} ${await r.text()}`);
}

/** Set the persona the UI reads from localStorage before any page script runs. */
export async function setPersona(page: Page, persona: string): Promise<void> {
  await page.addInitScript((p) => {
    try { window.localStorage.setItem("strata.persona", p); } catch { /* ignore */ }
  }, persona);
}

/** Collects console errors and uncaught page errors. Dev-only noise is filtered. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const ignore = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (ignore.some((r) => r.test(t))) return;
    errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}
