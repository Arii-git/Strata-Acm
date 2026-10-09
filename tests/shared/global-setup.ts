import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { ENGINE, STORAGE_STATE, tokenFor } from "./engine";

/** The console needs a signed-in user. Sign in once as the default role and save it for every test. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = String(config.projects[0]?.use?.baseURL ?? "http://localhost:3000");
  const api = await request.newContext({ baseURL: ENGINE });
  const token = await tokenFor(api, "operations_manager");
  await api.dispose();
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  const ctx = await request.newContext({
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "strata.token", value: token }] }] },
  });
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
