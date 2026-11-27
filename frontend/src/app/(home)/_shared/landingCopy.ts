/** Landing-page copy. English lives at "/", Persian at "/fa" and Arabic at "/ar". */
export const LANDING_LANGS = ["en", "fa", "ar"] as const;
export type LandingLang = (typeof LANDING_LANGS)[number];
export const isLandingLang = (value: string): value is LandingLang => (LANDING_LANGS as readonly string[]).includes(value);
export const landingHref = (lang: LandingLang) => (lang === "en" ? "/" : `/${lang}`);
export const landingDir = (lang: LandingLang) => (lang === "en" ? "ltr" : "rtl");

/** Shown in the header language switch, each in its own language. */
export const LANG_NAMES: Record<LandingLang, string> = { en: "English", fa: "فارسی", ar: "العربية" };
export const LANG_SHORT: Record<LandingLang, string> = { en: "EN", fa: "فا", ar: "ع" };

type Stat = [value: string, label: string];
type Fact = [value: string, label: string, text: string];
type Card = { tag: string; title: string; text: string };
type Action = [title: string, text: string];

export type LandingCopy = {
  meta: { title: string; description: string; ogLocale: string };
  header: {
    products: string; warranty: string; about: string;
    activate: string; check: string; verify: string; policy: string;
    dealer: string; contacts: string; openMenu: string; viewAll: string; colors: string;
    categories: Record<string, string>; tagline: string; language: string;
  };
  footer: { contacts: string; policy: string; check: string; verify: string; dealer: string; note: string };
  hero: {
    kicker: string; brand: string; title: string; text: string;
    activate: string; check: string; carAlt: string;
    glass: [string, string]; body: [string, string];
    stats: Stat[]; scroll: string;
  };
  marquee: string[];
  intro: {
    title: [string, string];
    features: [string, string][];
    more: string; boxAlt: string; boxCaption: string;
  };
  facts: { title: string; text: string; items: Fact[] };
  warranties: {
    title: string; text: [string, string, string];
    cards: Card[]; learnMore: string;
    digitalBadge: [string, string, string]; caption: string;
  };
  story: {
    sheet: string; sheetTitle: [string, string]; caption: string;
    eyebrow: string; title: [string, string]; intro: [string, string];
    features: string[]; dealer: string;
  };
  registration: { title: [string, string]; text: string; actions: Action[] };
  contact: {
    title: string; text: [string, string]; button: string;
    visual: [string, string]; visualText: string;
  };
};

