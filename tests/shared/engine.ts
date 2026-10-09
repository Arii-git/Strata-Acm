import { join } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

export const ENGINE = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";
export const STORAGE_STATE = join(process.cwd(), "tests", "e2e", ".results", "auth-state.json");

/** Renalis demo users (config/demo_companies.yaml). Shared TEST password, local prototype only. */
const DEMO_EMAIL: Record<string, string> = {
  business_head: "business.head@demo.strata.local", operations_manager: "operations@demo.strata.local",
  account_manager: "accounts@demo.strata.local", sales_manager: "sales@demo.strata.local",
  support_manager: "support@demo.strata.local", qa_head: "qa@demo.strata.local",
};
const DEMO_PASSWORD = "Strata-Demo-2026";

/** Session token for a role's demo user, via the engine's login endpoint. */
export async function tokenFor(api: APIRequestContext, persona: string): Promise<string> {
  const email = DEMO_EMAIL[persona] ?? DEMO_EMAIL.operations_manager;
  const r = await api.post(`${ENGINE}/auth/login`, { data: { email, password: DEMO_PASSWORD } });
  if (!r.ok()) throw new Error(`demo login for ${persona} failed: ${r.status()} ${await r.text()}`);
  return (await r.json()).token as string;
}

export async function resetEngine(request: APIRequestContext): Promise<void> {
  const r = await request.post(`${ENGINE}/lab/reset`);
  if (!r.ok()) throw new Error(`POST /lab/reset failed: ${r.status()} ${await r.text()}`);
}

/** Sign in as the demo user of a role before any page script runs (the persona follows the signed-in role). */
export async function setPersona(page: Page, persona: string): Promise<void> {
  const token = await tokenFor(page.request, persona);
  await page.addInitScript((t) => {
    try { window.localStorage.setItem("strata.token", t); } catch { /* ignore */ }
  }, token);
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
