# قرارداد داده و API فاز Z1 — ZEUS-EXEC-010

تاریخ: ۲۰۲۶-۱۰-۲۶. مرجع این بسته همان پروژهٔ Desktop/niazat-app است. دامنهٔ پذیرش، زیرساخت داده و قراردادهای Z1.1/Z1.3 است؛ نه تکمیل قابلیت‌های همهٔ فازهای زئوس، تطابق عینی فناوری D1، ظاهر همهٔ صفحات جدید یا اتصال زنده.

## منابع و دفتر قابل بازتولید

`scripts/acceptance/zeus-z1-contract-inventory.mjs` از همان پنج منبع/دفتر Z0، همهٔ ۲۹ API سند D1، ۵۵ API سند D3 و ۱۲۰ ستون SQL در ۱۳ جدول D1/D4 را نگه می‌دارد؛ شناسه‌ای حذف نشده است. هر API به signature واقعی، controller/handler، متادیتای نقش/Scope، hash فایل و خط کد وصل است؛ هر ستون به نوع/null/default/رابطه و indexهای Prisma وصل است. گزارش جاری `.artifacts/zeus/z1-phase/contract-inventory.json` در پذیرش HTTP تولید می‌شود. این JSON، پذیرش خودکارِ رفتار صرفاً از روی AST نیست.

APIهای /v1 و فرمان‌های دامنه طبق DEC09 حفظ‌اند. /api/v1 صرفاً برای شباهت منبع ساخته نشده و PUT عمومی status وجود ندارد. مسیر customer/withdrawals با وجود نام namespace، همچنان مخصوص مجری است. وضعیت operator در منبع همان support مصوب است و نقش پنجم ساخته نشده است.

## قراردادهای افزوده و پاسخ‌ها

همهٔ نام‌های JSON در API فعلی camelCase هستند؛ سازگاری به‌معنی تبدیل خاموش همهٔ فیلدها به snake_case نیست. DTOهای جدید whitelist و منع فیلد اضافی عمومی پروژه را دارند. مهمان در مسیر خصوصی 401، نقش/Scope نامجاز 403، شیء غیرمتعلق یا ناموجود 404، payload نامعتبر 400 و رقابت/نسخهٔ قدیمی 409 می‌گیرد. خطای داخلی، schema/credential را به مشتری نمی‌دهد. پاسخ‌های مالی/احراز هویت قبلی و cookie refresh حفظ‌اند.