const en: LandingCopy = {
  meta: {
    title: "Solarzed Window Films | Automotive Tint & PPF Warranty",
    description: "Solarzed premium automotive window film and paint protection film. Register your installation, verify your warranty certificate, and explore window tint and PPF series.",
    ogLocale: "en_US",
  },
  header: {
    products: "PRODUCTS", warranty: "WARRANTY", about: "ABOUT",
    activate: "Activate a warranty", check: "Check warranty", verify: "Authenticity check", policy: "Warranty policy",
    dealer: "DEALER SIGN-IN ↗", contacts: "CONTACTS", openMenu: "Open menu", viewAll: "View all products →", colors: "colors",
    categories: { tint: "Window Tint", ppf: "PPF", "color-ppf": "Color PPF" },
    tagline: "WINDOW FILMS & PAINT PROTECTION", language: "Language",
  },
  footer: {
    contacts: "CONTACTS", policy: "WARRANTY POLICY", check: "CHECK WARRANTY",
    verify: "AUTHENTICITY CHECK", dealer: "DEALER SIGN-IN", note: "SOLARZED · DESIGN PRESENTATION",
  },
  hero: {
    kicker: "WINDOW FILMS & PAINT PROTECTION", brand: "Solarzed", title: "Window Films",
    text: "Premium automotive film, installed with precision — and a verified digital record for every window you tint.",
    activate: "Activate warranty", check: "Check warranty", carAlt: "Vehicle with Solarzed window film",
    glass: ["UV WINDOW FILM", "Glass protection"], body: ["CERAMIC COATING", "Body protection"],
    stats: [["3", "Warranty areas"], ["5", "Windows mapped"], ["1", "Tracking code"], ["24/7", "Online lookup"]],
    scroll: "Scroll to content",
  },
  marquee: ["FILM WARRANTY", "INSTALLATION WARRANTY", "DIGITAL CERTIFICATE", "TRACEABLE SERIALS", "FIVE-WINDOW MAP", "DEALER NETWORK"],
  intro: {
    title: ["Window films for your vehicle.", "A clear record for every installation."],
    features: [
      ["Comfort and protection", "Explore automotive window tint and keep the film model, Serial Number and installed glass documented for your vehicle."],
      ["Traceable installation", "From the left and right side windows to the rear windshield, record exactly where your Solarzed film was installed and who completed the work."],
    ],
    more: "Learn more", boxAlt: "Solarzed original product packaging", boxCaption: "Solarzed original packaging",
  },
  facts: {
    title: "A closer look at Solarzed", text: "Product, installation and documentation — connected.",
    items: [
      ["3", "Warranty areas", "Film, installation and digital documentation"],
      ["5", "Windows", "Choose the exact glass that was tinted"],
      ["1", "Tracking code", "Find your registered installation record"],
      ["1", "Warranty", "One warranty for every roll, shown on one card"],
    ],
  },
  warranties: {
    title: "The Solarzed Warranty",
    text: ["Three connected parts.", "Clear terms for the film, the installation", "and the record that brings them together."],
    cards: [
      { tag: "01 / FILM", title: "Film Warranty", text: "For confirmed product defects under normal use, assessed against the applicable film model and approved warranty terms." },
      { tag: "02 / INSTALLATION", title: "Authorised Installation", text: "Every installation is registered by an approved Solarzed installer, with photos reviewed before the warranty becomes active." },
      { tag: "03 / DIGITAL", title: "Digital Warranty", text: "A connected certificate for the product, vehicle, original customer and warranty status — with one place to find the details." },
    ],
    learnMore: "LEARN MORE",
    digitalBadge: ["DIGITAL", "WARRANTY", "YOUR VEHICLE. YOUR INSTALLATION RECORD."],
    caption: "Proposed policy v1.0. Product-specific coverage periods remain subject to approval. Registration does not by itself activate warranty coverage.",
  },
  story: {
    sheet: "SZ / WINDOW FILM", sheetTitle: ["Clarity,", "layer by layer."], caption: "THE DETAILS MAKE THE DIFFERENCE.",
    eyebrow: "02 / PRECISE BY DESIGN", title: ["Not just the car.", "The exact glass."],
    intro: ["Left front. Right rear. The back windshield. The hood and every panel.", "Every installation is different. Record exactly what was covered, and keep the complete picture in one place."],
    features: ["Interactive selection of all five windows", "Twelve-panel map for paint protection film", "Vehicle, VIN, product and installer details"],
    dealer: "Dealer sign-in",
  },
  registration: {
    title: ["Your installation.", "Clearly registered."], text: "Choose your next step.",
    actions: [
      ["Activate warranty", "Scan the card inside your Solarzed box"],
      ["Check warranty", "Find your installation by code"],
      ["My account", "Cartons, transfers & your warranties"],
    ],
  },
  contact: {
    title: "Let’s get in touch", text: ["For product information, installation records", "and warranty guidance."],
    button: "CONTACT SOLARZED", visual: ["WINDOW FILMS", "WITH A CLEAR RECORD."], visualText: "Film · Installation · Digital warranty",
  },
};

