import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]],
  use: {
    ...devices["iPhone 13"],
    baseURL: "http://127.0.0.1:5180",
    browserName: "chromium",
    screenshot: "only-on-failure",
    storageState: { cookies: [], origins: [] },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:5180/plan",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
