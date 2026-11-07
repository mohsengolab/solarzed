import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    actionTimeout: 30_000,
    trace: process.env.PLAYWRIGHT_TRACE ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "dotnet run --project ../backend/Solarzed.Api -c Release --no-launch-profile --no-restore --urls http://localhost:5100",
      url: "http://localhost:5100/api/admin/overview",
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        ConnectionStrings__Default: process.env.SOLARZED_TEST_DB_CONNECTION || "Server=(localdb)\\mssqllocaldb;Database=SolarzedBrowserTests;Trusted_Connection=True;",
        SOLARZED_ADMIN_PASSWORD: "local-browser-tests-only",
        FrontendOrigin: "http://localhost:3100",
        SOLARZED_REVALIDATE_SECRET: "browser-tests-revalidate-secret",
      },
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100/admin",
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: "http://localhost:5100", NEXT_DIST_DIR: ".next-e2e", SOLARZED_REVALIDATE_SECRET: "browser-tests-revalidate-secret" },
    },
  ],
});
