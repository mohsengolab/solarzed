const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Persian digits with the Gregorian calendar: plain "fa-IR" would show Jalali (Solar Hijri) dates. */
export const FA_DATE = "fa-IR-u-ca-gregory";

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
  "ROLL REGISTRY": "ثبت رول‌ها", "Rolls & batches": "رول‌ها و Batchها", "Receive rolls": "دریافت رول",
  "Defined product": "محصول تعریف‌شده", "Select a product or enter an existing model below":
    "یک محصول انتخاب کنید یا مدل موجود را پایین وارد کنید",
  "Model code": "کد مدل", "e.g. PIR or CP-01": "مثلاً PIR یا CP-01", "Batch": "Batch",
  "e.g. LOT-2608-B17": "مثلاً LOT-2608-B17", "Supplier code": "کد تأمین‌کننده", "e.g. SUP-02": "مثلاً SUP-02",
  "Paint protection film": "فیلم محافظ رنگ", "QC": "کنترل کیفیت", "Approved": "تأیید شده",
  "Quantity": "تعداد", "Create roll IDs ↗": "ساخت شناسه رول ↗", "Creating…": "در حال ساخت…",
  "Inventory": "موجودی", "Search inventory": "جستجوی موجودی", "Roll ID, model, batch or supplier":
    "شناسه رول، مدل، Batch یا تأمین‌کننده", "Product": "محصول", "All products": "همه محصولات",
  "QC filter": "فیلتر QC", "Any QC": "هر QC", "Stock status filter": "فیلتر وضعیت انبار",
  "Any status": "هر وضعیت", "In stock": "موجود در انبار", "Shipped": "ارسال شده",
  "Consumed": "مصرف شده", "Void": "باطل", "Batch contains": "Batch شامل", "Supplier contains": "تأمین‌کننده شامل",
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
  "Name (optional)": "نام (اختیاری)", "Role": "نقش", "Manager — everything": "مدیر — بدون شناسه رول و کد گارانتی؛ رول‌ها: فقط لوکیشن و وضعیت",
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
  "pending": "در انتظار", "active": "فعال", "approved": "تأیید شده", "rejected": "رد شده",
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
  // Box transfers
  "BOX TRANSFERS": "جابه‌جایی کارتن‌ها", "Move boxes by carton serial": "انتقال کارتن با سریال روی جعبه",
  "Box serials (scan or type, one per line)": "سریال کارتن‌ها (اسکن یا تایپ، هر خط یکی)",
  "Current holder (safety check)": "دارنده فعلی (برای کنترل)", "Any holder — no check": "هر دارنده‌ای — بدون کنترل",
  "Central warehouse": "انبار مرکزی", "Recipient": "تحویل‌گیرنده", "Recipient mobile (optional)": "موبایل تحویل‌گیرنده (اختیاری)",
  "Note (optional)": "توضیح (اختیاری)", "Return to central warehouse": "بازگشت به انبار مرکزی", "Record transfer": "ثبت انتقال",
  "Use selected boxes": "استفاده از کارتن‌های انتخاب‌شده", "boxes transferred": "کارتن منتقل شد", "Transfer number": "شماره حواله",
  "Who holds the boxes": "کارتن‌ها دست چه کسی است", "Holder": "دارنده", "Boxes": "تعداد کارتن",
  "Box history": "تاریخچه کارتن", "Show history": "نمایش تاریخچه", "From": "از", "To": "به", "By": "ثبت‌کننده", "Date": "تاریخ",
  "No transfers recorded for this box.": "برای این کارتن انتقالی ثبت نشده است.", "Activated on a vehicle": "روی خودرو فعال شده",
  "Enter who receives the boxes.": "تحویل‌گیرنده را وارد کنید.", "Recipient name is too long.": "نام تحویل‌گیرنده خیلی طولانی است.",
  "Box serial not found.": "سریال کارتن یافت نشد.", "Note is too long.": "توضیح خیلی طولانی است.",
  "Enter a valid mobile number.": "شماره موبایل معتبر وارد کنید.", "Enter 1–200 box serials.": "بین ۱ تا ۲۰۰ سریال کارتن وارد کنید.",
  "One of these boxes was changed by someone else. Refresh and try again.": "یکی از این کارتن‌ها هم‌زمان توسط کاربر دیگری تغییر کرد. صفحه را تازه کنید و دوباره تلاش کنید.",
  // Server messages (products / rolls / tickets / users / email)
  "Product code already exists.": "این کد محصول از قبل وجود دارد.",
  "Product name already exists.": "محصولی با این نام از قبل وجود دارد.",
  "Product code cannot change; delete it and create a new product.": "کد محصول تغییر نمی‌کند؛ آن را حذف و محصول جدید بسازید.",
  "This product has rolls in inventory; delete or void its rolls first.": "این محصول رول در موجودی دارد؛ ابتدا رول‌های آن را حذف یا باطل کنید.",
  "Code must be 1–24 letters, numbers or hyphens.": "کد باید ۱ تا ۲۴ حرف، عدد یا خط تیره باشد.",
  "Product name is required (maximum 120 characters).": "نام محصول الزامی است (حداکثر ۱۲۰ کاراکتر).",
  "This roll has warranty registrations; it cannot be deleted. Mark it void instead.": "این رول ثبت گارانتی دارد و حذف نمی‌شود؛ آن را باطل کنید.",
  "This roll has carton labels; it cannot be deleted. Mark it void instead.": "این رول برچسب کارتن دارد و حذف نمی‌شود؛ آن را باطل کنید.",
  "Ticket not found.": "تیکت یافت نشد.",
  "Write a reply of up to 4000 characters.": "پاسخی تا ۴۰۰۰ کاراکتر بنویسید.",
  "Enter a subject of up to 200 characters.": "موضوعی تا ۲۰۰ کاراکتر وارد کنید.",
  "Write your question (up to 4000 characters).": "پرسش خود را بنویسید (تا ۴۰۰۰ کاراکتر).",
  "Write your message (up to 4000 characters).": "پیام خود را بنویسید (تا ۴۰۰۰ کاراکتر).",
  "Please retry saving your profile.": "ذخیره پروفایل ناموفق بود؛ دوباره تلاش کنید.",
  "Add and verify your mobile number first; cartons are handed over by mobile number.": "ابتدا شماره موبایل خود را ثبت و تأیید کنید؛ تحویل کارتن با موبایل انجام می‌شود.",
  "Choose the super administrator, manager or carton role.": "نقش مدیر کل، مدیر یا کارتن را انتخاب کنید.",
  "At least one active super administrator account must remain.": "حداقل یک حساب مدیر کل فعال باید باقی بماند.",
  "This account is disabled. Please contact Solarzed support.": "این حساب غیرفعال است. با پشتیبانی سولارزد تماس بگیرید.",
  "Please sign in again.": "لطفاً دوباره وارد شوید.",
  "Please retry the verification request.": "درخواست تأیید را دوباره ارسال کنید.",
  "Please retry signing in.": "ورود ناموفق بود؛ دوباره تلاش کنید.",
  "Enter the SMTP host and a valid sender address.": "میزبان SMTP و آدرس فرستنده معتبر را وارد کنید.",
  "Enter the SMTP password for the user account, or leave the user empty.": "رمز SMTP حساب کاربری را وارد کنید یا کاربر را خالی بگذارید.",
  "Email settings saved. No SMTP user set; the server must accept anonymous sending.": "تنظیمات ایمیل ذخیره شد. کاربر SMTP تعیین نشده؛ سرور باید ارسال ناشناس را بپذیرد.",
  "Email sending is not configured.": "ارسال ایمیل تنظیم نشده است.",
  "Could not reach the SMTP server.": "اتصال به سرور SMTP ناموفق بود.",
  "Enter a valid email address.": "یک ایمیل معتبر وارد کنید.",
  "First page": "صفحه اول", "Last page": "صفحه آخر", "filter active": "فیلتر فعال", "filters active": "فیلتر فعال",
  "No filters": "بدون فیلتر", "Clear filters": "پاک کردن فیلترها",
  // Tickets
  "Tickets": "تیکت‌ها", "tickets": "تیکت‌ها", "Support tickets": "تیکت‌های پشتیبانی",
  "Subject": "موضوع", "Replies": "پاسخ‌ها", "User": "کاربر", "Profile": "پروفایل",
  "open": "باز", "answered": "پاسخ داده شد", "closed": "بسته", "Open": "باز",
  "Reply": "پاسخ", "Close ticket": "بستن تیکت", "Reopen": "بازگشایی",
  // Products: name-only edit + hard delete
  "Rename": "تغییر نام", "Delete product": "حذف محصول", "Delete roll": "حذف رول",
  // Email settings
  "Email channel": "کانال ایمیل", "SMTP host": "میزبان SMTP", "Port": "پورت",
  "Sender address": "آدرس فرستنده", "Sender name": "نام فرستنده",
  "SMTP user": "کاربر SMTP", "SMTP password": "رمز SMTP", "Use SSL/TLS": "استفاده از SSL/TLS",
  "Save email settings": "ذخیره تنظیمات ایمیل", "Send test email": "ارسال ایمیل آزمایشی",
  "Email address": "آدرس ایمیل",
  // Portal profile
  "First name": "نام", "Last name": "نام خانوادگی", "Country": "کشور", "City": "شهر", "Job": "شغل",
  "Bind phone": "ثبت شماره موبایل", "Bind email": "ثبت ایمیل",
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
  usedLengthM?: number | null;
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

