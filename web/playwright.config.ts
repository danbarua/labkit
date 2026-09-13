import { defineConfig, devices } from "@playwright/test";

const api = "http://127.0.0.1:8899";
const ui = "http://127.0.0.1:5173";

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
        LABKIT_DB_URL: "postgresql://postgres:agens@127.0.0.1:5432/labkit",
        LABKIT_TENANT: "overlap-bench",
        LABKIT_PORT_WEB: "8899",
        LABKIT_PORT_DB: "5432",
      },
    },
    {
      command: "bunx vite --host 127.0.0.1 --port 5173",
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
