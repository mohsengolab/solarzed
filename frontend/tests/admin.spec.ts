import { test, expect } from "@playwright/test";

test("admin login, settings persistence, rolls and warranty decisions against real API", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const api = "http://localhost:5100";
  expect((await request.get(`${api}/api/admin/settings`)).status()).toBe(401);
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Admin password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "invalid password" })).toBeVisible();
  await page.getByLabel("Admin password").fill("local-browser-tests-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Warranty operations" })).toBeVisible();
  // The session cookie is HttpOnly and cookie-authenticated writes without the CSRF header are refused.
  expect(await page.evaluate(() => document.cookie)).not.toContain("sz_admin");
  const forged = await page.request.post(`${api}/api/admin/settings`, { data: { durations: {} } });
  expect(forged.status()).toBe(403);
  const headers = (await page.request.get(`${api}/api/admin/session`)).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cache-control"]).toContain("no-store");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save periods" })).toBeEnabled();
  await page.getByLabel("Tint – film warranty").selectOption("5");
  await page.getByLabel("Tint – installation warranty").selectOption("2");
  await page.getByLabel("PPF – film warranty").selectOption("7");
  await page.getByLabel("PPF – installation warranty").selectOption("3");
  await page.getByRole("button", { name: "Save periods" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Tint – film warranty")).toHaveValue("5");
  await expect(page.getByLabel("PPF – installation warranty")).toHaveValue("3");
  await page.screenshot({ path: testInfo.outputPath("admin-settings.png"), fullPage: true });

  await page.getByRole("button", { name: "Rolls", exact: true }).click();
  const batch = `E2E-${Date.now()}`;
  await page.getByLabel("Model code").fill("E2E");
  await page.getByLabel("Batch", { exact: true }).fill(batch);
  await page.getByLabel("Supplier code").fill("TEST");
  await page.getByRole("button", { name: "Create roll IDs" }).click();
  await expect(page.getByText("Rolls created.")).toBeVisible();
  await expect(page.getByRole("cell", { name: batch, exact: true })).toBeVisible();

  // Test data is confined to SolarzedBrowserTests, never the application database.
  const response = await request.post(`${api}/api/registrations`, { data: {
    type: "tint", make: "BrowserTest", model: "Camry", owner: "Test Owner",
    phone: "09120000000", plate: "E2E", vin: "JTDBE32K123456789",
    filmSerial: `E2E-${Date.now()}`, invoiceNumber: batch, installed: "2026-01-15",
    sellerName: "Test Seller", sellerPhone: "09120000001", installer: "Test Shop", windows: ["rear"],
  } });
  expect(response.ok()).toBeTruthy();
  const { code } = await response.json();
  await page.getByRole("button", { name: "Warranties", exact: true }).click();
  await page.getByRole("row").filter({ hasText: code }).click();
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByRole("heading", { name: `Decision — ${code}` })).toBeHidden();
  const lookup = await request.get(`${api}/api/registrations/${code}`);
  expect((await lookup.json()).coverage).toEqual({ filmEnds: "2031-01-14", installEnds: "2028-01-14" });
  await page.getByRole("button", { name: "active", exact: true }).click();
  await page.getByRole("row").filter({ hasText: code }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("rejected");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("rejection requires a note")).toBeVisible();
  await page.getByRole("dialog", { name: "Warranty decision" }).getByRole("textbox").fill("Browser test rejection");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByRole("heading", { name: `Decision — ${code}` })).toBeHidden();
  const rejected = await (await request.get(`${api}/api/registrations/${code}`)).json();
  expect(rejected.status).toBe("rejected");
  expect(rejected.coverage).toBeNull();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  expect(errors).toEqual([]);
});
