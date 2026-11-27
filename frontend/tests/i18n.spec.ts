import { test, expect } from "@playwright/test";

const languages = {
  en: { name: "English", dir: "ltr", home: "/", products: "Products", contact: "Contact us", warranty: "WARRANTY INQUIRY", verify: "AUTHENTICITY CHECK" },
  fa: { name: "فارسی", dir: "rtl", home: "/fa", products: "محصولات", contact: "تماس با ما", warranty: "استعلام گارانتی", verify: "بررسی اصالت کالا" },
  ar: { name: "العربية", dir: "rtl", home: "/ar", products: "المنتجات", contact: "اتصل بنا", warranty: "الاستعلام عن الضمان", verify: "التحقق من الأصالة" },
} as const;

for (const [code, language] of Object.entries(languages)) {
  test(`${code}: public pages render and keep the saved language`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.addCookies([{ name: "sz-lang", value: code, url: "http://localhost:3107" }]);
    for (const [route, title] of [["/contact", language.contact], ["/warranty", language.warranty], ["/verify", language.verify], ["/coverage", null], ["/activate", null], ["/account", null], ["/card", null], ["/products", language.products]] as const) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", code);
      await expect(page.locator("html")).toHaveAttribute("dir", language.dir);
      await expect(page.getByRole("button", { name: language.name, exact: true })).toHaveAttribute("aria-pressed", "true");
      if (title) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${language.home === "/" ? "/" : language.home}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", code);
    await page.locator(".sv-header .sv-dropdown summary").first().click();
    await page.getByRole("link", { name: code === "fa" ? "مشاهده همه محصولات ←" : code === "ar" ? "عرض جميع المنتجات ←" : "View all products →", exact: true }).click();
    await expect(page).toHaveURL(/\/products$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: language.products, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("language changes refresh server content and preserve URL parameters and fragments", async ({ page, context }) => {
  await page.goto("/contact?source=test#support");
  for (const code of ["fa", "ar", "en"] as const) {
    await page.getByRole("button", { name: languages[code].name, exact: true }).click();
    await expect(page.getByRole("heading", { name: languages[code].contact, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", code);
    await expect(page).toHaveURL(/\/contact\?source=test#support$/);
    expect((await context.cookies()).find(c => c.name === "sz-lang")?.value).toBe(code);
    await page.reload();
    await expect(page.getByRole("heading", { name: languages[code].contact, exact: true })).toBeVisible();
  }
});

test("direct Persian landing remembers its language; switch back to English", async ({ page, context }) => {
  await page.goto("/fa");
  await expect(page.getByRole("button", { name: "فارسی", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await context.cookies()).find(c => c.name === "sz-lang")?.value).toBe("fa");
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3107/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("unsupported cookie falls back to English and admin stays Persian", async ({ page, context }) => {
  await context.addCookies([{ name: "sz-lang", value: "invalid", url: "http://localhost:3107" }]);
  await page.goto("/contact");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const code of ["en", "ar"] as const) {
    await context.addCookies([{ name: "sz-lang", value: code, url: "http://localhost:3107" }]);
    await page.goto("/admin");
    await expect(page.locator('[lang="fa"][dir="rtl"]')).toBeVisible();
    await expect(page.locator(".sz-lang")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "روز / شب", exact: true })).toBeVisible();
  }
});

test("mobile Persian and Arabic pages fit the viewport and localize the menu", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const code of ["fa", "ar"] as const) {
    await context.addCookies([{ name: "sz-lang", value: code, url: "http://localhost:3107" }]);
    await page.goto(`/${code}?capture=1`);
    const menu = page.locator(".sv-header .menu");
    await expect(menu).toHaveAccessibleName(code === "fa" ? "باز کردن منو" : "فتح القائمة");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAccessibleName(code === "fa" ? "بستن منو" : "إغلاق القائمة");
    await menu.click();
    await page.locator("img").evaluateAll(async images => {
      images.forEach(node => { (node as HTMLImageElement).loading = "eager"; });
      await Promise.all(images.map(node => (node as HTMLImageElement).decode()));
    });
    await page.screenshot({ path: testInfo.outputPath(`${code}-home-mobile.png`), fullPage: true });
    for (const route of ["/contact", "/coverage", "/warranty", "/verify", "/activate", "/account", "/products"]) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`${code}-products-mobile.png`), fullPage: true });
  }
});

test("product selection, RTL carousel and localized API validation", async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: "sz-lang", value: "fa", url: "http://localhost:3107" }]);
  await page.goto("/products");
  const series = page.locator('main a[href^="/products/tint-"]').first();
  await series.click();
  await expect(page.getByRole("heading", { name: "Test film 1", exact: true })).toBeVisible();
  const thumbs = page.locator(".thumbs");
  await page.getByRole("button", { name: "محصولات بعدی", exact: true }).click();
  await expect.poll(() => thumbs.evaluate(el => el.scrollLeft)).toBeLessThan(0);
  await page.getByRole("button", { name: "Test film 5، مدل TEST-05", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test film 5", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/model=TEST-05/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("fa-series-desktop.png"), fullPage: true });
  await page.route("**/api/warranty/verify?**", route => route.fulfill({ status: 400, json: { error: "Enter the ROLL NO printed on the carton." } }));
  await page.goto("/verify");
  await page.locator("#verify-roll").fill("INVALID");
  await page.getByRole("button", { name: "بررسی", exact: true }).click();
  await expect(page.getByText("ROLL NO چاپ‌شده روی کارتن را وارد کنید.", { exact: true })).toBeVisible();
});
