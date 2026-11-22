import { test, expect } from "@playwright/test";

test("product lifecycle and inventory QC through the real admin interface", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // window.confirm is used for deletions; accept every one of them.
  page.on("dialog", dialog => dialog.accept());
  const api = "http://localhost:5100";
  expect((await request.get(`${api}/api/admin/products`)).status()).toBe(401);
  await page.goto("/admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("local-browser-tests-only");
  await page.getByRole("button", { name: "ورود ↗", exact: true }).click();
  await page.getByRole("button", { name: "محصولات", exact: true }).click();
  // The product code is a numeric item code entered by the admin.
  const code = String(Date.now()).slice(-12);   // numeric item code
  await page.getByLabel("کد محصول (فقط عدد)", { exact: true }).fill(code);
  await page.getByLabel("نام محصول", { exact: true }).fill(`محصول آزمایش مرورگر ${Date.now()}`);
  await page.getByLabel("سری", { exact: true }).fill("Test series");
  await page.getByRole("button", { name: "ذخیره محصول", exact: true }).click();
  await expect(page.getByText("محصول ذخیره شد.", { exact: true })).toBeVisible();
  // The product is published to the public catalog immediately.
  const catalog = await request.get(`${api}/api/catalog`);
  expect((await catalog.json()).some((p: { code: string }) => p.code === code)).toBe(true);

  // ── Receive a roll for it, inspect and release it ──
  await page.getByRole("button", { name: "رول‌ها", exact: true }).click();
  // Product group first, then the film model printed on the carton.
  await page.getByLabel("گروه محصول").selectOption("tint");
  await page.getByLabel("مدل فیلم (روی کارتن)").selectOption(code);
  const batch = `B-${Date.now()}`;
  await page.getByLabel("بچ", { exact: true }).fill(batch);
  await page.getByLabel("کد تأمین‌کننده / کارخانه (۳ حرف انگلیسی)", { exact: true }).fill("TST");
  await page.getByLabel("عرض رول (سانتی‌متر)", { exact: true }).fill("152");
  await page.getByLabel("طول رول (متر)", { exact: true }).fill("30");
  await page.getByRole("button", { name: "ساخت شناسه رول ↗", exact: true }).click();
  await expect(page.getByText("رول‌ها ساخته شدند.", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: batch });
  // A QR of the roll ID is drawn right next to every listed roll.
  await expect(row.getByRole("img").first()).toBeVisible();
  await row.getByRole("button", { name: "مدیریت", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "مدیریت موجودی" });
  // getByLabel on a <label> wrapping a <select> sees the option text too, so selects must match non-exactly.
  await dialog.getByLabel("وضعیت انبار").selectOption("shipped");
  await dialog.getByRole("button", { name: "ذخیره موجودی", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("QC approval is required before release.");
  await dialog.getByLabel("کنترل کیفیت").selectOption("approved");
  // Editing also updates batch, supplier and the physical dimensions.
  const batch2 = `B2-${Date.now()}`;
  await dialog.getByLabel("بچ", { exact: true }).fill(batch2);
  await dialog.getByLabel("عرض (سانتی‌متر)", { exact: true }).fill("76");
  await dialog.getByLabel("یادداشت تغییر", { exact: true }).fill("بررسی کیفیت مرورگر");
  await dialog.getByRole("button", { name: "ذخیره موجودی", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("موجودی به‌روزرسانی شد.", { exact: true })).toBeVisible();
  const editedRow = page.getByRole("row").filter({ hasText: batch2 });
  await expect(editedRow).toContainText("ارسال شده");
  await expect(editedRow).toContainText("76 × 30");
  await editedRow.getByRole("button", { name: "مدیریت", exact: true }).click();
  await expect(dialog).toContainText("بررسی کیفیت مرورگر");
  await dialog.getByRole("button", { name: "بستن موجودی", exact: true }).click();
  await expect(dialog).toBeHidden();

  // ── Products can only be renamed; delete replaces the old archive flow ──
  await page.getByRole("button", { name: "محصولات", exact: true }).click();
  await page.getByRole("button", { name: `ویرایش ${code}`, exact: true }).click();
  // Only the name is editable: type, series and description are disabled in edit mode.
  await expect(page.getByLabel("نوع محصول")).toBeDisabled();
  await expect(page.getByLabel("سری", { exact: true })).toBeDisabled();
  const renamed = `محصول آزمایش مرورگر ۲ ${Date.now()}`;
  await page.getByLabel("نام محصول", { exact: true }).fill(renamed);
  await page.getByRole("button", { name: "ذخیره محصول", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: code })).toContainText(renamed);
  // Deleting is blocked while a roll still references the model code.
  await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText("This product has rolls in inventory; delete or void its rolls first.", { exact: true })).toBeVisible();
  // Delete the roll, then the product deletes and the code is free again.
  await page.getByRole("button", { name: "رول‌ها", exact: true }).click();
  await page.getByRole("row").filter({ hasText: batch2 }).getByRole("button", { name: "مدیریت", exact: true }).click();
  await dialog.getByRole("button", { name: "حذف رول", exact: true }).click();
  await expect(page.getByText("رول حذف شد.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "محصولات", exact: true }).click();
  await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText("محصول حذف شد.", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0);
  const afterDelete = await request.get(`${api}/api/catalog`);
  expect((await afterDelete.json()).some((p: { code: string }) => p.code === code)).toBe(false);
  await page.getByLabel("کد محصول (فقط عدد)", { exact: true }).fill(code);
  await page.getByLabel("نام محصول", { exact: true }).fill(renamed);
  await page.getByRole("button", { name: "ذخیره محصول", exact: true }).click();
  await expect(page.getByText("محصول ذخیره شد.", { exact: true })).toBeVisible();
  // Clean up the re-created product so repeated runs stay small.
  await page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText("محصول حذف شد.", { exact: true })).toBeVisible();

  // ── Server-side filters: QC + batch narrow the inventory; a contradicting status empties it ──
  await page.getByRole("button", { name: "رول‌ها", exact: true }).click();
  await page.getByRole("search").getByLabel("بچ شامل", { exact: true }).fill(batch2);
  await page.getByRole("search").getByLabel("فیلتر QC").selectOption("approved");
  await expect(page.getByRole("row").filter({ hasText: batch2 })).toHaveCount(0);
  await page.getByRole("search").getByLabel("فیلتر وضعیت انبار").selectOption("void");
  await expect(page.getByText("رولی با این فیلترها یافت نشد.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "پاک کردن فیلترها", exact: true }).click();
  await page.getByRole("button", { name: "گارانتی‌ها", exact: true }).click();
  await page.getByRole("search").getByLabel("جستجوی گارانتی", { exact: true }).fill(`no-such-${Date.now()}`);
  await expect(page.getByText("گارانتی‌ای با این فیلترها یافت نشد.", { exact: true })).toBeVisible();
  // The session survives a reload (HttpOnly cookie) and the hash keeps the section.
  await page.reload();
  await expect(page.getByRole("heading", { name: "ثبت‌ها", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "پیامک", exact: true }).click();
  await expect(page.getByRole("heading", { name: "درگاه پیامک", exact: true })).toBeVisible();
  await expect(page.getByLabel("اعتبار کد (دقیقه)", { exact: true })).toHaveValue(/\d+/);
  // The seeded admin is promoted to super administrator: customers and users are visible.
  await page.getByRole("button", { name: "مشتریان", exact: true }).click();
  await expect(page.getByRole("heading", { name: "مشتریان و خودروها", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "کاربران", exact: true }).click();
  await expect(page.getByRole("heading", { name: "مدیریت کاربران", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "حساب کاربری", exact: true }).click();
  await expect(page.getByLabel("رمز عبور فعلی", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
