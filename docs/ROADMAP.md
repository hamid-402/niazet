# هسته — نقشه‌راه محصول «نیازت با ما»

## راهنمای ثابت مسیرها — ۲۰۲۶-۰۹-۱۰

برای جلوگیری از اشتباه شمارهٔ مراحل، هر گزارش باید نام مسیر را هم بنویسد. فایل‌های قبلی تغییر نام نمی‌دهند تا لینک‌ها و تاریخچه حفظ شوند؛ سند موازی یا نسخهٔ پشتیبان ساخته نمی‌شود.

| نام ثابت | مرجع | وضعیت فعلی | شرط بسته‌شدن |
| --- | --- | --- | --- |
| هسته | همین سند؛ فازهای ۰ تا ۹ | ۱۱۹/۱۲۳؛ باز | تکمیل و پذیرش موارد محصول؛ موارد تعویقی، تکمیل محسوب نمی‌شوند |
| مدار | [ORBIT_IMPLEMENTATION_ROADMAP.md](ORBIT_IMPLEMENTATION_ROADMAP.md)؛ M0 تا M5 | M0 و M1 کامل؛ M2 بستهٔ سوم باقی؛ M3 تا M5 باقی | انتقال بدون کاهش قابلیت و پذیرش نهایی همهٔ صفحات و نقش‌ها |
| پایداری | چک‌لیست زیر در همین سند | در حال اجرا؛ پیش‌نیاز ادامهٔ مدار | رفع/تعیین تکلیف مستند ایرادها و پذیرش فنی آخرین کد |

درخواست مالک برای «بستن همهٔ نقشه‌راه‌ها» هدف اجراست، نه مجوز علامت‌زدن کار ناقص. اتصال زندهٔ ارائه‌دهندگان و AI همچنان با تصمیم قبلی مالک تعویق دارند. این جدول خلاصهٔ وضعیت است؛ شمارش ۱۲۳ مورد محصول تغییر نمی‌کند.

### پایداری — چک‌لیست رفع ایراد و پذیرش

- [x] P1: رفع ناسازگاری CSS توسعه و پذیرش HMR با تست مرورگر؛ بدون مخفی‌کردن خطاهای کنسول.
  - ۲۰۲۶-۰۹-۱۰: مرز ۴۰۴ با code-splitting و SSR، و Webpack فقط برای dev. چهار صفحه بدون هشدار preload یا خطای JS و بدون بازاتصال در بازهٔ پایدار؛ تغییر و برگشت واقعی CSS بدون خطای missing-link و بدون reload موفق. ۴۰۴ با منو و لوگو با/بدون JS حفظ شد. تکرار بی‌وقفهٔ socket مرورگر قبلی مستقلاً بازتولید نشد؛ تب قدیمی پس از restart باید تازه شود. شرح و دستور تست در `LOCAL_RUNTIME.md` است.
- [x] P2: تفکیک ۴۰۱ اولیه از شکست نهایی نشست و پذیرش ورود/تمدید/خروج در مرورگر.
  - حساب نمایشی مشتری: ورود ۲۰۰؛ reload سپس ۴۰۱ اولیه، refresh و me با ۲۰۰؛ سفارش‌ها، اعلان‌ها و تنظیمات اعلان همگی ۲۰۰؛ خروج ۲۰۰ و بازگشت به login. هیچ guard یا سیاست نشست تغییر نکرد. این آزمون حساب نمایشی است، نه اثبات وضعیت نشست قبلی مرورگر مالک.
- [ ] P3: رفع یا تعیین تکلیف هشدارهای ابزار توسعه و warning دانلود امن با شواهد جدید.
- [ ] P4: پذیرش محلی نسخهٔ نهایی، CI آنلاین آخرین commit و ثبت مرز اتصال‌های زندهٔ تعویقی.

تکمیل این چک‌لیست جایگزین M5 مدار یا چهار مورد باز هسته نیست؛ نتایج مشترک با ارجاع ثبت می‌شوند، نه با ادعای دو بار انجام کار.

این سند منبع حقیقت اجرای پروژه است. تعریف محصول و قواعد دامنه در
`docs/specs/architecture-v4.md`، جدول قطعی وضعیت و مالی در
`docs/specs/addendum-state-machine-ledger.md` و جزئیات صفحات در
`docs/specs/ui-pages-blueprint-v2.md` قرار دارد. هیچ قابلیت آن اسناد با این نقشه حذف
نمی‌شود؛ این سند ترتیب اجرا و معیار تکمیل واقعی را مشخص می‌کند.

## تصمیم‌های قطعی

- اجرای طرح تأییدشدهٔ «مدار» در شش مرحله و با قرارداد عدم حذف در [ORBIT_IMPLEMENTATION_ROADMAP.md](ORBIT_IMPLEMENTATION_ROADMAP.md) دنبال می‌شود؛ این مسیر، وضعیت و موارد باز نقشه‌راه محصول را جایگزین نمی‌کند.