/** Public certificate check: no plate, VIN, invoice, installer or seller. Owners see full records in /account. */
export interface WarrantyCheck {
  code: string;
  type: "tint" | "ppf";
  make: string;
  model: string;
  installed: string;
  areas: string[];
  status: "pending" | "active" | "rejected";
  statusLabel: string;
  statusNote?: string | null;
  coverage?: { filmEnds?: string; installEnds?: string } | null;
}

export interface LookupResult {
  records: WarrantyCheck[];
}

export function lookupWarranty(q: string): Promise<LookupResult> {
  return apiFetch(`/api/warranty?q=${encodeURIComponent(q)}`);
}

/** The gold warranty card: what the owner sees from the SMS link or the VIN + mobile inquiry. */
export interface WarrantyCard {
  code: string;
  owner: string;
  type: "tint" | "ppf";
  product?: string | null;
  make: string;
  model: string;
  plate: string;
  vinMasked: string;
  installed: string;
  installer: string;
  country?: string | null;
  areas: string[];
  status: "pending" | "active" | "rejected";
  statusLabel: string;
  coverage?: { filmEnds?: string | null; installEnds?: string | null } | null;
  link: string;
}

/** Owner inquiry: both the VIN and the mobile the warranty was registered to must match. */
export function lookupByVinAndMobile(vin: string, phone: string) {
  return apiFetch<{ cards: WarrantyCard[] }>(`/api/warranty/owner?vin=${encodeURIComponent(vin)}&phone=${encodeURIComponent(phone)}`);
}

