import { defineConfig, devices } from "@playwright/test";

const explorerPort = process.env.LABKIT_PORT_EXPLORER ?? "8850";
const dbPort = process.env.LABKIT_PORT_DB ?? "5433";
const ui = `http://127.0.0.1:${explorerPort}`;

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  use: {
    baseURL: ui,
  },
  webServer: [
    {
      command: "bunx vite --host 127.0.0.1",
      url: `${ui}/healthz`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        LABKIT_DB_URL:
          process.env.LABKIT_DB_URL ?? `postgresql://postgres:agens@127.0.0.1:${dbPort}/labkit`,
        LABKIT_TENANT: process.env.LABKIT_TENANT ?? "overlap-bench",
        LABKIT_PORT_DB: dbPort,
        LABKIT_PORT_EXPLORER: explorerPort,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