- مخزن مرجع و محل تمام تغییرات: `C:\Users\hamid.kazemi\Desktop\niazat-app`
- Git مرجع: مخزن شخصی `https://github.com/hamid-402/niazet.git`
- محصول یک `Managed Service Platform` گسترده است؛ حوزه دانشگاهی و پژوهشی یکی از مخاطبان
  مهم آن است، نه تمام دامنه محصول.
- چهار role رسمی فقط `customer`، `executor`، `support` و `admin` هستند؛ سطح ادمین با
  `admin_scope` و قابلیت دوگانه مشتری/مجری با `user_capabilities` کنترل می‌شود.
- فاز اول با کارکنان داخلی انجام می‌شود. مشتری فقط نام نمایشی و کد قابل ارجاع مسئول، تیم و
  QC را می‌بیند، نه پروفایل و اطلاعات داخلی کارکنان.
- پالت اصلی «لاجورد و عسل» و فقط دو تم روشن و تیره است. زیرساخت Token، ماندگاری انتخاب و
  جلوگیری از Flash تم اشتباه باید کامل باقی بماند.
- Hero متن‌محور است و تصویر بزرگ، Screenshot بزرگ یا Slider ندارد.
- از Vidaverse فقط الگوهای مفید Stepper، Use Case، Assurance، Final CTA، Timeline و
  دسترس‌پذیری گرفته می‌شود؛ از آواجنرال فقط ریتم بخش‌ها و جداکننده هندسی محدود.
- رابط باید «خلوت در نگاه اول، کامل با تعامل» باشد؛ قابلیت‌ها در Tab، Drawer، Accordion،
  Action Menu و Modal قرار می‌گیرند، نه اینکه حذف شوند.
- `_runtime` محل فایل‌های حجیم و قابل بازسازی است و هرگز بخشی از سورس یا Git نیست.
- وضعیت یک مورد فقط پس از پیاده‌سازی، تست و بازبینی واقعی به «انجام‌شده» تغییر می‌کند.

## خط مبنا — قابلیت‌های موجود که باید حفظ شوند

### ادامهٔ طراحی — ۲۰۲۶-۰۹-۰۹

