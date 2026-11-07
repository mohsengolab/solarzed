import { test, expect } from "@playwright/test";
import jsQR from "jsqr";

test("warranty QR: admin prints a decodable code that opens the public warranty check", async ({ page, request, context }, testInfo) => {
  const api = "http://localhost:5100";
  const login = await request.post(`${api}/api/admin/login`, { data: { username: "admin", password: "local-browser-tests-only" } });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).token}` };
  await request.post(`${api}/api/admin/settings`, { headers, data: { durations: { tint: { film: 5, install: 2 }, ppf: { film: 7, install: 3 } } } });

  const unique = Date.now().toString(36).toUpperCase();
  const registered = await request.post(`${api}/api/warranty/register`, { data: {
    type: "tint", make: "Toyota", model: "Corolla", owner: "QR Test Owner", phone: "09121111111", plate: "QR-TEST",
    vin: "JTDBE32K123456789", filmSerial: `QR-SERIAL-${unique}`, invoiceNumber: `QR-INV-${unique}`, installed: "2026-01-15",
    sellerName: "QR Seller", sellerPhone: "09122222222", installer: "QR Shop", windows: ["left-front", "rear"],
  } });
  expect(registered.ok()).toBeTruthy();
  const { code } = await registered.json();
  const decision = await request.post(`${api}/api/admin/warranties/${code}/decision`, { headers, data: { status: "active", note: "QR browser test" } });
  expect(decision.ok()).toBeTruthy();

  await context.addInitScript(() => { window.print = () => {}; });
  await page.goto("/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Admin password").fill("local-browser-tests-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Warranties", exact: true }).click();
  await page.getByRole("button", { name: "active", exact: true }).click();
  await page.getByRole("checkbox", { name: `Select ${code} for QR printing` }).check();

  const qr = page.getByRole("img", { name: `QR for ${code}` });
  await expect(qr).toBeVisible();
  const pixels = await qr.evaluate(image => {
    const img = image as HTMLImageElement;
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(decoded?.data).toBe(`https://solarzed.com/warranty?code=${code}`);
  await expect(page.getByText("Film warranty until 2031-01-14")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("warranty-qr-admin.png"), fullPage: true });

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print warranty QR (1)" }).click();
  const popup = await popupPromise;
  await expect(popup.locator(".label")).toHaveCount(1);
  await expect(popup.locator(".label code")).toHaveText(code);
  expect(await popup.locator("style").textContent()).toContain("size:80mm 50mm");
  await popup.setViewportSize({ width: 650, height: 400 });
  await popup.screenshot({ path: testInfo.outputPath("warranty-qr-print.png") });
  await popup.close();

  // The decoded link resolves on the local copy of the public warranty check.
  await page.goto(`/warranty?code=${encodeURIComponent(code)}`);
  await expect(page.getByText(code).first()).toBeVisible();
});