export function warrantyCard(code: string, key: string) {
  return apiFetch<WarrantyCard>(`/api/warranty/card?code=${encodeURIComponent(code)}&key=${encodeURIComponent(key)}`);
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

// ── Users (super administrator only) ─────────────────────────────────────────

export type AdminRole = "superadmin" | "admin" | "counter";
export interface AdminUserRow { id: number; username: string; role: AdminRole; displayName: string | null; active: boolean }
export function adminUsers() { return apiFetch<{ users: AdminUserRow[] }>("/api/admin/users"); }
export function adminCreateUser(data: { username: string; password: string; role: AdminRole; displayName?: string; active: boolean }) {
  return apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
}
export function adminUpdateUser(id: number, data: { role?: AdminRole; displayName?: string; active?: boolean }) {
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
  return apiFetch<{ ok: boolean; smsError?: string | null }>(`/api/admin/warranties/${encodeURIComponent(code)}/decision`, {
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

/** Updates a roll's stock fields plus its batch, supplier and physical dimensions. */
export function adminUpdateRoll(id: string, data: { qc?: string; status?: string; note?: string; batch?: string; supplier?: string; widthCm?: number | null; lengthM?: number | null; rollNo?: string; location?: string }) {
  return apiFetch(`/api/admin/rolls/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(data) });
}

/** Deletes a roll. The API refuses while warranty registrations or carton labels still reference it. */
export function adminDeleteRoll(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/rolls/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Admin support tickets ────────────────────────────────────────────────────

export interface AdminTicketRow {
  id: number; code: string; subject: string; status: "open" | "answered" | "closed";
  createdAt: string; updatedAt: string; replies: number;
  userPhone: string | null; userEmail: string | null;
  firstName: string | null; lastName: string | null; country: string | null; city: string | null; job: string | null;
}
export interface AdminTicketReply { id: number; author: "user" | "staff"; authorLabel: string | null; message: string; createdAt: string }
export interface AdminTicketDetail { ticket: AdminTicketRow; profile: { phone: string | null; email: string | null; name: string | null; firstName: string | null; lastName: string | null; country: string | null; city: string | null; job: string | null; createdAt: string; lastLoginAt: string | null } | null; replies: AdminTicketReply[] }
export function adminTickets<T = AdminTicketRow>(query: string) { return apiFetch<Paged<T>>(`/api/admin/tickets${query}`); }
export function adminTicketDetail(id: number) { return apiFetch<AdminTicketDetail>(`/api/admin/tickets/${id}`); }
export function adminTicketReply(id: number, message: string) {
  return apiFetch<{ ok: boolean; status: string }>(`/api/admin/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ message }) });
}
export function adminTicketClose(id: number) { return apiFetch<{ ok: boolean; status: string }>(`/api/admin/tickets/${id}/close`, { method: "POST", body: JSON.stringify({}) }); }
export function adminTicketOpen(id: number) { return apiFetch<{ ok: boolean; status: string }>(`/api/admin/tickets/${id}/open`, { method: "POST", body: JSON.stringify({}) }); }

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
  holder: string | null; holderPhone: string | null; heldSince: string | null;
  // Warranty card inside the carton (manager view only). fullCode = carton roll number + 7-digit warranty number + factory code.
  // factoryCode is internal and is never printed on the card.
  factoryCode?: string | null; cardCode?: string | null; fullCode?: string | null;
  remainingLengthM?: number | null;
}
export interface BoxLabelsResult { labels: BoxLabel[]; siteUrl: string; smsConfigured: boolean }
export function adminBoxLabels() { return apiFetch<BoxLabelsResult>("/api/admin/box-labels"); }
/** One warranty card per carton, keyed by the roll number printed on each box (e.g. CPT30614374). */
export function issueBoxLabels(rollId: string, serials: string[]) {
  return apiFetch<{ labels: BoxLabel[] }>("/api/admin/box-labels", { method: "POST", body: JSON.stringify({ rollId, quantity: serials.length, serials }) });
}
/** One warranty card per roll, keyed by the carton Roll No recorded on each roll. */
export function issueCardsForRolls(rollIds: string[]) {
  return apiFetch<{ labels: BoxLabel[] }>("/api/admin/box-labels/from-rolls", { method: "POST", body: JSON.stringify({ rollIds }) });
}
// ── Box transfers: the roll number printed on the carton (e.g. CPT30614374) moves boxes from mobile to mobile ──
export interface BoxTransfer { id: number; labelId: string; batchId: string; fromHolder: string | null; fromPhone: string | null; toHolder: string | null; toPhone: string | null; note: string | null; actor: string; at: string }
export interface BoxHistory { id: string; product: string; rollId: string; activated: boolean; holder: string | null; holderPhone: string | null; heldSince: string | null; transfers: BoxTransfer[] }
export interface TransferInput { serials: string[]; toHolder?: string | null; toPhone?: string | null; note?: string | null; expectedFrom?: string | null; toWarehouse?: boolean }
export interface TransferResult { batchId: string; toHolder: string | null; toPhone: string | null; transfers: BoxTransfer[] }
export function transferBoxes(data: TransferInput) {
  return apiFetch<TransferResult>("/api/admin/box-labels/transfers", { method: "POST", body: JSON.stringify(data) });
}
export function boxHistory(serial: string) { return apiFetch<BoxHistory>(`/api/admin/box-labels/${encodeURIComponent(serial.trim())}/transfers`); }
export interface HolderSummary { holder: string | null; phone: string | null; boxes: number }
export function boxHolders() { return apiFetch<{ holders: HolderSummary[] }>("/api/admin/box-labels/holders"); }
export function saveLabelSite(siteUrl: string) {
  return apiFetch("/api/admin/box-labels/site", { method: "POST", body: JSON.stringify({ siteUrl }) });
}
export function releaseRoll(id: string) {
  return apiFetch(`/api/admin/rolls/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ status: "shipped", note: "Released by admin for box QR activation" }) });
}

// ── Warranty card activation (public) ──
export interface ActivationInfo { id: string; product: string; type: "tint" | "ppf"; activated: boolean; filmYears: number; installYears: number | null; smsAvailable: boolean; released: boolean; warrantyCode: string | null; canRegister: boolean; remainingLengthM: number | null }
export interface ActivationResult { warranty: WarrantyPublic; remainingLengthM: number | null }
export function inspectBox(token: string) {
  return apiFetch<ActivationInfo>("/api/activation/inspect", { method: "POST", body: JSON.stringify({ token }) });
}
/** Requires a signed-in portal session; the warranty is registered to that verified mobile. */
export function completeActivation(token: string, registration: Record<string, unknown>, usedLengthM: number | null) {
  return apiFetch<ActivationResult>("/api/activation/complete", { method: "POST", body: JSON.stringify({ token, registration, usedLengthM }) });
}

// ── Public-site account: representatives, shops and customers sign in with mobile or email + code ──
export interface PortalUser {
  phone: string | null; email: string | null; name: string | null;
  firstName: string | null; lastName: string | null; country: string | null; city: string | null; job: string | null;
  /** Installer partner (همکار) status; only "approved" partners register warranties for customers. */
  partner?: "none" | "pending" | "approved" | "suspended"; shopName?: string | null;
}
export function portalMe() { return apiFetch<{ user: PortalUser | null }>("/api/portal/me"); }
export type PortalChannel = "sms" | "email";
/** Sends a sign-in code by SMS (mobile) or email. `identifier` is the mobile number or email address. */
export function portalSendCode(identifier: string, channel: PortalChannel = "sms") {
  const body = channel === "email" ? { email: identifier, channel } : { phone: identifier, channel };
  return apiFetch<{ challengeId: string; phone: string | null; email: string | null; channel: string; expiresAt: string; retryAfterSeconds: number }>(
    "/api/portal/otp", { method: "POST", body: JSON.stringify(body) });
}
export function portalLogin(challengeId: string, code: string) {
  return apiFetch<PortalUser>("/api/portal/login", { method: "POST", body: JSON.stringify({ challengeId, code }) });
}
export function portalLogout() { return apiFetch<{ ok: boolean }>("/api/portal/logout", { method: "POST" }); }

/** Saves the profile: first/last name, country, city and job. */
export function portalProfile(data: { name?: string; firstName?: string; lastName?: string; country?: string; city?: string; job?: string }) {
  return apiFetch<PortalUser>("/api/portal/profile", { method: "POST", body: JSON.stringify(data) });
}
/** Starts the bind challenge for a new mobile number or email address; complete it with portalBindVerify. */
export function portalBind(channel: PortalChannel, identifier: string) {
  return apiFetch<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }>(
    `/api/portal/bind-${channel === "email" ? "email" : "phone"}`, { method: "POST", body: JSON.stringify({ identifier }) });
}
export function portalBindVerify(channel: PortalChannel, challengeId: string, code: string) {
  return apiFetch<PortalUser>(`/api/portal/bind-${channel === "email" ? "email" : "phone"}/verify`, { method: "POST", body: JSON.stringify({ challengeId, code }) });
}

// ── Portal support tickets: each ticket carries the writer's verified identity ──
export interface PortalTicket { id: number; code: string; subject: string; status: "open" | "answered" | "closed"; createdAt: string; updatedAt: string; replies: number }
export function portalCreateTicket(subject: string, message: string) {
  return apiFetch<{ ticket: PortalTicket }>("/api/portal/tickets", { method: "POST", body: JSON.stringify({ subject, message }) });
}
export function portalTickets() { return apiFetch<{ tickets: PortalTicket[] }>("/api/portal/tickets"); }
export function portalTicketDetail(id: number) {
  return apiFetch<{ ticket: { id: number; code: string; subject: string; status: string; createdAt: string; updatedAt: string }; replies: AdminTicketReply[] }>(`/api/portal/tickets/${id}`);
}
export function portalTicketReply(id: number, message: string) {
  return apiFetch<{ ok: boolean }>(`/api/portal/tickets/${id}/replies`, { method: "POST", body: JSON.stringify({ message }) });
}

export interface HeldBox { id: string; product: string; type: "tint" | "ppf"; rollId: string; heldSince: string | null }
export function portalBoxes() { return apiFetch<{ boxes: HeldBox[]; outgoing: BoxTransfer[] }>("/api/portal/boxes"); }
export function portalTransfer(data: { serials: string[]; toPhone: string; toName?: string | null; note?: string | null }) {
  return apiFetch<TransferResult>("/api/portal/boxes/transfer", { method: "POST", body: JSON.stringify(data) });
}
export function portalWarranties() { return apiFetch<{ warranties: WarrantyPublic[] }>("/api/portal/warranties"); }

// ── Installer partners (همکاران) ──────────────────────────────────────────────

/** Sends a multipart form (photos) with the same cookie and CSRF header as apiFetch, letting the browser set the boundary. */
async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form, credentials: "include", cache: "no-store", headers: { "X-Requested-With": "fetch" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? (res.status === 413 ? "The photos are too large." : `HTTP ${res.status}`));
  }
  return res.json();
}

export type PhotoKind = "vehicle" | "film" | "vin" | "invoice" | "other";
// label = Persian (admin/counter), labelEn = the public site, which is in English.
export const PHOTO_KINDS: { kind: PhotoKind; label: string; labelEn: string; required: boolean }[] = [
  { kind: "vehicle", label: "خودرو با پلاک", labelEn: "Vehicle with plate", required: true },
  { kind: "film", label: "فیلم نصب‌شده", labelEn: "Installed film", required: true },
  { kind: "vin", label: "شماره شاسی (VIN)", labelEn: "VIN", required: false },
  { kind: "invoice", label: "فاکتور", labelEn: "Invoice", required: false },
  { kind: "other", label: "عکس دیگر", labelEn: "Other", required: false },
];
export type PhotoSet = Partial<Record<PhotoKind, Blob>>;
function photoForm(photos: PhotoSet) {
  const form = new FormData();
  for (const [kind, blob] of Object.entries(photos)) if (blob) form.append(kind, blob, `${kind}.jpg`);
  return form;
}

/** An approved installer registers the installation for the customer's mobile, with photos; it waits for the counter. */
export function installerActivation(token: string, registration: Record<string, unknown>, usedLengthM: number | null,
  customerPhone: string, country: string, photos: PhotoSet) {
  const form = photoForm(photos);
  form.append("data", JSON.stringify({ token, registration, usedLengthM, customerPhone, country }));
  return apiUpload<ActivationResult>("/api/activation/installer", form);
}
export function installerResendPhotos(code: string, photos: PhotoSet) {
  return apiUpload<{ status: string }>(`/api/activation/installer/${encodeURIComponent(code)}/photos`, photoForm(photos));
}
export function portalApplyPartner(data: { shopName: string; country?: string; city?: string }) {
  return apiFetch<PortalUser>("/api/portal/partner/apply", { method: "POST", body: JSON.stringify(data) });
}
export interface InstallerWarranty { warranty: WarrantyPublic; ownerPhoneMasked: string; country: string | null; photos: number; createdAt: string }
export function portalInstallerWarranties() { return apiFetch<{ warranties: InstallerWarranty[] }>("/api/portal/partner/warranties"); }

/** Shrinks a camera photo to at most 1600 px and re-encodes it as JPEG, so uploads stay small on mobile data. */
export async function compressPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("This file is not an image the browser can read.");
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not process the photo.")), "image/jpeg", quality));
}

export interface PartnerRow {
  id: number; phone: string; shopName: string | null; firstName: string | null; lastName: string | null;
  country: string | null; city: string | null; status: "pending" | "approved" | "suspended"; active: boolean;
  appliedAt: string | null; reviewedAt: string | null; warranties: number; pendingReview: number; rejected: number;
  lastInstall: string | null; cartons: number;
}
export function adminPartners(query: string) {
  return apiFetch<{ partners: PartnerRow[]; counts: Record<string, number> }>(`/api/admin/partners${query}`);
}
export function adminAddPartner(data: { phone: string; shopName: string; firstName?: string; lastName?: string; country?: string; city?: string }) {
  return apiFetch<{ id: number }>("/api/admin/partners", { method: "POST", body: JSON.stringify(data) });
}
export function adminPartnerStatus(id: number, status: "approved" | "suspended" | "none", reason?: string) {
  return apiFetch<{ status: string }>(`/api/admin/partners/${id}/status`, { method: "POST", body: JSON.stringify({ status, reason }) });
}

// ── Counter review of installation photos ──
export interface ReviewItem {
  ref: string; code: string; type: "tint" | "ppf"; status: "pending" | "active" | "rejected";
  make: string; model: string; plate: string; vin: string; installed: string; owner: string; ownerPhone: string;
  installer: string; installerPhone: string; country: string | null; usedLengthM: number | null; invoiceNumber: string;
  carton: string; product: string | null; areas: string[]; flags: string[]; reviewNote: string | null;
  createdAt: string; reviewedAt: string | null; cardSentAt: string | null; photos: { id: number; kind: PhotoKind; createdAt: string }[];
}
export function adminReviewList(status: "pending" | "active" | "rejected") {
  return apiFetch<{ pending: number; items: ReviewItem[] }>(`/api/admin/review?status=${status}`);
}
export function adminReviewDecide(ref: string, approve: boolean, note?: string) {
  return apiFetch<{ status: string }>("/api/admin/review/decision", { method: "POST", body: JSON.stringify({ ref, approve, note }) });
}
export function adminReviewResendCard(ref: string) {
  return apiFetch<{ cardSentAt: string }>("/api/admin/review/card-sms", { method: "POST", body: JSON.stringify({ ref }) });
}
/** The installation photos of one registration, by its opaque reference. */
export function adminWarrantyPhotos(ref: string) {
  return apiFetch<{ items: { id: number; kind: PhotoKind; createdAt: string }[] }>(`/api/admin/review/photos?ref=${encodeURIComponent(ref)}`);
}
/** Photos are fetched with the admin cookie and shown through object URLs. */
export async function adminReviewPhoto(id: number) {
  const res = await fetch(`${BASE}/api/admin/review/photos/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