- اصلاح نهایی نشان و تم طبق درخواست مالک: نقطهٔ طلایی نوشته روی «ن» قرار گرفت و نقطهٔ قبلی آن روی «ز» منتقل شد؛ رنگ سرمه‌ای/فیروزه‌ای/طلایی نماد در هر دو تم یکسان است و فقط نوشته روشن می‌شود. دکمهٔ تم با کلیک مستقیم، Enter یا Space بین دو تم جابه‌جا می‌شود و منو ندارد. ۱۹۲ screenshot و Axe موفق و تمام snapshotهای فشرده عیناً با baseline قبلی منطبق‌اند؛ ذخیرهٔ انتخاب، focus و تعویض تم در منوی موبایل آزموده شد. فایل اصلی لوگو، backend/auth، داده و شمارش مراحل تغییر نکرده‌اند؛ CI آنلاین هنوز تأیید نشده است.
- اصلاح لوگو طبق درخواست مالک: کادر روشن حذف شد؛ رنگ اصلی در تم روشن و جوهر روشن‌تر همراه طلایی/فیروزه‌ای در تم تیره، مستقیماً روی سطح سایت نمایش داده می‌شود. فایل/فرم لوگو بازطراحی نشده و تمام جایگاه‌ها از همان جزء مشترک استفاده می‌کنند. ۱۹۲ حالت مرورگر/Axe موفق و شاخص‌های چیدمان عیناً با baseline قبلی منطبق‌اند؛ تعویض تم و حالت بدون JavaScript نیز آزموده شد.
- لوگوی ارسالی مالک بدون تغییر رنگ/شکل در هدر عمومی، پنل‌ها و منوی موبایل و فوتر جای گرفت. بستهٔ دوم M2 نیز با حفظ عین محتوای پنج سناریو، چهار نمونه خروجی، پنج تعهد، شش مرحله و شش FAQ تکمیل شد؛ حرکت محدود و قابل‌توقف، دو تم و شرح شش مرحله بدون JavaScript اضافه/حفظ شدند.
- پذیرش جدید: ۱۹۲ screenshot و Axe، بارگذاری لوگو در همه سناریوها، ۲۴ حالت مرحله با صفحه‌کلید/Axe، ۲۴ بازشدن FAQ و ۲۴ اسکن بخش‌ها موفق. تمام ۱۹۲ snapshot در دو اجرا یکسان‌اند؛ تغییر مرجع ۱۸۴ رکورد صرفاً هندسی است و تمام عنوان‌ها/کنترل‌ها/لینک‌ها/landmarkها و رنگ‌های پایه حفظ شده‌اند. بستهٔ سوم M2 (کاتالوگ و جزئیات، ورود/ثبت‌نام/بازیابی و Status) باقی است؛ کل M2 هنوز تمام نیست و شمارش محصول ۱۱۹/۱۲۳ تغییر نکرده.
- بستهٔ اول M2 مدار تکمیل شد: کاوش‌گر تعاملی با هر هشت دسته، fallback بدون JavaScript، منوی عمومی با حفظ همهٔ لینک‌ها و عملیات نشست، توقف مشترک حرکت و هر دو تم. ۳۲ حالت تکمیلی دسته/تم/عرض با Axe و صفحه‌کلید و هشت دسته بدون JavaScript موفق‌اند.
- پذیرش این بسته: build، lint/typecheck و ۲۴ قرارداد موفق؛ ۱۹۲ screenshot و Axe scan موفق، با تکرار دقیق تمام snapshotها در دو اجرای مستقل. فقط ۲۰ رکورد عمومی مرجع تغییر کرده و ۱۷۲ رکورد دیگر عیناً حفظ شده‌اند. backend/auth و دادهٔ واقعی دست‌نخورده‌اند. M2 هنوز در حال اجراست: سایر بخش‌های خانه و صفحات عمومی در دو بستهٔ بعدی باقی‌اند؛ این نتیجه به‌معنای تکمیل کل M2 نیست.
- M0 و M1 از شش مرحلهٔ مدار تکمیل شدند: قرارداد حفظ سامانه، محافظ ۴۹۰ فایل و ۵۴ مسیر، Hero واقعی و تعاملی، توقف/کاهش حرکت و اصلاح لینک پرش. بخش‌ها و عملیات قبلی حذف نشده‌اند.
- build تولیدی و ۲۴ قرارداد رابط موفق؛ ۱۹۲ حالت مرورگر و Axe موفق و در دو اجرای مستقل عیناً تکرارپذیر. تنها مرجع Hero و گزارش BI با بازهٔ ثابتِ آزمون به‌روز شد؛ داده و منطق واقعی backend/auth دست‌نخورده است.
- ادامه در [نقشه‌راه مدار](ORBIT_IMPLEMENTATION_ROADMAP.md): چهار مرحلهٔ M2 تا M5 باقی است. شمارش محصول همچنان ۱۱۹/۱۲۳ است؛ موارد باز و تعویق اتصال زنده تغییر نکرده‌اند. CI آنلاین هنوز تأیید نشده است.

### آخرین ادامه کار — ۲۰۲۶-۰۹-۰۸

- ۱۱۹ مورد از ۱۲۳ مورد اصلی تکمیل است: فازهای ۰ تا ۷ کامل، فاز ۸ برابر ۱۳/۱۴ و فاز ۹ برابر ۴/۷. چهار مورد باز حذف نشده‌اند.
- جذب مرحله‌ای مجری بیرونی با مدرک و Audit، پیشنهاد قاعده‌محور مجری/قیمت بدون اقدام خودکار، و سازمان/تیم/اشتراک قراردادی مشتری تکمیل شد. جزئیات و مرزهای واقعی در `ORGANIZATIONS_AND_ONBOARDING.md` است.
- شواهد جدید محلی: ۳۶ مجموعه و ۲۳۰ تست موفق، یک تست از پیش skipشده؛ E2E واقعی جذب، پیشنهاد، سازمان و گردش کامل سفارش موفق؛ build و typecheck و lint بدون خطا، یک warning قبلی دانلود فایل؛ ۲۴ مسیر × چهار عرض × دو تم = ۱۹۲ screenshot و Axe scan موفق. فرم‌های سازمان، درخواست پلن، فعال‌سازی مالی، ساخت تیم و اتصال سفارش نیز در مرورگر واقعی آزموده شدند.
- آزمون تصویری از ناوبری واقعی لینک‌های پنل استفاده می‌کند؛ بارگذاری کامل سریع پنج حساب روی یک IP به سقف محافظتی refresh می‌رسید. سیاست امنیتی نشست تغییر نکرده است.
- ادامه اجرایی: چندمجری/تیم و سهم مرحله‌ای؛ دو مورد AI تا تعیین تکلیف اتصال و پذیرش ایمنی آن باز است. اتصال زنده ارائه‌دهندگان بنا بر تصمیم مالک همچنان تعویق دارد. تأیید CI آنلاین جدید در دسترس نیست؛ موفقیت محلی معادل موفقیت CI اعلام نمی‌شود.
- زیرساخت Zarinpal، Kavenegar، SMTP و S3 خصوصی اضافه شده؛ ClamAV موجود حفظ شده است. اتصال زنده با حساب و کلید واقعی هنوز آزموده نشده و مطابق تصمیم مالک فعلاً فعال نیست.
- BI با SQL واقعی، کنترل نقش Ops/Finance/Super Admin، Audit، حریم خصوصی گروه‌های کوچک و آزمون نرخ بازگشت/هفته خالی تکمیل شد.
- ظاهر مشترک صفحات و پنل‌ها با لوگوی برداری، منوی آیکون‌دار، انتخاب مسیر دقیق، کارت و دکمه‌های هماهنگ و Hero متن‌محور بهبود یافت؛ دو تم و نبود تصویر بزرگ حفظ شده است. ماتریس مرورگر به ۱۹ مسیر و ۱۵۲ حالت افزایش یافت.
- شواهد محلی: ۳۳ مجموعه Unit و ۲۰۹ تست موفق، یک تست از پیش skipشده؛ گردش کامل سفارش و مرزهای نقش‌ها به‌همراه آزمون BI موفق؛ ۱۵۲ screenshot و Axe scan موفق؛ lint/typecheck بدون خطا (یک warning قدیمی دانلود فایل در Web).
- مالک در ۲۰۲۶-۰۹-۰۷ مجوز `MIT-0` را فقط برای `nodemailer@10.0.0` تأیید کرد؛ تطبیق دقیق بسته/نسخه/مجوز و تست‌های منفی در سیاست CI ثبت شد. تأیید شامل فعال‌سازی SMTP نیست. اجرای CI برای این بسته هنوز تأیید نشده است.
- شش تست پذیرش محدود و سیاست زنجیره تأمین برای ۱۳۰۲ بسته موفق‌اند. audit وابستگی‌های اجرایی API و Web صفر هشدار دارد؛ audit ابزارهای توسعه به‌ترتیب ۴ و ۳ هشدار High دارد که رفع کنترل‌شده آن‌ها همچنان لازم است.

