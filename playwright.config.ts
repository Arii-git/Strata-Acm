import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./tests/shared/engine";

// QA lane e2e config. The engine (127.0.0.1:8000) and Next.js dev server (localhost:3000)
// are expected to be running already; webServer only starts `npm run dev` if they are not.
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "tests/e2e/.results/artifacts",
  globalSetup: "./tests/shared/global-setup.ts",
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:3000",
    storageState: STORAGE_STATE, // signed in as the Renalis operations manager (tests/shared/global-setup.ts)
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