| مسیر | نقش/Scope | ورودی اصلی | خروجی/اثر |
| --- | --- | --- | --- |
| GET /v1/customer/dashboard | customer یا capability مجاز | فقط actor نشست | counts هر۲۰وضعیت، تعداد سفارش/تیکت/اعلان، wallet یا null، مبلغ امانیِ همان مالک؛ بدون نوشتن |
| GET /v1/admin/stats | Super | — | گروه واقعی نقش/وضعیت، پرداخت موفق IRT؛ مبلغ پرداخت به‌عنوان درآمد برچسب نمی‌خورد |
| GET /v1/admin/staff-report | Ops/Super | from/to معتبر گزارش | تعداد تخصیص، حل، پاسخ عمومی و تیکت breach یکتا؛ انتساب به پشتیبان فعلی صریح است، نه جعل تاریخچه |
| GET /v1/admin/staff/:id/performance | Ops/Super | شناسه پروفایل | latest یا null و حداکثر۱۲snapshot؛ کاملاً فقط‌خواندنی، بدون recalculate یا تغییر دسترسی |
| POST /v1/customer/orders/:orderId/review | مالک مشتری، پس از تحویل | rating صحیح۱..۵، comment اختیاری، publicConsent boolean | یک نظر یکتا برای هر سفارش؛ ویرایش مالک نسخه را زیاد و انتشار/بازبینی قبلی را باطل می‌کند؛ Feedback خصوصی قبلی باقی است |
| GET همان review | مالک مشتری | orderId | فقط projection خودِ نظر؛ شناسهٔ moderator برنمی‌گردد |
| GET /v1/services/:slug/reviews | عمومی با محدودیت نرخ | خدمت فعال | count/averageRating و حداکثر۵۰نظر فقط دارای رضایت و تأیید؛ فقط id/rating/publicComment/publishedAt، بدون مالک/مجری/شماره/پروفایل داخلی |
| GET /v1/admin/reviews | Ops/Super | — | حداکثر۱۰۰نظر برای بازبینی؛ متن خام فقط در این مرز خصوصی |
| PATCH /v1/admin/reviews/:id/moderation | Ops/Super | version، approved/rejected، reason واقعی، privacyReviewed=true، publicComment بازبینی‌شده | CAS نسخه و Audit؛ تأیید بدون رضایت یا متن دارای اطلاعات تماس/شناسه/markup رد می‌شود؛ متن خام به‌صورت خودکار منتشر نمی‌شود |
| POST /v1/customer/tickets/:id/rating | مالک تیکت حل‌شده/بسته | rating صحیح۱..۵ | ticketId/rating/ratedAt؛ تکرار همان امتیاز بی‌اثر، تغییر امتیاز ثبت‌شده 409 |
| GET/PUT /v1/admin/support/sla-calendar | Super | calendar نسخهٔ افزایشی و reason واقعی برای PUT | تقویم معتبر تهران/روزها/دقایق/تعطیلات/زمان اولین پاسخ؛ فقط تیکت جدید آن را snapshot می‌کند |
| PUT /v1/admin/services/:id/contract-policy | Ops/Super | version افزایشی، sortOrder، نرخ‌های مصوب0/3000/8000bps، reason | سیاست immutable جدید با Audit؛ نرخ مصوب عوض نمی‌شود، تعرفه یا سفارش قدیمی بازقیمت‌گذاری نمی‌شود |
| POST /v1/ai/suggest-price، triage، support-reply | Ops/Super | orderId یا ticketId UUID | 503 با AI_PROVIDER_DEFERRED، providerCalled=false و تأیید انسانی لازم؛ نه خروجی موفق ساختگی، نه موتور AI یا ارسال داده به بیرون |

سه مسیر AI در D1 «آماده برای آینده» نامیده شده‌اند. پذیرش Z1 فقط قرارداد خاموش/محافظت‌شدهٔ آن‌هاست؛ پذیرش قابلیت AI و Z7 همچنان باز و اتصال واقعی طبق DEC10 تعویقی است. قالب صفحهٔ AI، review و تنظیمات جدید در بسته‌های UI همان Z5 ساخته/متصل می‌شود، با همان دو تم و Design System؛ وجود API جای پذیرش صفحه نیست.

## داده و سازگاری