شرح محاسبات گزارش در `BUSINESS_INTELLIGENCE.md` و مرزهای اتصال زنده در
`PRODUCTION_PROVIDERS.md` ثبت شده‌اند. موارد باز فاز ۹ حذف یا صرفاً به‌دلیل وجود جدول اولیه، تکمیل اعلام نشده‌اند.

- Monorepo شامل NestJS/Prisma/PostgreSQL و Next.js App Router
- چهار نقش، `admin_scope`، capability و Route/Layout جداگانه هر نقش
- ثبت‌نام، ورود رمز، OTP آزمایشی، JWT، Session و Guardها
- کاتالوگ Service/Package و CRUD ادمین
- سفارش با ۲۰ وضعیت، History، تریاژ، Quote، Assignment/Reassignment، QC، تحویل، اصلاح،
  Dispute و Cancel
- Ledger دوطرفه، Wallet projection، Payment mock، Escrow، Refund، Invoice و Withdrawal API
- Ticket، پیام، SLA ساعت کاری، Escalation و عملکرد پشتیبان
- File upload و Signed URL پایه
- Notification log، Audit log، Outbox و System Settings پایه
- مدیریت کارمند، تیم، ظرفیت، عملکرد و کد نمایشی
- صفحات عمومی، مشتری، مجری، پشتیبان، ادمین عملیاتی، مالی و کل
- چهار اسکریپت Smoke مرورگر/API و تست‌های واحد State Machine و Business Hours

این فهرست به معنی Production-ready بودن نیست؛ هر بخش در فازهای زیر سخت‌سازی و تکمیل می‌شود.

## فاز ۰ — حفاظت مخزن و تفکیک محیط

- [x] تثبیت `Desktop\niazat-app` به‌عنوان تنها مخزن مرجع
- [x] تأیید Remote شخصی و پاک‌بودن خط مبنای Git پیش از تغییرات
- [x] انتقال `node_modules` و Cache ساخت Next به `_runtime`
- [x] ایجاد Junction سازگار برای اجرای عادی ابزارها
- [x] اسکریپت امن `attach`، `detach` و `status`
- [x] مستند تشخیص سورس واقعی و انتقال صرفاً کد
- [x] افزودن نصب تمیز که وابستگی‌ها را مستقیماً در ساختار `_runtime` آماده کند
- [x] افزودن دستورات یکپارچه Run/Stop/Health بدون ساخت نسخه یا Backup خودکار

## فاز ۱ — امنیت بحرانی P0

- [x] جایگزینی Refresh Token ناسازگار با توکن opaque امن، Hash در DB، Rotation اتمیک،
  تشخیص reuse، انقضا و ابطال خانواده Session
