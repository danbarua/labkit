import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.LABKIT_PORT_WEB ?? "8899";
const uiPort = process.env.LABKIT_PORT_UI ?? "5173";
const dbPort = process.env.LABKIT_PORT_DB ?? "5432";
const api = `http://127.0.0.1:${apiPort}`;
const ui = `http://127.0.0.1:${uiPort}`;

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  use: {
    baseURL: ui,
  },
  webServer: [
    {
      command: "bun src/server/main.ts",
      url: `${api}/healthz`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        LABKIT_DB_URL:
          process.env.LABKIT_DB_URL ?? `postgresql://postgres:agens@127.0.0.1:${dbPort}/labkit`,
        LABKIT_TENANT: process.env.LABKIT_TENANT ?? "overlap-bench",
        LABKIT_PORT_WEB: apiPort,
        LABKIT_PORT_DB: dbPort,
        LABKIT_PORT_UI: uiPort,
      },
    },
    {
      command: "bunx vite --host 127.0.0.1",
      env: {
        LABKIT_PORT_WEB: apiPort,
        LABKIT_PORT_UI: uiPort,
      },
      url: ui,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
