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
  // Rolls can only be received for a film model defined in Products (409 = left over from an earlier run).
  const product = await request.post(`${api}/api/admin/products`, { headers, data: { code: "990001", name: "QR E2E film 990001", type: "tint", archived: false } });
  expect([200, 409], await product.text()).toContain(product.status());
  const suffix = Date.now().toString(36).toUpperCase();
  const received = await request.post(`${api}/api/admin/rolls`, { headers, data: { modelCode: "990001", type: "tint", batch: `QR-${suffix}`, supplier: "ABC", qc: "approved", quantity: 1, lengthM: 150 } });
  expect(received.ok()).toBeTruthy();
  const [roll] = await received.json();
  await context.addInitScript(() => { window.print = () => {}; });
  await page.goto("/admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("local-browser-tests-only");
  await page.getByRole("button", { name: "ورود ↗" }).click();
  await page.getByRole("button", { name: "برچسب‌ها", exact: true }).click();
  await page.getByLabel("رول محصول").selectOption(roll.id);
  await expect(page.getByText(/کد کارخانه \(از تأمین‌کنندهٔ رول\)/)).toContainText("ABC");
  // Excel upload reads the "Roll No" column (shared, rich-text, inline and numeric cells) and flags invalid cells.
  const issueForm = page.locator("form").filter({ hasText: "ساخت برچسب برای کارتن‌ها" });
  await issueForm.locator('input[type="file"]').setInputFiles("tests/fixtures/roll-nos.xlsx");
  await expect(issueForm.getByText("۴ کارتن", { exact: true })).toBeVisible();
  for (const serial of ["XLSX-A-0001", "XLSX-B-0002", "XLSX-C-0003", "30614377"]) await expect(issueForm.getByText(serial, { exact: true })).toBeVisible();
  await expect(issueForm.getByRole("alert")).toContainText("BAD/ROLL");
  await issueForm.getByRole("button", { name: "پاک کردن همه" }).click();
  const rollNo = page.getByRole("textbox", { name: /Roll No کارتن‌ها/ });
  await rollNo.fill(`CPT-${suffix}-1`); await rollNo.press("Enter");   // a barcode scanner types and presses Enter
  await rollNo.fill(`CPT-${suffix}-2`); await rollNo.press("Enter");
  await expect(page.getByText("۲ کارتن", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ساخت برچسب و کارت گارانتی" }).click();
  const qrs = page.getByRole("img", { name: /^QR CPT-/ });
  await expect(qrs).toHaveCount(2);
  const print = page.getByRole("button", { name: /چاپ کارت گارانتی داخل کارتن/ });
  await expect(print).toBeEnabled();
  const pixels = await qrs.first().evaluate(image => {
    const img = image as HTMLImageElement;
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(decoded).not.toBeNull();
  expect(decoded!.data).toMatch(/^https:\/\/solarzed\.com\/activate#CPT-[A-Z0-9]+-[12]-[1-9][0-9]{6}-ABC$/);
  const boxToken = new URL(decoded!.data).hash.slice(1);
  let metadata = await (await request.post(`${api}/api/activation/inspect`, { data: { token: boxToken } })).json();
  expect(metadata.activated).toBe(false);
  expect(metadata.released).toBe(false);
  expect(metadata.remainingLengthM).toBe(150);
  expect(metadata.factoryCode).toBeNull();
  expect(metadata.phone).toBeUndefined();
  expect(metadata.owner).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath("box-labels-admin.png"), fullPage: true });
  const popupPromise = page.waitForEvent("popup");
  await print.click();
  const popup = await popupPromise;
  await expect(popup.locator(".label")).toHaveCount(2);
  expect(await popup.locator("style").textContent()).toContain("size:80mm 50mm");
  await popup.setViewportSize({ width: 650, height: 500 });
  await popup.screenshot({ path: testInfo.outputPath("box-labels-print.png") });
  await popup.close();
  const release = page.getByRole("button", { name: /علامت‌گذاری رول به‌عنوان ارسال‌شده/ });
  await release.click();
  await expect(release).toBeHidden();
  metadata = await (await request.post(`${api}/api/activation/inspect`, { data: { token: boxToken } })).json();
  expect(metadata.released).toBe(true);

  // Browser form behavior is tested with explicit simulated provider responses.
  // Real OTP/DB verification is covered by BoxLabelTests, without sending SMS.
  await page.route("**/api/activation/inspect", route => route.fulfill({ json: { ...metadata, smsAvailable: true } }));
  await page.route("**/api/portal/me", route => route.fulfill({ json: { user: null } }));
  await page.route("**/api/portal/otp", async route => {
    expect(route.request().postDataJSON().phone).toBe("09121111111");
    await route.fulfill({ json: { challengeId: "browser-test-only", expiresAt: new Date(Date.now() + 300000).toISOString(), retryAfterSeconds: 60 } });
  });
  await page.route("**/api/portal/login", async route => {
    if (route.request().postDataJSON().code !== "123456") { await route.fulfill({ status: 400, json: { error: "The verification code is incorrect." } }); return; }
    await route.fulfill({ json: { phone: "09121111111" } });
  });
  await page.route("**/api/activation/complete", async route => {
    const body = route.request().postDataJSON();
    expect(body.token).toBe(boxToken);
    expect(body.registration.phone).toBe("09121111111");
    expect(body.usedLengthM).toBe(30);
    await route.fulfill({ json: { remainingLengthM: 120, warranty: { code: "SZ-browser-test-only", type: "tint", make: "Toyota", model: "Camry", usedLengthM: 30, status: "active", coverage: { filmEnds: "2031-01-14", installEnds: "2028-01-14" } } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/activate#${boxToken}`);
  await page.getByLabel("Mobile number", { exact: true }).fill("09121111111");
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Verification code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  for (const [name, value] of [["Full name", "Test Customer"], ["Vehicle make", "Toyota"], ["Vehicle model", "Camry"], ["VIN (17 characters)", "JTDBE32K123456789"], ["Licence plate", "TEST123"], ["Installation date", "2026-01-15"], ["Invoice number", "QR-INV"], ["Installer / shop", "Test shop"], ["Seller name", "Test Seller"], ["Seller mobile", "09122222222"], ["Film used on this vehicle (meters)", "30"]]) {
    await page.getByLabel(name, { exact: true }).fill(value);
  }
  await page.getByRole("checkbox", { name: "rear", exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath("activation-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Check & register warranty" }).click();
  await expect(page.getByRole("heading", { name: "Your warranty is active" })).toBeVisible();
  await expect(page.getByText("2031-01-14", { exact: true })).toBeVisible();
  await expect(page.getByText("120 m", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Register another vehicle" }).click();
  await expect(page.getByLabel("VIN (17 characters)")).toHaveValue("");
  await expect(page.getByLabel("Film used on this vehicle (meters)")).toHaveAttribute("max", "120");
});