- [x] جداسازی Secret، نوع Payload، Audience و Guard توکن دانلود از Access Token
- [x] حذف `passwordHash` و فیلدهای حساس از تمام پاسخ‌ها با Select/Serializer امن پیش‌فرض
- [x] کنترل مالکیت و Visibility پیام سفارش و تیکت در تمام مسیرهای خواندن و نوشتن
- [x] کنترل مالکیت سفارش، فایل، گزارش، Invoice و Signed URL بر اساس role/scope/assignment
- [x] Rate limit مجزا برای Login، OTP request/verify، Refresh، Upload، Signed URL، Payment،
  Refund، Escrow و عملیات مدیریتی حساس
- [x] محدودیت حجم Upload پیش از Buffer، whitelist پسوند، تشخیص Magic Bytes/MIME، نام UUID،
  Quarantine، اسکن آنتی‌ویروس و جلوگیری از Path Traversal
- [x] حذف فایل orphan و فایل ردشده با Job قابل تکرار، قفل هم‌زمانی و Audit نتیجه
- [x] اعتبارسنجی Startup برای Secretها، CORS، محیط، Storage، Payment و SMS
- [x] انتقال Session مرورگر از `localStorage` به Cookie امن HttpOnly/SameSite یا BFF و محافظت
  CSRF متناسب با معماری انتخابی
- [x] جلوگیری از افشای OTP آزمایشی خارج از Development و حذف داده حساس از Log/Error
- [x] سیاست Password، Lockout/Backoff، ثبت Login Attempt و بازیابی رمز امن با ابطال Sessionها
- [x] Security headerها، CSP، CORS allowlist و محدودیت Swagger در محیط Production
- [x] Audit اجباری عملیات role/scope، block، download حساس، مالی و dispute؛ اتمیک برای مدیریت کاربر
- [x] تست منفی ماتریس Role/Scope/Capability و مسیرهای حساس؛ Ownership با Policyهای سفارش، تیکت و فایل

## فاز ۲ — صحت مالی و دامنه سفارش P0/P1

- [x] اصلاح `released/refunded/remaining` در Escrow و ممنوعیت جمع بیش از مبلغ Hold
- [x] Idempotency پایدار مبتنی بر کلید درخواست؛ حذف کلیدهای وابسته به `Date.now()`
- [x] Lock/Serializable transaction یا Optimistic Concurrency برای Release، Refund و Payment
- [x] تراکنش واحد برای تغییر وضعیت، History، Audit، Outbox و اثر مالی
- [x] اتمیک‌کردن Confirm، Delivery، QC، Dispute، Assignment و Reassignment
- [x] محدودکردن گذارهای `disputed` فقط به Use Case اختصاصی `resolve-dispute`
- [x] اجرای دقیق جدول ۲۰ وضعیت، Actor مجاز، Note اجباری و اثر مالی هر گذار
- [x] اعتبارسنجی Package متعلق به Service، فعال‌بودن Service/Package و Snapshot قرارداد سفارش
- [x] اعتبارسنجی مجری فعال، ظرفیت، مهارت، Team و ممنوعیت reviewer برابر executor
- [x] اعتبارسنجی QC checklist، Acceptance Criteria، Attachment و Revision allowance
- [x] پشتیبانی صحیح Milestone، پرداخت/تحویل مرحله‌ای و تایید مرحله
- [x] Ledger کاملاً append-only با Correction entry و ممنوعیت Update/Delete
- [x] Wallet و WalletTransaction فقط Projection مشتق در همان تراکنش Ledger
- [x] Job شبانه تطبیق Wallet/Ledger و هشدار Critical به finance_admin
- [x] تفکیک دقیق GMV، Revenue، Commission، Escrow و Wallet در گزارش‌ها
- [x] Invoice یکتا و PDF، Refund policy، Withdrawal محدود و Shaba تأییدشده
- [x] Timezone صریح `Asia/Tehran`، تقویم/نمایش فارسی و SLA مبتنی بر ساعات کاری و تعطیلات
- [x] تست هم‌زمانی، retry، replay، partial release/refund و شکست میانی تراکنش‌ها

## فاز ۳ — معماری، قرارداد و پردازش پس‌زمینه

- [x] شکستن `OrdersService` بزرگ به Use Caseهای دامنه با مرز تراکنش روشن
- [x] جداسازی Auth Session/Token، Order workflow، Assignment، Messaging و Dispute
- [x] Transactional Outbox واقعی با Worker، Retry، Backoff، Dead-letter و Idempotent consumer
- [x] Workerهای `payment_verify_recheck`، `release_eligible_escrows`،
  `escalate_overdue_tickets`، `recalculate_staff_performance`،
  `recalculate_executor_scores`، `send_outbox_notifications`، `file_antivirus_scan`،
  `expire_signed_urls` و `generate_periodic_reports`
