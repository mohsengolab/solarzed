import { defineConfig } from "@playwright/test";

// A standalone public-site check: no database, SMS or admin mutations.
export default defineConfig({
  testDir: "./tests",
  testMatch: "i18n.spec.ts",
  outputDir: "test-results/i18n",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3107",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/i18n-catalog.mjs",
      url: "http://localhost:5107/api/catalog",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node node_modules/next/dist/bin/next dev --port 3107",
      url: "http://localhost:3107/contact",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_DIST_DIR: ".next-i18n",
        SOLARZED_API_INTERNAL_URL: "http://localhost:5107",
        BACKEND_URL: "http://localhost:5107",
        NEXT_PUBLIC_API_URL: "",
      },
    },
  ],
});
