import { defineConfig, devices } from "@playwright/test";

// Port is parameterized via `PLAYWRIGHT_PORT` so parallel git worktrees
// of this repo can run E2E in isolation without colliding on the same
// Vite dev server. Default matches the historical 58850 binding.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 58850);
const BASE_URL = `http://localhost:${PORT}/app/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `pnpm exec vite --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