- [x] قرارداد OpenAPI و Client تولیدشده یا Package مشترک Type/Schema بین API و Web
- [x] استاندارد واحد Pagination، Filter، Sort، Error envelope و Correlation ID
- [x] لایه مرکزی Fetch/Cache/Retry/Cancellation/Mutation و جلوگیری از درخواست‌های تکراری
- [x] کاهش Client Componentهای غیرضروری و SSR/ISR صفحات عمومی
- [x] Route handler یا BFF برای Session امن و مخفی‌ماندن API internals در صورت انتخاب این مسیر
- [x] Config schema تایپ‌شده، حذف مقدارهای جادویی و اصلاح فرمان Production
- [x] Indexهای DB مبتنی بر Queryهای واقعی و بررسی N+1/Over-fetch
- [x] ADR برای تصمیم‌های مهم و همگام‌سازی اسناد با کد و تست واقعی

## فاز ۴ — تکمیل کامل MVP محصول

- [x] فرم‌های پویای Service شامل تمام Field typeها، Optionها، Validation و پاسخ‌های Snapshotشده
- [x] Autosave پیش‌نویس، Resume، Summary پیش از ارسال و Submit اتمیک/Idempotent
- [x] Upload/Download واقعی و امن در سفارش، پیام، تیکت، گزارش، QC و Invoice
- [x] Timeline مشترک سفارش، Milestone، History و نمایش واضح «اقدام بعدی»
- [x] گزارش پیشرفت، QC، تحویل، مدیریتی و پشتیبانی با Version و Visibility
- [x] Notification Center با unread، preference و کانال‌های in-app/email/SMS
- [x] ورود OTP کامل، بازیابی رمز، نمایش رمز، Autocomplete و مدیریت Sessionهای فعال
- [x] پروفایل مشتری، اطلاعات شرکتی، آدرس فاکتور، اعلان‌ها، امنیت و حریم داده
- [x] کیف پول، پرداخت‌های سفارش، Escrow، Refund و Invoice PDF برای مشتری
- [x] شکایت، تشکر و Rating برای Order، Team، Executor، Support و QC با کد قابل ارجاع
- [x] پنل مجری: پذیرش کار، ورودی‌ها، معیار پذیرش، Checklist، Progress، Delivery و QC Rework
- [x] پنل پشتیبان: داشبورد، صف، My Tickets، SLA، Internal Note، Canned Reply و Performance
- [x] پنل Ops: Triage، Quote، Assignment، QC، Team/Staff، Service/Package/Form/QC Template
- [x] پنل Finance: Payment، Escrow، Refund، Invoice، Ledger export و Withdrawal
- [x] پنل Super Admin: Users، Admin/Scope، Settings، AI controls، Security و Audit
- [x] Confirmation Modal استاندارد با خلاصه اثر، Note اجباری و جلوگیری از کلیک تکراری
- [x] Status Page برای وضعیت سرویس‌های کلیدی و رخدادهای عملیاتی

## فاز ۵ — مدیریت کارکنان، عملکرد و گزارش‌ها

- [x] Team، Skill، Executor type، Verification، حضور، ظرفیت و دسترسی‌ها
- [x] پروفایل کامل داخلی با تب‌های سفارش، عملکرد، امتیاز، شکایت/تشکر، مهارت، ظرفیت و History
- [x] Snapshot و Job محاسبه On-time، QC pass، Rating، Complaint، Compliment و Risk
- [x] هشدار Over-capacity، Burnout risk، SLA risk و Quality regression
- [x] حفظ محرمانگی: مجری فقط عملکرد شخصی محدود و داده لازم برای اجرا را می‌بیند
- [x] گزارش فروش، درآمد، Escrow، Refund، QC، SLA، تیم‌ها، کارکنان، رضایت، تبدیل و زمان تحویل
- [x] Export کنترل‌شده و Auditشده برای گزارش‌های مدیریتی و مالی

## فاز ۶ — UX، موبایل و دسترس‌پذیری

- [x] Design System کامل: Color، Type، Spacing، Grid، Radius، Shadow، Icon، State، Breakpoint،
  Density و Z-index
- [x] دو تم لاجورد و عسل روشن/تیره با Persistence و بدون FOUC
- [x] منوی عمومی موبایل و Sidebar→Drawer در پنل‌ها
- [x] تبدیل Tableهای عملیاتی به Card قابل اسکن در موبایل بدون حذف Actionها
- [x] رفع Overflow و آزمون خودکار عرض‌های موبایل، تبلت، لپ‌تاپ و دسکتاپ بزرگ
  - ماتریس runtime روی ۱۸ مسیر، چهار عرض ۳۲۰، ۷۶۸، ۱۲۸۰ و ۱۹۲۰ و هر دو تم، overflow افقی و حداقل اندازه کنترل‌ها را در مرورگر واقعی کنترل می‌کند.
