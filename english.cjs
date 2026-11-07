const fs=require('node:fs');
const file='dist/index.html';let s=fs.readFileSync(file,'utf8');
const replacements={
'lang="fa" dir="rtl"':'lang="en" dir="ltr"',
'طرح فارسی سان ویژن؛ معرفی فیلم‌های محافظ بدنه، شیشه خودرو و معماری':'Sun Vision Film Factory. Explore paint protection, automotive window tint and architectural films.',
'سان ویژن | محافظت، در روشن‌ترین شکل آن':'Sun Vision Film Factory | Paint Protection & Window Films',
'سان ویژن، خانه':'Sun Vision home','همکاری با ما':'Become a partner','فیلم‌های خودرو':'Car films','فیلم‌های معماری':'Architectural films','کارخانه':'Factory','تماس با ما':'Contacts','باز کردن منو':'Open menu',
'فناوری پیشرفته. محافظت ماندگار.':'PAINT PROTECTION & WINDOW FILMS',
'یک لایه اطمینان.<br><span>یک دنیا تفاوت.</span>':'Sun Vision<br><span>Film Factory.</span>',
'زیبایی را حفظ کنید.<br>با فیلم‌های محافظ بدنه و شیشه،<br>برای هر مسیر آماده باشید.':'High-quality polyurethane, tinting,<br>and architectural films.<br>Designed to protect. Made to last.',
'کشف محصولات':'Explore our films','خودروی لکسوس با پوشش محافظ بدنه':'Lexus with Sun Vision paint protection film','شفافیت بی‌نقص':'Invisible protection','با سان ویژن آشنا شوید':'Discover Sun Vision',
'محافظت از بدنه':'Paint protection','شفافیت ماندگار':'Lasting clarity','کنترل نور و گرما':'Solar control','زیبایی در جزئیات':'Comfort & protection',
'01 / محصولات ما':'01 / OUR COLLECTION','محافظت، متناسب با سبک شما.':'Premium protection. Exceptional clarity.',
'فیلتر محصولات':'Filter products','همه محصولات':'All films','محافظ بدنه':'Premium PPF','فیلم شیشه':'Window films',
'فیلم محافظ بدنه دومینیت':'DOMINATE paint protection film','فیلم محافظ فانتوم':'PHANTOM paint protection film','مجموعه فیلم‌های سان ویژن':'MATRIX paint protection film',
'جزئیات دومینیت':'Explore DOMINATE','جزئیات فانتوم':'Explore PHANTOM','جزئیات فیلم شیشه':'Explore MATRIX',
'پوشش محافظ بدنه برای حفظ ظاهر خودرو در برابر خط‌وخش و آسیب‌های روزمره.':'Premium-class PPF. Protection from chemical exposure and mechanical damage, with a finish that preserves your car’s appearance.',
'محافظتی نامرئی با ظاهری شفاف؛ برای زمانی که زیبایی اصلی خودرو اهمیت دارد.':'Easy to apply and maintain. Preserve your car’s original appearance and protect its finish from scratches and chips.',
'راهکارهای کنترل نور و گرما برای شیشه خودرو؛ انتخابی برای آسایش بیشتر در مسیر.':'Durable, self-healing paint protection film. Designed to protect your vehicle from scratches and UV exposure.',
'بررسی محصول':'Learn more','محتوا و دسته‌بندی این نسخه نمایشی است؛ مشخصات نهایی هر محصول باید پیش از سفارش تأیید شود.':'Explore the collection. Contact us for detailed specifications and product availability.',
'02 / درباره سان ویژن':'02 / SUN VISION FILM FACTORY','از دل فناوری،<br>برای دنیای واقعی.':'Modern production.<br>Comfort and protection.',
'سان ویژن تولیدکنندهٔ فیلم‌های پلی‌یورتان، شیشه خودرو و معماری است. این مجموعه با تمرکز بر تولید مدرن، راهکارهایی برای محافظت از سطوح و مدیریت نور ارائه می‌کند.':'We specialize in the production of high-quality polyurethane, tinting, and architectural films designed for a wide range of applications. Our manufacturing facility combines innovation with experience to create durable, stylish solutions.',
'شروع یک همکاری':'Apply for partnership','لایه‌ای سبک.<br>اثری ماندگار.':'A lighter layer.<br>A lasting difference.',
'03 / فیلم‌های معماری':'03 / ARCHITECTURAL FILMS','نور بیشتر.<br><span>آسایش بیشتر.</span>':'A better view.<br><span>A better space.</span>',
'برای فضاهایی که در آن‌ها زندگی و کار می‌کنید؛ فیلم‌های معماری، آینه‌ای و دکوراتیو، به طراحی فضا و تنظیم نور کمک می‌کنند.':'Transform the places where you live and work. Explore architectural, mirror and decorative films for privacy, solar control and a distinctive finish.',
'مشاوره برای فضای شما':'Find your architectural film','تصویر انتزاعی پنجره‌های معماری':'Architectural glazing illustration',
'قدم بعدی را با هم برداریم':'LET’S BUILD SOMETHING TOGETHER','آینده‌ای شفاف‌تر،<br>از یک گفت‌وگو شروع می‌شود.':'Your next chapter.<br>Our shared vision.',
'برای آشنایی با محصولات و فرصت‌های همکاری، درخواست خود را آماده کنید.':'Discover our range of films and partnership opportunities. Prepare your inquiry below.',
'فرم نمایشی است و اطلاعاتی به سرور ارسال نمی‌کند.':'Demo form. Your information is not sent or stored.',
'نام و نام خانوادگی':'Full name','نام شما':'Your full name','شماره تماس شما':'Your phone number','شماره تماس':'Phone number','زمینهٔ درخواست':'I’m interested in','دریافت کاتالوگ محصولات':'Product catalog & pricing','همکاری و نمایندگی':'Partnership & distribution','آماده‌سازی درخواست':'Prepare inquiry',
'طرح HTML الهام‌گرفته از Sun Vision · نسخهٔ نمایشی فارسی':'Sun Vision inspired HTML concept · Independent demo',
'بازگشت به بالا':'Back to top','بستن':'Close','درخواست اطلاعات بیشتر':'Request more information'};
for(const [a,b]of Object.entries(replacements))s=s.split(a).join(b);
s=s.replace('data-category="glass"','data-category="ppf"').replaceAll('WINDOW FILMS','MATRIX').replace('MATRIX / DEMO','SELF-HEALING PPF');
s=s.replace('data-filter="glass">Window films','data-filter="glass">Window films');
// Keep a separate window-film card so every filter has a meaningful result.
const extra=`<article class="product window-product" data-category="glass"><div class="product-image window-art"><div class="window-pane"></div><span>SOLAR CONTROL</span><button data-product="WINDOW FILMS" aria-label="Explore window films">↗</button></div><div class="product-title"><h3>WINDOW FILMS</h3><span>04</span></div><p>Tinting and athermal film options for automotive glass. Explore the right balance of light, privacy and comfort.</p><button class="text-link" data-product="WINDOW FILMS">Learn more <span>→</span></button></article>`;
s=s.replace('</div><p class="caption">',extra+'</div><p class="caption">');
fs.writeFileSync(file,s);
