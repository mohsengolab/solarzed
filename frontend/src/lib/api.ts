const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// Persian admin UI: every interface string and server message goes through this map.
export function fa(value: string): string {
  const table = FarsiStrings as Record<string, string>;
  const key = value.trim().toLowerCase().replace(/[.!?]+$/, "");
  const direct = table[value] ?? table[key];
  return direct ?? value;
}

const FarsiStrings = {
  // Navigation and shell
  "Products": "محصولات", "Rolls": "رول‌ها", "Labels": "برچسب‌ها",
  "Warranties": "گارانتی‌ها", "Customers": "مشتریان", "SMS": "پیامک", "Settings": "تنظیمات",
  "Loading…": "در حال بارگذاری…",
  "Account": "حساب کاربری", "Users": "کاربران",
  "overview": "نمای کلی", "products": "محصولات", "rolls": "رول‌ها", "labels": "برچسب‌ها",
  "warranties": "گارانتی‌ها", "customers": "مشتریان", "sms": "پیامک", "settings": "تنظیمات", "users": "کاربران",
  "Warranty administration": "مدیریت گارانتی",
  "Sign in to review installations, manage rolls and set coverage.":
    "برای بررسی نصب‌ها، مدیریت رول‌ها و تعیین پوشش وارد شوید.",
  "Username": "نام کاربری", "Admin password": "رمز عبور", "Signing in…": "در حال ورود…",
  "Sign in ↗": "ورود ↗", "Login failed": "ورود ناموفق بود", "Sign out": "خروج",
  "Overview": "نمای کلی", "OVERVIEW": "نمای کلی", "Warranty operations": "عملیات گارانتی",
  "Refresh": "بازخوانی", "Total": "کل", "Pending": "در انتظار", "Active": "فعال",
  "Rejected": "رد شده", "Review queue": "صف بررسی", "Queue is empty.": "صف خالی است.",
  "Code": "کد", "Vehicle": "خودرو", "Installed": "تاریخ نصب", "Flags": "پرچم‌ها",
  // Warranties
  "WARRANTIES": "گارانتی‌ها", "Registrations": "ثبت‌ها", "Export CSV (max 200)": "خروجی CSV (حداکثر ۲۰۰)",
  "All": "همه", "Search warranties": "جستجوی گارانتی",
  "Code, owner, mobile, VIN, plate, serial, invoice, roll":
    "کد، مالک، موبایل، VIN، پلاک، سریال، فاکتور، رول",
  "Product type": "نوع محصول", "All types": "همه انواع", "Window film": "فیلم شیشه", "PPF": "PPF",
  "Flagged only": "فقط دارای پرچم", "Not flagged": "بدون پرچم",
  "Specific flag": "پرچم مشخص", "Any flag": "هر پرچم", "Vehicle make / model": "برند / مدل خودرو",
  "Installer / seller": "نصّاب / فروشنده", "Installed from": "نصب از", "Installed to": "نصب تا",
  "Registered from": "ثبت از", "Registered to": "ثبت تا",
  "Film warranty expiring": "انقضای گارانتی فیلم", "Any time": "هر زمان",
  "Within 30 days": "تا ۳۰ روز", "Within 90 days": "تا ۹۰ روز", "Within 1 year": "تا ۱ سال",
  "QR": "QR", "Owner": "مالک", "Type": "نوع", "Installer": "نصّاب",
  "Film ends": "پایان فیلم", "Status": "وضعیت", "No warranties match these filters.": "گارانتی‌ای با این فیلترها یافت نشد.",
  "Warranty QR codes": "کدهای QR گارانتی",
  "Print warranty QR": "چاپ QR گارانتی", "Clear selection": "پاک کردن انتخاب", "Decision — ": "تصمیم — ",
  "Activate": "فعال‌سازی", "Reject": "رد", "Keep pending": "در انتظار بمان",
  "Note": "یادداشت", "Save decision": "ذخیره تصمیم", "Saving…": "در حال ذخیره…", "Saved.": "ذخیره شد.",
  "Close": "بستن", "Select": "انتخاب",
  // Rolls
  "ROLL REGISTRY": "ثبت رول‌ها", "Rolls & batches": "رول‌ها و بچ‌ها", "Receive rolls": "دریافت رول",
  "Defined product": "محصول تعریف‌شده", "Select a product or enter an existing model below":
    "یک محصول انتخاب کنید یا مدل موجود را پایین وارد کنید",
  "Model code": "کد مدل", "e.g. PIR or CP-01": "مثلاً PIR یا CP-01", "Batch": "بچ",
  "e.g. LOT-2608-B17": "مثلاً LOT-2608-B17", "Supplier code": "کد تأمین‌کننده", "e.g. SUP-02": "مثلاً SUP-02",
  "Paint protection film": "فیلم محافظ رنگ", "QC": "کنترل کیفیت", "Approved": "تأیید شده",
  "Quantity": "تعداد", "Create roll IDs ↗": "ساخت شناسه رول ↗", "Creating…": "در حال ساخت…",
  "Inventory": "موجودی", "Search inventory": "جستجوی موجودی", "Roll ID, model, batch or supplier":
    "شناسه رول، مدل، بچ یا تأمین‌کننده", "Product": "محصول", "All products": "همه محصولات",
  "QC filter": "فیلتر QC", "Any QC": "هر QC", "Stock status filter": "فیلتر وضعیت انبار",
  "Any status": "هر وضعیت", "In stock": "موجود در انبار", "Shipped": "ارسال شده",
  "Consumed": "مصرف شده", "Void": "باطل", "Batch contains": "بچ شامل", "Supplier contains": "تأمین‌کننده شامل",
  "Received from": "دریافت از", "Received to": "دریافت تا",
  "Installations": "نصب‌ها", "Has installations": "دارای نصب", "No installations": "بدون نصب",
  "Roll ID": "شناسه رول", "Model": "مدل", "Supplier": "تأمین‌کننده", "Received": "تاریخ دریافت",
  "Manage ": "مدیریت ", "No rolls match these filters.": "رولی با این فیلترها یافت نشد.",
  "Quality control": "کنترل کیفیت", "Change note": "یادداشت تغییر", "Save inventory": "ذخیره موجودی",
  "History": "تاریخچه", "Inventory updated.": "موجودی به‌روزرسانی شد.", "Update failed.": "به‌روزرسانی ناموفق بود.",
  // Labels
  "CARTON QR LABELS": "برچسب‌های QR کارتن", "Box warranty activation": "فعال‌سازی گارانتی جعبه",
  "Create unique box labels": "ساخت برچسب یکتای جعبه",
  "One code per box. Print carton labels while the product is in stock. Coverage is copied from Settings.":
    "یک کد برای هر جعبه. برچسب کارتن را هنگام موجود بودن محصول چاپ کنید. پوشش از تنظیمات کپی می‌شود.",
  "Product roll": "رول محصول", "Select a roll": "یک رول انتخاب کنید",
  "Print setup": "تنظیمات چاپ", "Public website": "وب‌سایت عمومی",
  "Save QR website": "ذخیره وب‌سایت QR", "Width (mm)": "عرض (میلی‌متر)", "Height (mm)": "ارتفاع (میلی‌متر)",
  "Generate QR labels": "ساخت برچسب QR", "Number of boxes": "تعداد جعبه‌ها",
  "Print selected labels": "چاپ برچسب‌های انتخاب‌شده", "Issued labels": "برچسب‌های صادرشده",
  "Box serial": "سریال جعبه", "Product / roll": "محصول / رول", "Warranty": "گارانتی",
  "Activated": "فعال شده", "Awaiting shipment": "در انتظار ارسال", "Unused": "استفاده نشده",
  "No box labels issued yet.": "هنوز برچسب جعبه‌ای صادر نشده است.",
  "Mark roll as shipped — enable customer activation": "علامت‌گذاری رول به‌عنوان ارسال‌شده — فعال‌سازی مشتری",
  "Carton serial only (no QR, no warranty code)": "فقط سریال کارتن (بدون QR و کد گارانتی)",
  // Customers
  "CUSTOMERS": "مشتریان", "Customers & vehicles": "مشتریان و خودروها",
  "Search name, mobile or VIN": "جستجوی نام، موبایل یا VIN",
  "Name, mobile, VIN, plate or warranty code": "نام، موبایل، VIN، پلاک یا کد گارانتی",
  "Warranty status": "وضعیت گارانتی", "Customer information comes from warranty registrations. Each customer shows their full history.":
    "اطلاعات مشتری از ثبت‌های گارانتی می‌آید. هر مشتری تاریخچه کامل خود را می‌بیند.",
  "No customers match these filters.": "مشتری‌ای با این فیلترها یافت نشد.",
  // Settings
  "Coverage periods": "دوره‌های پوشش",
  "Tint – film warranty": "فیلم شیشه – گارانتی فیلم", "Tint – installation warranty": "فیلم شیشه – گارانتی نصب",
  "PPF – film warranty": "PPF – گارانتی فیلم", "PPF – installation warranty": "PPF – گارانتی نصب",
  "Not set": "تعیین نشده", "Save periods ↗": "ذخیره دوره‌ها ↗",
  "Warranty code length (characters)": "طول کد گارانتی (کاراکتر)",
  "Characters after the SZ- prefix. Existing warranties keep their code.":
    "کاراکترهای بعد از پیشوند SZ-. گارانتی‌های موجود کد خود را حفظ می‌کنند.",
  "Could not load coverage periods.": "بارگذاری دوره‌های پوشش ناموفق بود.",
  // Account
  "Account security": "امنیت حساب کاربری",
  "Account username": "نام کاربری حساب", "Current password": "رمز عبور فعلی",
  "New password": "رمز عبور جدید", "Confirm new password": "تأیید رمز عبور جدید",
  "Change password": "تغییر رمز عبور",
  "Use at least 12 characters. Changing the password signs out every existing session. Sessions expire after 8 hours; repeated failed sign-ins lock the account for 15 minutes.":
    "حداقل ۱۲ کاراکتر استفاده کنید. تغییر رمز همه نشست‌ها را خارج می‌کند. نشست‌ها پس از ۸ ساعت منقضی می‌شوند؛ ورودهای ناموفق پیاپی حساب را ۱۵ دقیقه قفل می‌کند.",
  "Password changed. All sessions were signed out; sign in again with the new password.":
    "رمز عبور تغییر کرد. همه نشست‌ها خارج شدند؛ با رمز جدید وارد شوید.",
  "New passwords do not match.": "رمزهای جدید یکسان نیستند.",
  // Users
  "User management": "مدیریت کاربران",
  "Create user": "ساخت کاربر", "Add a manager or a carton/serial operator.": "یک مدیر یا اپراتور کارتن/سریال اضافه کنید.",
  "Name (optional)": "نام (اختیاری)", "Role": "نقش", "Manager — everything": "مدیر — همه چیز",
  "Carton — only the serial on the box": "کارتن — فقط سریال روی جعبه",
  "Password": "رمز عبور", "Create": "ساخت", "Actions": "عملی‌ها",
  "Disable": "غیرفعال", "Enable": "فعال", "Reset password": "بازنشانی رمز",
  "User created.": "کاربر ساخته شد.", "User updated.": "کاربر به‌روزرسانی شد.",
  "Password reset.": "رمز عبور بازنشانی شد.", "Error": "خطا", "Request failed.": "درخواست ناموفق بود.",
  "No users yet.": "هنوز کاربری ثبت نشده است.", "At least one active manager account must remain.":
    "حداقل یک حساب مدیر فعال باید باقی بماند.", "Managers only": "فقط مدیران",
  // SMS
  "SMS gateway": "درگاه پیامک", "Provider": "ارائه‌دهنده", "Faraz · HTTPS": "فراز · HTTPS",
  "Sender line": "خط فرستنده", "Pattern": "الگو", "Last verified": "آخرین تأیید",
  "Connection": "اتصال", "Faraz API key": "کلید API فراز",
  "Stored securely — leave empty to keep it": "به‌صورت امن ذخیره شده — برای حفظ آن خالی بگذارید",
  "OTP pattern ID": "شناسه الگوی OTP", "OTP variable name": "نام متغیر OTP",
  "Verify connection and save SMS": "تأیید اتصال و ذخیره پیامک", "Verifying…": "در حال تأیید…",
  "Disconnect and delete key": "قطع اتصال و حذف کلید",
  "Verification rules": "قواعد تأیید", "Sending enabled": "ارسال فعال",
  "Code validity (minutes)": "اعتبار کد (دقیقه)", "Wait before resending (seconds)": "انتظار پیش از ارسال مجدد (ثانیه)",
  "Daily messages per mobile": "پیام روزانه به هر موبایل", "Save rules": "ذخیره قواعد",
  "Send test message": "ارسال پیام آزمایشی",
  "Sends one real SMS with a random code using the approved pattern. Limited to 5 tests per 10 minutes.":
    "یک پیامک واقعی با کد تصادفی و الگوی تأییدشده ارسال می‌کند. حداکثر ۵ آزمون در ۱۰ دقیقه.",
  "Mobile number": "شماره موبایل", "Send test SMS": "ارسال پیامک آزمایشی", "Sending…": "در حال ارسال…",
  "Recent activity": "فعالیت اخیر", "Time": "زمان", "Mobile": "موبایل", "Purpose": "هدف",
  "Result": "نتیجه", "Detail": "جزئیات", "Submitted": "ارسال شد", "Failed": "ناموفق",
  "No messages sent since the server started.": "از زمان راه‌اندازی سرور پیامی ارسال نشده است.",
  "Could not load SMS settings.": "بارگذاری تنظیمات پیامک ناموفق بود.",
  "SMS is not connected. Customer activation remains unavailable.": "پیامک متصل نیست. فعال‌سازی مشتری ممکن نیست.",
  // Pager and filters
  "Previous": "قبلی", "Next": "بعدی", "Page ": "صفحه ", "of": "از",
  // Status and flag values returned by the API
  "pending": "در انتظار", "active": "فعال", "rejected": "رد شده",
  "instock": "موجود در انبار", "shipped": "ارسال شده", "consumed": "مصرف شده", "void": "باطل",
  "roll_unknown": "رول ناشناس", "roll_not_approved": "رول تأیید‌نشده", "roll_not_distributed": "رول توزیع‌نشده",
  "roll_void": "رول باطل", "type_mismatch": "عدم تطابق نوع", "vin_repeat": "تکرار VIN",
  // Warranty detail labels
  "owner": "مالک", "phone": "موبایل", "make": "برند", "model": "مدل", "vin": "VIN", "plate": "پلاک",
  "filmSerial": "سریال فیلم", "invoiceNumber": "شماره فاکتور", "installed": "تاریخ نصب", "sellerName": "فروشنده",
  "sellerPhone": "موبایل فروشنده", "installer": "نصّاب", "rollId": "شناسه رول", "flagsJson": "پرچم‌ها", "reviewNote": "یادداشت بررسی",
  // Remaining label and print strings
  "Box serials": "سریال‌های جعبه", "The request failed.": "درخواست ناموفق بود.",
  "SMS is not configured yet. QR labels can be prepared, but customers cannot activate until Faraz is connected.":
    "پیامک هنوز تنظیم نشده است. برچسب‌های QR آماده می‌شوند، اما تا اتصال فراز مشتری نمی‌تواند فعال‌سازی کند.",
  "Set the approved warranty period for": "دوره گارانتی تأییدشده را برای",
  "before generating labels.": "پیش از ساخت برچسب تعیین کنید.", "Open coverage settings": "باز کردن تنظیمات پوشش",
  "You can generate and print QR labels now. Mark the roll as shipped when it is ready for customers to activate.":
    "اکنون می‌توانید برچسب‌های QR را بسازید و چاپ کنید. وقتی رول آماده فعال‌سازی مشتری بود، آن را ارسال‌شده علامت بزنید.",
  "Working…": "در حال انجام…",
  "Use matching paper dimensions, 100% scale and no browser headers/footers. The printed link opens solarzed.com, so the activation page must be deployed there.":
    "از ابعاد کاغذ یکسان، مقیاس ۱۰۰٪ و بدون سرصفحه/پاصفحه مرورگر استفاده کنید. لینک چاپ‌شده solarzed.com را باز می‌کند، پس صفحه فعال‌سازی باید آنجا منتشر شده باشد.",
  "Label size must be 60–150 mm wide and 40–150 mm high.": "اندازه برچسب باید ۶۰ تا ۱۵۰ میلی‌متر عرض و ۴۰ تا ۱۵۰ میلی‌متر ارتفاع باشد.",
  "Select unused labels and wait for their QR previews.": "برچسب‌های استفاده‌نشده را انتخاب کنید و منتظر پیش‌نمایش QR بمانید.",
  "Allow the print preview window in your browser.": "پنجره پیش‌نمایش چاپ را در مرورگر مجاز کنید.",
  "Scan → Verify mobile → Activate": "اسکن ← تأیید موبایل ← فعال‌سازی", "Local activation preview ↗": "پیش‌نمایش فعال‌سازی محلی ↗",
  // Server messages
  "invalid password": "نام کاربری یا رمز عبور نادرست است.", "Current credentials are incorrect.": "اطلاعات ورود فعلی درست نیست.",
  "Username must be 3–50 letters, numbers, dot, dash or underscore.": "نام کاربری باید ۳ تا ۵۰ حرف، عدد، نقطه، خط تیره یا زیرخط باشد.",
  "This username already exists.": "این نام کاربری از قبل وجود دارد.", "Choose the manager or carton role.": "نقش مدیر یا کارتن را انتخاب کنید.",
  "Password must have at least 12 characters and at most 72 UTF-8 bytes.": "رمز عبور باید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت باشد.",
  "New password must have at least 12 characters and at most 72 UTF-8 bytes.": "رمز عبور جدید باید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت باشد.",
  "User not found.": "کاربر یافت نشد.", "Unknown role.": "نقش ناشناخته است.", "Current session is not valid.": "نشست فعلی معتبر نیست.",
  "Quantity must be 1–200 boxes.": "تعداد باید بین ۱ تا ۲۰۰ جعبه باشد.", "Roll not found.": "رول یافت نشد.",
  "Only QC-approved, non-void products can have box labels.": "فقط محصولات تأییدشده در QC و غیر باطل می‌توانند برچسب جعبه داشته باشند.",
  "Forbidden": "دسترسی مجاز نیست.", "Unauthorized": "ورود لازم است.", "Not found": "یافت نشد.",
  "Network error": "خطای شبکه",
  "First page": "صفحه اول", "Last page": "صفحه آخر", "filter active": "فیلتر فعال", "filters active": "فیلتر فعال",
  "No filters": "بدون فیلتر", "Clear filters": "پاک کردن فیلترها",
} as const;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Admin sessions use an HttpOnly cookie; the custom header is required by the API's CSRF check.
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && path.startsWith("/api/admin/") && path !== "/api/admin/login" && typeof window !== "undefined")
      window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED));
    throw new Error(body.error ?? (res.status === 401 ? "Your session has ended. Please sign in again." : `HTTP ${res.status}`));
  }
  return res.json();
}