- [x] Tab/Tablist/Tabpanel، Drawer و Modal با Keyboard، ESC، Focus trap و Focus restore
- [x] نام دسترس‌پذیر Theme Switcher و تمام کنترل‌های icon-only
- [x] ترتیب Heading، Landmark، Label، Inline error، Focus Ring و Skip link
- [x] کنتراست WCAG AA، عدم اتکا به رنگ و پشتیبانی Reduced Motion
- [x] RTL کامل، محتوای ترکیبی فارسی/انگلیسی، Truncation، اعداد و تاریخ مطابق تنظیم کاربر
- [x] Skeleton، Empty، Error، Permission، Offline و Retry state استاندارد
- [x] Breadcrumb، Search، Filter، Sort، Pagination و Action Menu مشترک
- [x] حذف Flash محتوای نقش اشتباه و Redirect قابل پیش‌بینی
- [x] بازنویسی Microcopy برای زبان ساده، حرفه‌ای و اقدام‌محور

## فاز ۷ — هویت بصری و صفحات عمومی

- [x] Hero متن‌محور با CTA اصلی/ثانویه و سه نشانه اعتماد؛ بدون تصویر بزرگ
- [x] دیاگرام کوچک CSS/SVG مسیر درخواست تا تحویل
- [x] Stepper تعاملی مراحل انتخاب، بررسی، پرداخت، اجرا، QC و تحویل
- [x] Use Caseهای واقعی برای کسب‌وکار، دانشگاه/پژوهش، محتوا، طراحی و امور سفارشی
- [x] Service catalog با Search/Filter، Package، خروجی، SLA، Acceptance و FAQ
- [x] نمونه خروجی‌ها بدون ادعای ساختگی و با Privacy مناسب
- [x] Assurance درباره اجرای داخلی، Escrow، QC، محرمانگی و پشتیبانی
- [x] FAQ قابل دسترس و Final CTA متناسب با وضعیت Login
- [x] تنوع محدود ریتم صفحه و جداکننده‌های هندسی با پالت فعلی
- [x] Motion محدود و Route-aware با رعایت Reduced Motion
- [x] SEO فنی، Metadata، Sitemap، Robots، Structured Data و صفحات خطای عمومی

## فاز ۸ — Production، کیفیت و عملیات

- [x] Unit test برای تمام Policyها، State transitionها، محاسبات مالی و Ownership
- [x] Integration test با PostgreSQL واقعی برای Transaction، Constraint و Migration
- [x] E2E ماتریس تمام نقش‌ها و جریان کامل سفارش، پرداخت، QC، تحویل، تیکت و فایل
- [x] تست Accessibility، Responsive، Keyboard و Visual regression دو تم
  - runner ایزوله PostgreSQL/API/Web با ورود واقعی پنج نقش، ۱۴۴ screenshot و اسکن Axe، baseline فشرده، آزمون overflow/هدف لمسی و جریان‌های Skip Link، Theme Listbox و Drawer اضافه شد؛ build صفحات prerender در برابر seed ایزوله انجام می‌شود و هر دو اجرای push/PR روی Linux و Chromium موفق بودند.
- [x] CI برای Format-check، Lint، Typecheck، Unit، Integration، E2E، Migration و Build
- [x] Docker Production چندمرحله‌ای، non-root و `prisma migrate deploy`
  - imageهای مستقل API و Web، filesystem فقط‌خواندنی، volume محدود Storage، Healthcheck و ساخت واقعی هر دو image در CI پیاده‌سازی و تأیید شد.
- [x] Structured logging، Redaction، Correlation ID، Metrics، Trace و Alert
  - logger سراسری JSON با حذف secret/PII، context ناهمگام correlation و W3C trace، metrics سازگار با Prometheus و token مستقل، telemetry درخواست/job و alertهای نرخ 5xx/کندی با cooldown در runtime و CI تأیید شد.
- [x] Health/Readiness برای DB، Storage، Queue، SMS، Email و Payment
  - liveness مستقل، readiness عمومی ۲۰۰/۵۰۳، جزئیات محدود به ادمین، probe واقعی DB/Storage/Outbox، fail-closed برای adapterهای جعلی، metric و alert وابستگی و healthcheck مبتنی بر `/ready` در Docker/CI تکمیل شد.
- [x] Backup رمزنگاری‌شده، Restore test، Retention و Disaster recovery runbook
  - archive سفارشی PostgreSQL با AES-256-GCM و AAD، checksum، key ID، ساخت atomic، Restore تراکنشی و تأیید دقیق مقصد، Retention امن با dry-run، ایمیج مستقل non-root و Runbook دارای RPO/RTO و Failback تکمیل شد؛ CI چرخه واقعی backup/restore، تطبیق داده و جدول، tamper rejection و ساخت image را تأیید کرد.
