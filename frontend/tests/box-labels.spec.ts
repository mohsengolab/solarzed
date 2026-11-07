import { test, expect } from "@playwright/test";
import jsQR from "jsqr";

test("real QR generation and print dimensions, then customer activation form with simulated SMS", async ({ page, request, context }, testInfo) => {
  const api = "http://localhost:5100";
  const login = await request.post(`${api}/api/admin/login`, { data: { username: "admin", password: "local-browser-tests-only" } });
  expect(login.ok()).toBeTruthy();
  const { token: adminToken } = await login.json();
  const headers = { Authorization: `Bearer ${adminToken}` };
  expect((await request.get(`${api}/api/admin/box-labels`)).status()).toBe(401);
  await request.post(`${api}/api/admin/settings`, { headers, data: { durations: { tint: { film: 5, install: 2 }, ppf: { film: 7, install: 3 } } } });
  const received = await request.post(`${api}/api/admin/rolls`, { headers, data: { modelCode: "QRE2E", type: "tint", batch: `QR-${Date.now()}`, supplier: "TEST", qc: "approved", quantity: 1 } });
  expect(received.ok()).toBeTruthy();
  const [roll] = await received.json();
  await context.addInitScript(() => { window.print = () => {}; });
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Admin password").fill("local-browser-tests-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await page.getByLabel("Product roll").selectOption(roll.id);
  await page.getByLabel("Number of boxes").fill("2");
  await page.getByRole("button", { name: "Generate QR labels" }).click();
  const qrs = page.getByRole("img", { name: /^QR for SZB-/ });
  await expect(qrs).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Print selected labels (2)" })).toBeEnabled();
  const pixels = await qrs.first().evaluate(image => {
    const img = image as HTMLImageElement;
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(decoded).not.toBeNull();
  expect(decoded!.data).toMatch(/^https:\/\/solarzed\.com\/activate#[a-f0-9]{64}$/);
  const boxToken = new URL(decoded!.data).hash.slice(1);
  let metadata = await (await request.post(`${api}/api/activation/inspect`, { data: { token: boxToken } })).json();
  expect(metadata.activated).toBe(false);
  expect(metadata.released).toBe(false);
  expect(metadata.phone).toBeUndefined();
  expect(metadata.owner).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath("box-labels-admin.png"), fullPage: true });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print selected labels (2)" }).click();
  const popup = await popupPromise;
  await expect(popup.locator(".label")).toHaveCount(2);
  expect(await popup.locator("style").textContent()).toContain("size:80mm 50mm");
  await popup.setViewportSize({ width: 650, height: 500 });
  await popup.screenshot({ path: testInfo.outputPath("box-labels-print.png") });
  await popup.close();
  await page.getByRole("button", { name: "Mark roll as shipped" }).click();
  await expect(page.getByRole("button", { name: "Mark roll as shipped" })).toBeHidden();
  metadata = await (await request.post(`${api}/api/activation/inspect`, { data: { token: boxToken } })).json();
  expect(metadata.released).toBe(true);

  // Browser form behavior is tested with explicit simulated provider responses.
  // Real OTP/DB verification is covered by BoxLabelTests, without sending SMS.
  await page.route("**/api/activation/inspect", route => route.fulfill({ json: { ...metadata, smsAvailable: true } }));
  await page.route("**/api/activation/otp", async route => {
    expect(route.request().postDataJSON().phone).toBe("09121111111");
    await route.fulfill({ json: { challengeId: "browser-test-only", expiresAt: new Date(Date.now() + 300000).toISOString(), retryAfterSeconds: 60 } });
  });
  await page.route("**/api/activation/complete", async route => {
    const body = route.request().postDataJSON();
    if (body.otp !== "123456") { await route.fulfill({ status: 400, json: { error: "The verification code is incorrect." } }); return; }
    expect(body.token).toBe(boxToken);
    expect(body.registration.phone).toBe("09121111111");
    await route.fulfill({ json: { code: "SZ-browser-test-only", type: "tint", make: "Toyota", model: "Camry", status: "active", coverage: { filmEnds: "2031-01-14", installEnds: "2028-01-14" } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/activate#${boxToken}`);
  for (const [name, value] of [["Full name", "Test Customer"], ["Mobile number", "09121111111"], ["Vehicle make", "Toyota"], ["Vehicle model", "Camry"], ["VIN (17 characters)", "JTDBE32K123456789"], ["Licence plate", "TEST123"], ["Installation date", "2026-01-15"], ["Invoice number", "QR-INV"], ["Installer / shop", "Test shop"], ["Seller name", "Test Seller"], ["Seller mobile", "09122222222"]]) {
    await page.getByLabel(name, { exact: true }).fill(value);
  }
  await page.getByRole("checkbox", { name: "rear", exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath("activation-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Send verification code", exact: true }).click();
  await page.getByLabel("SMS verification code").fill("000000");
  await page.getByRole("button", { name: "Verify mobile & activate warranty" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await page.getByLabel("SMS verification code").fill("123456");
  await page.getByRole("button", { name: "Verify mobile & activate warranty" }).click();
  await expect(page.getByRole("heading", { name: "Your warranty is active" })).toBeVisible();
  await expect(page.getByText("2031-01-14", { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});