- migration شماره۲۵ فقط پنج ستون nullable/default و یک index ترکیبی اضافه می‌کند: Ticket.customerRating/customerRatedAt، PublicServiceReview.publicComment/version و UserLoginState.phoneVerifiedAt؛ هیچ جدول/ستون/enum/دادهٔ قبلی حذف یا بازنویسی نمی‌شود. امتیاز۱..۵ و version مثبت CHECK دارند. index مشتری/وضعیت سفارش، index منبع D1 را پوشش می‌دهد.
- ServiceContractPolicy نسخه‌دار هنگام ایجاد خدمت یا نخستین quote معتبر ثبت می‌شود. نرخ‌های مصوب به bps هستند؛ درصد = bps/100. sortOrder از آخرین سیاست خوانده می‌شود؛ tie، ترتیب عنوان قبلی را حفظ می‌کند. سیاست/سفارش قبلی update نمی‌شود.
- OrderContractSnapshot در همان تراکنش quoted ثبت می‌شود؛ مبلغ توافقی واقعی، ارز، service/policy version، فوریت و slaHours همان لحظه در JSON می‌مانند. یادداشت داخلی فقط projection ادمین دارد. نرخ یا base/deadline که واقعاً اعمال/توافق نشده null است، نه استخراج معکوسِ حدسی از مبلغ یا کاتالوگ امروز. منطق اعمال نرخ/فرمول/مهلت/ظرفیت و freeze هنگام پذیرش، مالک اجرایی Z2 را حفظ می‌کند؛ Z1 آن رفتار را اجراشده اعلام نمی‌کند.
- «تأیید شماره» با active بودن کاربر هم‌معنا نیست. phoneVerifiedAt فقط پس از OTP واقعی ثبت می‌شود؛ تاریخچهٔ قدیمی نامعلوم null می‌ماند. login با رمز و refresh شماره را تأییدشده فرض نمی‌کنند. lastSuccessfulLoginAt جدا و در تراکنش session است.
- تیکت جدید، چهار ساعت کاریِ اولین پاسخ عمومی معنادار انسانی دارد: شنبه تا پنجشنبه۹–۱۸تهران، جمعه و تعطیلات ثبت‌شده تعطیل. ثانیه/میلی‌ثانیه در مرز ساعت حفظ می‌شود. پاسخ خودکار، whitespace/نقطه و یادداشت داخلی پاسخ اول نیست؛ انتظار مشتری ساعت پاسخ اول را متوقف نمی‌کند.
- پیام عمومی، تغییر وضعیت، firstMeaningfulReplyAt و Outbox پاسخ داخل یک تراکنش‌اند؛ شکست اعلان همه را rollback می‌کند. تعویض تقویم snapshot تیکت قبلی را عوض نمی‌کند؛ تیکت قدیمیِ بدون snapshot روی همان slaDueAt و سیاست قدیمی می‌ماند. معیار حل، جدا از اولین پاسخ است.
- Scope پشتیبانی فقط Support و Ops/Super است؛ Finance دیگر از پذیرفتن عمومی نقش admin به عملیات تیکت دسترسی نمی‌گیرد. Support همچنان به مالکیت تخصیص و یادداشت داخلی محدود است و دسترسی مالی ندارد.
- متن عمومی نیازمند انتخاب صریح متن بازبینی‌شده است؛ کنترل اطلاعات تماس و UUID/markup محافظ مکمل است، نه ادعای تشخیص کامل معنایی PII. لغو رضایت، انتشار را فوراً برمی‌دارد و درخواست‌های بعدی عمومی آن را نمی‌بینند. endpoint دادهٔ شخصی cache عمومی ندارد.

## دروازهٔ پذیرش و محدودیت‌ها

پذیرش HTTP واقعی شامل JWT/session و نقش/Scope روی هر۸۴ردیف/۷۶مقصد، سناریوهای مثبتِ قابلیت‌های جدید، مالک خارجی، رقابت بازبینی، rollback پیام/SLA/Outbox و حفظ سیاست قدیمی است. ۲۶سناریوی مالی/auth و۹شاخهٔ کامل سفارش جدا روی DB تصادفی اجرا می‌شوند؛ fixture مستقیم delivered/pending_quote در runner قرارداد فقط برای همان مرز است و اثبات QC/پرداخت محسوب نمی‌شود.

rehearsal با schema بازسازی‌شدهٔ دقیق EXEC-009،۲۴migration قبلی و کلاینت قبلی واقعاً تولیدشده انجام می‌شود؛ همهٔ ستون/رکوردهای۷۰جدول قبل/بعد مقایسه و خواندن/نوشتن کلاینت قدیمی پس از۲۵migration آزموده می‌شود. fixture تولیدشده و DB موقت حذف می‌شوند. اعمال اصلی تنها پس از pin و گواهی آمادهٔ همین نسخه، با کنترل hash ستون‌های قبلی و بدون seed/reset/تراکنش مالیِ پذیرش مجاز است.

تست غیرفعال قدیمی موفق شمرده نمی‌شود. baseline ثابت2c701d7،۲۳pin جدید،۱۵pin دامنه و۱۳pin قرارداد قبلی، کنترل‌های invoice/pricing/diagnosis/parser/security و baseline۱۹۲تصویری حفظ‌اند. CI آنلاین/commit/push/انتشار عمومی و اجرای مجدد audit شبکه‌ای در این بسته ادعا نمی‌شوند. گواهی نهایی این فاز `docs/zeus/z1-phase-acceptance.json` است؛ شواهد EXEC-007/008/009 تاریخی باقی می‌مانند و به source جدید تعمیم ندارند.