- [x] Cleanup دوره‌ای Session، OTP، Idempotency، Outbox، فایل orphan و Signed URL
  - دو job یکپارچه و قفل‌شده با batch محدود، retention مستقل، Audit/Metrics، indexهای دیتابیس و اجرای دستی محدود به super admin اضافه شد؛ Outbox قابل‌اقدام و داده سالم حفظ می‌شوند و migration، تست PostgreSQL واقعی، unit/typecheck/build و هر دو اجرای CI موفق بودند.
- [x] Dependency advisory، SBOM، Secret rotation و بررسی License
  - audit مستقل production و development، overrideهای امن، integrity lockfile، policy مجوز، اسکن secretهای tracked، دو SBOM استاندارد CycloneDX و artifact سی‌روزه CI اضافه شد؛ Runbook چرخش عادی و اضطراری secretها ثبت شد و هر دو اجرای push/PR موفق بودند.
- [x] Load/Stress test برای Auth، Order list، File، Payment و Workerها
  - runner ایزوله PostgreSQL و HTTP واقعی با پروفایل‌های Smoke و Stress، بودجه p95/RPS، کنترل 5xx، فشار Signed URL، Idempotency پرداخت و قفل اجرای Worker اضافه شد؛ Smoke با ۲۱۸ و Stress با ۱۷۰۲ درخواست محلی و Smoke در هر دو اجرای CI موفق بود.
- [ ] انتخاب و اتصال درگاه پرداخت، SMS/OTP، Email، Antivirus و Storage واقعی
  - پیاده‌سازی adapter و تست کنترل‌شده کامل است؛ مجوز وابستگی ایمیل نیز با تأیید محدود مالک تعیین تکلیف شد. پذیرش اتصال زنده باقی است و تنظیم `LIVE_PROVIDERS_ENABLED=false` عمداً محفوظ است.
- [x] مستند Deployment، عملیات روزانه، Incident response و Rollback migration
  - `OPERATIONS_RUNBOOK.md` شامل پذیرش انتشار، پاسخ P1/P2، توقف امن، rollback کد سازگار و حفظ داده در شکست migration است؛ Compose معیوب نیز اصلاح و parse واقعی YAML آزموده شد.

## فاز ۹ — توسعه بعد از MVP، بدون حذف از دامنه آینده

- [x] جذب مجری بیرونی: هویت، آزمون، مصاحبه، استعلام، قرارداد، NDA، Trial و دسترسی محدود
  - پرونده ترتیبی، شناسه مدرک خصوصی، تأیید انسانی، نسخه و Audit، ممنوعیت دورزدن پروفایل و مسدودبودن تخصیص واقعی تا تأیید نهایی؛ آزمون مثبت/منفی و هم‌زمانی PostgreSQL و رابط واقعی موفق.
- [x] Matching و قیمت‌گذاری پیشنهادی با بازبینی انسانی
  - رتبه‌بندی قواعد ثابت و قیمت کاتالوگ/میانه سوابق، بدون PII و بدون تغییر خودکار سفارش یا پول؛ صلاحیت هنگام تخصیص دوباره بررسی می‌شود.
- [ ] AI برای دسته‌بندی، خلاصه، پاسخ پیشنهادی، QC کمکی و تشخیص ریسک
- [ ] ممنوعیت تصمیم خودکار نهایی AI در مالی، حقوقی، Dispute و Block
- [x] سازمان‌ها، تیم‌های مشتری، اشتراک و پلن سازمانی
  - دعوت با پذیرش گیرنده، نقش و تیم، انتقال مالکیت، لغو دسترسی، سهمیه هم‌زمانی، اتصال صریح خلاصه پیش‌نویس خود و فعال‌سازی قراردادی توسط مالی تکمیل شد. برداشت و تمدید خودکار فعال نیست؛ فایل و مالکیت مالی سفارش همچنان خصوصی است.
- [ ] چند مجری/تیم روی یک سفارش با Permission و سهم مرحله‌ای
- [x] BI پیشرفته، Cohort، Funnel و Forecast با کنترل دسترسی
  - گزارش `/admin/reports/bi` و صفحه متناظر با آزمون PostgreSQL واقعی، Audit، محدودیت نرخ، حذف PII، سرکوب گروه کمتر از پنج نفر، حذف پنجره ناتمام و پیش‌بینی توصیفی هشت هفته کامل اضافه شد.

## دروازه تکمیل هر فاز

هر فاز فقط زمانی تکمیل است که:

1. کد و Migration لازم نوشته شده باشد.
2. تست مثبت، منفی، مالکیت و Failure path مربوط پاس شود.
3. Lint، Typecheck و Build بدون خطا باشد.
4. UI در هر دو تم، RTL و Breakpointهای هدف بازبینی شود.
5. امنیت، Audit و Observability بخش‌های حساس بررسی شود.
6. اسناد و وضعیت همین نقشه راه با شواهد واقعی به‌روزرسانی شود.