export const ADMIN_UNAUTHORIZED = "solarzed:admin-unauthorized";

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v !== null && v !== undefined) search.set(k, String(v));
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ── Public ───────────────────────────────────────────────────────────────────

export interface WarrantyPublic {
  code: string;
  type: "tint" | "ppf";
  make: string;
  model: string;
  vinMasked: string;
  plate: string;
  filmSerial: string;
  invoiceNumber: string;
  installed: string;
  sellerName: string;
  sellerPhoneMasked: string;
  installer: string;
  areas: string[];
  status: "pending" | "active" | "rejected";
  statusLabel: string;
  statusNote?: string;
  coverage?: { filmEnds?: string; installEnds?: string };
  flags: string[];
}

export interface LookupResult {
  records: WarrantyPublic[];
}

export function lookupWarranty(q: string): Promise<LookupResult> {
  return apiFetch(`/api/warranty?q=${encodeURIComponent(q)}`);
}

export function registerWarranty(data: Record<string, unknown>) {
  return apiFetch<{ code: string; flags: string[] }>("/api/warranty/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────

// The session lives in an HttpOnly cookie set by the API, so scripts never see the token.
export function adminSession() { return apiFetch<{ username: string; role: string }>("/api/admin/session"); }
export function adminLogout() { return apiFetch<{ ok: boolean }>("/api/admin/logout", { method: "POST" }); }

export function managementFetch<T>(path: string, data?: unknown, method = "POST") {
  return apiFetch<T>(`/api/admin/${path}`, data === undefined && method === "POST" ? {} :
    { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}

export function adminLogin(username: string, password: string) {
  return apiFetch<{ token: string; username: string; role: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

// ── Users (manager only) ──────────────────────────────────────────────────────

export interface AdminUserRow { id: number; username: string; role: "admin" | "carton"; displayName: string | null; active: boolean }
export function adminUsers() { return apiFetch<{ users: AdminUserRow[] }>("/api/admin/users"); }
export function adminCreateUser(data: { username: string; password: string; role: "admin" | "carton"; displayName?: string; active: boolean }) {
  return apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
}
export function adminUpdateUser(id: number, data: { role?: "admin" | "carton"; displayName?: string; active?: boolean }) {
  return apiFetch(`/api/admin/users/${id}`, { method: "POST", body: JSON.stringify(data) });
}
export function adminResetPassword(id: number, password: string) {
  return apiFetch(`/api/admin/users/${id}/password`, { method: "POST", body: JSON.stringify({ password }) });
}

export function adminOverview() {
  return apiFetch("/api/admin/overview");
}

export function adminWarranties<T>(query: string) {
  return apiFetch<Paged<T>>(`/api/admin/warranties${query}`);
}

export function adminDecision(code: string, status: string, note?: string) {
  return apiFetch(`/api/admin/warranties/${encodeURIComponent(code)}/decision`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
}

export function adminRollsSearch<T>(query: string) {
  return apiFetch<Paged<T>>(`/api/admin/rolls${query}`);
}

/** Most recent 200 rolls (used by box labels). */
export async function adminRolls() {
  return (await apiFetch<Paged<unknown>>("/api/admin/rolls?pageSize=200")).items;
}

export function adminCreateRolls(data: Record<string, unknown>) {
  return apiFetch("/api/admin/rolls", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function adminGetSettings() {
  return apiFetch("/api/admin/settings");
}

export function adminSaveSettings(data: Record<string, unknown>) {
  return apiFetch("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface BoxLabel {
  id: string; rollId: string; product: string; type: "tint" | "ppf";
  filmYears: number; installYears: number | null; createdAt: string;
  activatedAt: string | null; warrantyCode?: string | null; activationUrl?: string;
}
export interface BoxLabelsResult { labels: BoxLabel[]; siteUrl: string; smsConfigured: boolean }
export function adminBoxLabels() { return apiFetch<BoxLabelsResult>("/api/admin/box-labels"); }
export function issueBoxLabels(rollId: string, quantity: number) {
  return apiFetch<{ labels: BoxLabel[] }>("/api/admin/box-labels", { method: "POST", body: JSON.stringify({ rollId, quantity }) });
}
export function saveLabelSite(siteUrl: string) {
  return apiFetch("/api/admin/box-labels/site", { method: "POST", body: JSON.stringify({ siteUrl }) });
}
export function releaseRoll(id: string) {
  return apiFetch(`/api/admin/rolls/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ status: "shipped", note: "Released by admin for box QR activation" }) });
}
export interface ActivationInfo { id: string; product: string; type: "tint" | "ppf"; activated: boolean; filmYears: number; installYears: number | null; smsAvailable: boolean; released: boolean }
export function inspectBox(token: string) {
  return apiFetch<ActivationInfo>("/api/activation/inspect", { method: "POST", body: JSON.stringify({ token }) });
}
export function sendActivationOtp(token: string, phone: string) {
  return apiFetch<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }>("/api/activation/otp", { method: "POST", body: JSON.stringify({ token, phone }) });
}
export function completeActivation(token: string, challengeId: string, otp: string, registration: Record<string, unknown>) {
  return apiFetch<WarrantyPublic>("/api/activation/complete", { method: "POST", body: JSON.stringify({ token, challengeId, otp, registration }) });
}