const fa: LandingCopy = {
  meta: {
    title: "فیلم‌های شیشه سولارزد | گارانتی فیلم شیشه و PPF خودرو",
    description: "فیلم شیشه و فیلم محافظ رنگ (PPF) ممتاز خودرو سولارزد. نصب خود را ثبت کنید، گواهی گارانتی را بررسی کنید و سری‌های فیلم شیشه و PPF را ببینید.",
    ogLocale: "fa_IR",
  },
  header: {
    products: "محصولات", warranty: "گارانتی", about: "درباره ما",
    activate: "فعال‌سازی گارانتی", check: "استعلام گارانتی", verify: "بررسی اصالت کالا", policy: "شرایط گارانتی",
    dealer: "ورود نمایندگان ↗", contacts: "تماس با ما", openMenu: "باز کردن منو", viewAll: "مشاهده همه محصولات ←", colors: "رنگ",
    categories: { tint: "فیلم شیشه", ppf: "PPF", "color-ppf": "PPF رنگی" },
    tagline: "فیلم شیشه و محافظ رنگ خودرو", language: "زبان",
  },
  footer: {
    contacts: "تماس با ما", policy: "شرایط گارانتی", check: "استعلام گارانتی",
    verify: "بررسی اصالت کالا", dealer: "ورود نمایندگان", note: "سولارزد · نسخه نمایشی طراحی",
  },
  hero: {
    kicker: "فیلم شیشه و محافظ رنگ خودرو", brand: "سولارزد", title: "فیلم‌های شیشه",
    text: "فیلم ممتاز خودرو با نصب دقیق — و یک سابقه دیجیتال تأییدشده برای هر شیشه‌ای که فیلم می‌شود.",
    activate: "فعال‌سازی گارانتی", check: "استعلام گارانتی", carAlt: "خودرو با فیلم شیشه سولارزد",
    glass: ["فیلم ضد UV شیشه", "محافظت از شیشه"], body: ["پوشش سرامیک", "محافظت از بدنه"],
    stats: [["3", "بخش گارانتی"], ["5", "شیشه ثبت‌شده"], ["1", "کد پیگیری"], ["24/7", "استعلام آنلاین"]],
    scroll: "رفتن به محتوا",
  },
  marquee: ["گارانتی فیلم", "نصب مجاز", "گواهی دیجیتال", "رول‌های قابل ردیابی", "نقشه پنج شیشه", "شبکه نمایندگان"],
  intro: {
    title: ["فیلم شیشه برای خودروی شما.", "سابقه‌ای شفاف برای هر نصب."],
    features: [
      ["آسایش و محافظت", "فیلم‌های شیشه خودرو را بشناسید و مدل فیلم، Serial Number و شیشه‌های فیلم‌شده خودروی خود را ثبت‌شده نگه دارید."],
      ["نصب قابل ردیابی", "از شیشه‌های جانبی چپ و راست تا شیشه عقب، دقیقاً ثبت کنید فیلم سولارزد روی کدام شیشه نصب شده و چه کسی آن را نصب کرده است."],
    ],
    more: "بیشتر بدانید", boxAlt: "بسته‌بندی اصلی محصول سولارزد", boxCaption: "بسته‌بندی اصلی سولارزد",
  },
  facts: {
    title: "نگاهی دقیق‌تر به سولارزد", text: "محصول، نصب و مستندات — به هم پیوسته.",
    items: [
      ["3", "بخش گارانتی", "فیلم، نصب و مستندات دیجیتال"],
      ["5", "شیشه", "شیشه‌ای را که دقیقاً فیلم شده انتخاب کنید"],
      ["1", "کد پیگیری", "سابقه نصب ثبت‌شده خود را پیدا کنید"],
      ["1", "گارانتی", "یک گارانتی برای هر رول، روی یک کارت"],
    ],
  },
  warranties: {
    title: "گارانتی سولارزد",
    text: ["سه بخش به هم پیوسته.", "شرایطی روشن برای فیلم، نصب", "و سابقه‌ای که این دو را به هم پیوند می‌دهد."],
    cards: [
      { tag: "۰۱ / فیلم", title: "گارانتی فیلم", text: "برای عیوب تأییدشده محصول در شرایط استفاده عادی، بر اساس مدل فیلم مربوطه و شرایط گارانتی مصوب." },
      { tag: "۰۲ / نصب", title: "نصب مجاز", text: "هر نصب را نصاب تأییدشده سولارزد ثبت می‌کند و عکس‌های آن پیش از فعال شدن گارانتی بررسی می‌شود." },
      { tag: "۰۳ / دیجیتال", title: "گارانتی دیجیتال", text: "گواهی‌ای یکپارچه برای محصول، خودرو، مشتری اصلی و وضعیت گارانتی — با یک مرجع برای یافتن همه جزئیات." },
    ],
    learnMore: "بیشتر بدانید",
    digitalBadge: ["گارانتی", "دیجیتال", "خودروی شما. سابقه نصب شما."],
    caption: "پیش‌نویس شرایط، نسخه ۱٫۰. دوره‌های پوشش هر محصول هنوز در انتظار تأیید است. ثبت نصب به‌تنهایی گارانتی را فعال نمی‌کند.",
  },
  story: {
    sheet: "SZ / فیلم شیشه", sheetTitle: ["شفافیت،", "لایه به لایه."], caption: "جزئیات است که تفاوت می‌سازد.",
    eyebrow: "۰۲ / دقت در طراحی", title: ["نه فقط خودرو.", "دقیقاً همان شیشه."],
    intro: ["جلو چپ. عقب راست. شیشه عقب. کاپوت و تک‌تک قطعات بدنه.", "هر نصب متفاوت است. دقیقاً ثبت کنید چه بخشی پوشش داده شده و تصویر کامل را در یک جا نگه دارید."],
    features: ["انتخاب تعاملی هر پنج شیشه", "نقشه دوازده‌قطعه‌ای برای فیلم محافظ رنگ", "مشخصات خودرو، VIN، محصول و نصاب"],
    dealer: "ورود نمایندگان",
  },
  registration: {
    title: ["نصب شما.", "به‌روشنی ثبت‌شده."], text: "قدم بعدی را انتخاب کنید.",
    actions: [
      ["فعال‌سازی گارانتی", "کارت داخل جعبه سولارزد را اسکن کنید"],
      ["استعلام گارانتی", "نصب خود را با کد پیدا کنید"],
      ["حساب من", "کارتن‌ها، انتقال‌ها و گارانتی‌های شما"],
    ],
  },
  contact: {
    title: "با ما در تماس باشید", text: ["برای اطلاعات محصول، سوابق نصب", "و راهنمایی درباره گارانتی."],
    button: "تماس با سولارزد", visual: ["فیلم شیشه", "با سابقه‌ای شفاف."], visualText: "فیلم · نصب · گارانتی دیجیتال",
  },
};

