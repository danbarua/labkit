import { defineConfig, devices } from "@playwright/test";

const dev = Number(process.env.E2E_PORT_DEV ?? 8950);
const built = Number(process.env.E2E_PORT_BUILT ?? 8951);
// The installed Chrome, so nothing has to be downloaded. `E2E_BROWSER_CHANNEL=chromium` uses
// Playwright's own build instead.
const channel = process.env.E2E_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "bun e2e/stack.ts",
    // The preview starts once the API and dev server are up, so this answering means all three are.
    url: `http://127.0.0.1:${built}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stderr: "pipe",
  },
  projects: [
    {
      name: "dev",
      use: { ...devices["Desktop Chrome"], channel, baseURL: `http://127.0.0.1:${dev}` },
    },
    {
      name: "built",
      use: { ...devices["Desktop Chrome"], channel, baseURL: `http://127.0.0.1:${built}` },
    },
  ],
});
