import { test, expect } from "@playwright/test";

test("warranty claim workflow and change log through the admin interface", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const api = "http://localhost:5100";
  expect((await request.get(`${api}/api/admin/claims`)).status()).toBe(401);
  expect((await request.get(`${api}/api/admin/audit`)).status()).toBe(401);

  // A registered warranty to claim against (public registration form).
  const stamp = Date.now().toString();
  const reg = await request.post(`${api}/api/registrations`, { data: {
    type: "tint", make: "Toyota", model: "Camry", owner: "Claim Browser Test", phone: "0912" + stamp.slice(-7), plate: "12B" + stamp.slice(-3),
    vin: "1HGCM82633A" + stamp.slice(-6), filmSerial: `QA-SERIAL-${stamp}`, invoiceNumber: `INV-${stamp}`, installed: "2026-01-10",
    sellerName: "QA Seller", sellerPhone: "09120000001", installer: "QA Installer", windows: ["rear"],
  } });
  expect(reg.status()).toBe(200);
  const code: string = (await reg.json()).code;

  await page.goto("/admin");
  await page.getByLabel("نام کاربری", { exact: true }).or(page.getByLabel("Username", { exact: true })).fill("admin");
  await page.locator("#pw").fill("local-browser-tests-only");
  await page.locator("form button[type=submit]").click();

  await page.getByRole("button", { name: "ادعاها", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ادعاهای گارانتی" })).toBeVisible();
  await page.getByRole("button", { name: "ادعای جدید" }).click();
  await page.getByLabel("کد گارانتی").fill(code);
  await page.getByLabel("شرح مشکل (حداقل ۱۰ نویسه)").fill("Bubbles along the rear window edge after two months.");
  await page.getByRole("button", { name: "ثبت و صدور شماره پیگیری" }).click();

  const dialog = page.getByRole("dialog", { name: "پرونده ادعا" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(code);
  await expect(dialog).toContainText("QA Installer");

  // Rejecting without a determined cause and documented reason is refused.
  await dialog.getByLabel("تصمیم", { exact: true }).selectOption("rejected");
  await dialog.getByRole("button", { name: "ذخیره پرونده" }).click();
  await expect(dialog.getByRole("status")).toContainText("Determine the cause");

  // Move through the stages, accept for a film defect, then close with the remedy and its costs.
  await dialog.getByLabel("تصمیم", { exact: true }).selectOption("none");
  await dialog.getByLabel("مرحله", { exact: true }).selectOption("technicalAssessment");
  await dialog.getByRole("button", { name: "ذخیره پرونده" }).click();
  await expect(dialog.getByRole("status")).toHaveText("ذخیره شد.");
  await dialog.getByLabel("علت عیب", { exact: true }).selectOption("film");
  await dialog.getByLabel("تصمیم", { exact: true }).selectOption("accepted");
  await dialog.getByLabel("مرحله", { exact: true }).selectOption("closed");
  await dialog.getByLabel("راهکار", { exact: true }).selectOption("replaceFilm");
  await dialog.getByLabel("هزینه نیروی کار", { exact: true }).fill("1500000");
  await dialog.getByRole("button", { name: "ذخیره پرونده" }).click();
  await expect(dialog.getByRole("status")).toHaveText("ذخیره شد.");
  await expect(dialog).toContainText("بسته");
  await expect(dialog.getByText("تغییر مرحله").first()).toBeVisible();

  // Reopening needs a reason, which is kept in the change log.
  await dialog.getByLabel("مرحله", { exact: true }).selectOption("technicalAssessment");
  await dialog.getByLabel("تصمیم", { exact: true }).selectOption("needsMoreReview");
  await dialog.getByLabel("راهکار", { exact: true }).selectOption("none");
  await dialog.getByRole("button", { name: "ذخیره پرونده" }).click();
  await expect(dialog.getByRole("status")).toContainText("requires a reason");
  await dialog.getByLabel(/دلیل این تغییر/).fill("Customer reported the issue returned");
  await dialog.getByRole("button", { name: "ذخیره پرونده" }).click();
  await expect(dialog.getByRole("status")).toHaveText("ذخیره شد.");
  await expect(dialog).toContainText("دلیل: Customer reported the issue returned");
  await dialog.getByRole("button", { name: "بستن" }).click();

  // The warranty decision is logged, and the warranty dialog shows its claims and history.
  await page.getByRole("button", { name: "گارانتی‌ها", exact: true }).click();
  await page.getByRole("button", { name: "همه", exact: true }).click();
  await page.getByRole("search").getByLabel("جستجوی گارانتی").fill(code);
  await page.getByRole("row").filter({ hasText: code }).click();
  const wDialog = page.getByRole("dialog", { name: "تصمیم گارانتی" });
  await wDialog.getByRole("button", { name: "ذخیره تصمیم" }).click();
  await page.getByRole("row").filter({ hasText: code }).click();
  await expect(wDialog).toContainText("ادعاهای این گارانتی");
  await expect(wDialog).toContainText("تصمیم گارانتی");
  await expect(wDialog.getByRole("row")).toHaveCount(2);
  await wDialog.getByRole("button", { name: "بستن" }).click();

  await page.getByRole("button", { name: "سابقه تغییرات", exact: true }).click();
  await page.getByRole("search").getByLabel("جستجو").fill(code);
  await expect(page.getByRole("row").filter({ hasText: "ثبت ادعا" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "ثبت فرم عمومی" })).toHaveCount(1);

  await page.getByRole("button", { name: "نمای کلی", exact: true }).click();
  await expect(page.getByText("ادعاهای باز")).toBeVisible();
  expect(errors).toEqual([]);
});