const ar: LandingCopy = {
  meta: {
    title: "أفلام سولارزد للنوافذ | ضمان تظليل السيارات وأفلام PPF",
    description: "أفلام سولارزد الممتازة لنوافذ السيارات وأفلام حماية الطلاء (PPF). سجّل تركيبك، وتحقّق من شهادة الضمان، واستكشف سلاسل أفلام التظليل وPPF.",
    ogLocale: "ar_AR",
  },
  header: {
    products: "المنتجات", warranty: "الضمان", about: "من نحن",
    activate: "تفعيل الضمان", check: "الاستعلام عن الضمان", verify: "التحقق من الأصالة", policy: "شروط الضمان",
    dealer: "دخول الوكلاء ↗", contacts: "اتصل بنا", openMenu: "فتح القائمة", viewAll: "عرض جميع المنتجات ←", colors: "ألوان",
    categories: { tint: "أفلام النوافذ", ppf: "PPF", "color-ppf": "PPF ملوّن" },
    tagline: "أفلام النوافذ وحماية الطلاء", language: "اللغة",
  },
  footer: {
    contacts: "اتصل بنا", policy: "شروط الضمان", check: "الاستعلام عن الضمان",
    verify: "التحقق من الأصالة", dealer: "دخول الوكلاء", note: "سولارزد · عرض تصميمي",
  },
  hero: {
    kicker: "أفلام النوافذ وحماية الطلاء", brand: "سولارزد", title: "أفلام النوافذ",
    text: "أفلام سيارات ممتازة تُركَّب بدقة — مع سجل رقمي موثَّق لكل نافذة تقوم بتظليلها.",
    activate: "تفعيل الضمان", check: "الاستعلام عن الضمان", carAlt: "سيارة بأفلام نوافذ سولارزد",
    glass: ["فيلم نوافذ ضد الأشعة فوق البنفسجية", "حماية الزجاج"], body: ["طلاء سيراميك", "حماية الهيكل"],
    stats: [["3", "مجالات ضمان"], ["5", "نوافذ موثّقة"], ["1", "رمز تتبّع"], ["24/7", "استعلام عبر الإنترنت"]],
    scroll: "الانتقال إلى المحتوى",
  },
  marquee: ["ضمان الفيلم", "تركيب معتمد", "شهادة رقمية", "لفّات قابلة للتتبّع", "خريطة النوافذ الخمس", "شبكة الوكلاء"],
  intro: {
    title: ["أفلام نوافذ لسيارتك.", "سجل واضح لكل تركيب."],
    features: [
      ["الراحة والحماية", "اكتشف أفلام تظليل السيارات واحتفظ بطراز الفيلم ورقم اللفّة والزجاج المُظلَّل موثّقة لسيارتك."],
      ["تركيب قابل للتتبّع", "من النوافذ الجانبية اليسرى واليمنى إلى الزجاج الخلفي، سجّل بدقة أين رُكِّب فيلم سولارزد ومن قام بالتركيب."],
    ],
    more: "اعرف المزيد", boxAlt: "العبوة الأصلية لمنتج سولارزد", boxCaption: "عبوة سولارزد الأصلية",
  },
  facts: {
    title: "نظرة أقرب إلى سولارزد", text: "المنتج والتركيب والتوثيق — مترابطة.",
    items: [
      ["3", "مجالات ضمان", "الفيلم والتركيب والتوثيق الرقمي"],
      ["5", "نوافذ", "اختر الزجاج الذي تم تظليله بالضبط"],
      ["1", "رمز تتبّع", "اعثر على سجل التركيب المسجَّل"],
      ["1", "ضمان", "ضمان واحد لكل لفّة على بطاقة واحدة"],
    ],
  },
  warranties: {
    title: "ضمان سولارزد",
    text: ["ثلاثة أجزاء مترابطة.", "شروط واضحة للفيلم وللتركيب", "وللسجل الذي يجمع بينهما."],
    cards: [
      { tag: "01 / الفيلم", title: "ضمان الفيلم", text: "لعيوب المنتج المؤكَّدة في ظروف الاستخدام العادي، وفق طراز الفيلم المعني وشروط الضمان المعتمدة." },
      { tag: "02 / التركيب", title: "تركيب معتمد", text: "يسجّل كلَّ تركيب مركّبٌ معتمد من سولارزد، وتُراجَع صوره قبل تفعيل الضمان." },
      { tag: "03 / الرقمي", title: "الضمان الرقمي", text: "شهادة موحَّدة للمنتج والسيارة والعميل الأصلي وحالة الضمان — مع مكان واحد للعثور على كل التفاصيل." },
    ],
    learnMore: "اعرف المزيد",
    digitalBadge: ["الضمان", "الرقمي", "سيارتك. سجل تركيبك."],
    caption: "مسودة الشروط، الإصدار 1.0. لا تزال فترات التغطية الخاصة بكل منتج قيد الاعتماد. التسجيل وحده لا يفعّل الضمان.",
  },
  story: {
    sheet: "SZ / فيلم النوافذ", sheetTitle: ["وضوح،", "طبقةً تلو الأخرى."], caption: "التفاصيل هي ما يصنع الفرق.",
    eyebrow: "02 / دقة في التصميم", title: ["ليست السيارة فقط.", "بل الزجاج بعينه."],
    intro: ["الأمامي الأيسر. الخلفي الأيمن. الزجاج الخلفي. غطاء المحرك وكل لوح.", "كل تركيب مختلف. سجّل بدقة ما تمت تغطيته، واحتفظ بالصورة الكاملة في مكان واحد."],
    features: ["اختيار تفاعلي للنوافذ الخمس", "خريطة من اثني عشر لوحًا لفيلم حماية الطلاء", "بيانات السيارة ورقم الهيكل (VIN) والمنتج والمركِّب"],
    dealer: "دخول الوكلاء",
  },
  registration: {
    title: ["تركيبك.", "مسجَّل بوضوح."], text: "اختر خطوتك التالية.",
    actions: [
      ["تفعيل الضمان", "امسح البطاقة الموجودة داخل علبة سولارزد"],
      ["الاستعلام عن الضمان", "اعثر على تركيبك بواسطة الرمز"],
      ["حسابي", "الكراتين والتحويلات وضماناتك"],
    ],
  },
  contact: {
    title: "تواصل معنا", text: ["لمعلومات المنتجات وسجلات التركيب", "وإرشادات الضمان."],
    button: "تواصل مع سولارزد", visual: ["أفلام نوافذ", "بسجل واضح."], visualText: "الفيلم · التركيب · الضمان الرقمي",
  },
};

export const LANDING: Record<LandingLang, LandingCopy> = { en, fa, ar };
