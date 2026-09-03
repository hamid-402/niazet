# نقشه راه جامع و مرجع اجرایی «نیازت با ما»

این سند منبع حقیقت اجرای پروژه است. تعریف محصول و قواعد دامنه در
`docs/specs/architecture-v4.md`، جدول قطعی وضعیت و مالی در
`docs/specs/addendum-state-machine-ledger.md` و جزئیات صفحات در
`docs/specs/ui-pages-blueprint-v2.md` قرار دارد. هیچ قابلیت آن اسناد با این نقشه حذف
نمی‌شود؛ این سند ترتیب اجرا و معیار تکمیل واقعی را مشخص می‌کند.

## تصمیم‌های قطعی

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
- [ ] رفع Overflow و آزمون خودکار عرض‌های موبایل، تبلت، لپ‌تاپ و دسکتاپ بزرگ
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
- [ ] تست Accessibility، Responsive، Keyboard و Visual regression دو تم
  - قراردادهای استاتیک، اصلاح تعاملات کیبورد و ماتریس ۱۴۴ تصویری آماده است؛ ثبت baseline و مقایسه runtime پس از رفع اتصال مرورگر داخلی باقی مانده است.
- [x] CI برای Format-check، Lint، Typecheck، Unit، Integration، E2E، Migration و Build
- [x] Docker Production چندمرحله‌ای، non-root و `prisma migrate deploy`
  - imageهای مستقل API و Web، filesystem فقط‌خواندنی، volume محدود Storage، Healthcheck و ساخت واقعی هر دو image در CI پیاده‌سازی و تأیید شد.
- [x] Structured logging، Redaction، Correlation ID، Metrics، Trace و Alert
  - logger سراسری JSON با حذف secret/PII، context ناهمگام correlation و W3C trace، metrics سازگار با Prometheus و token مستقل، telemetry درخواست/job و alertهای نرخ 5xx/کندی با cooldown در runtime و CI تأیید شد.
- [x] Health/Readiness برای DB، Storage، Queue، SMS، Email و Payment
  - liveness مستقل، readiness عمومی ۲۰۰/۵۰۳، جزئیات محدود به ادمین، probe واقعی DB/Storage/Outbox، fail-closed برای adapterهای جعلی، metric و alert وابستگی و healthcheck مبتنی بر `/ready` در Docker/CI تکمیل شد.
- [x] Backup رمزنگاری‌شده، Restore test، Retention و Disaster recovery runbook
  - archive سفارشی PostgreSQL با AES-256-GCM و AAD، checksum، key ID، ساخت atomic، Restore تراکنشی و تأیید دقیق مقصد، Retention امن با dry-run، ایمیج مستقل non-root و Runbook دارای RPO/RTO و Failback تکمیل شد؛ CI چرخه واقعی backup/restore، تطبیق داده و جدول، tamper rejection و ساخت image را تأیید کرد.
- [ ] Cleanup دوره‌ای Session، OTP، Idempotency، Outbox، فایل orphan و Signed URL
- [ ] Dependency advisory، SBOM، Secret rotation و بررسی License
- [ ] Load/Stress test برای Auth، Order list، File، Payment و Workerها
- [ ] انتخاب و اتصال درگاه پرداخت، SMS/OTP، Email، Antivirus و Storage واقعی
- [ ] مستند Deployment، عملیات روزانه، Incident response و Rollback migration

## فاز ۹ — توسعه بعد از MVP، بدون حذف از دامنه آینده

- [ ] جذب مجری بیرونی: هویت، آزمون، مصاحبه، استعلام، قرارداد، NDA، Trial و دسترسی محدود
- [ ] Matching و قیمت‌گذاری پیشنهادی با بازبینی انسانی
- [ ] AI برای دسته‌بندی، خلاصه، پاسخ پیشنهادی، QC کمکی و تشخیص ریسک
- [ ] ممنوعیت تصمیم خودکار نهایی AI در مالی، حقوقی، Dispute و Block
- [ ] سازمان‌ها، تیم‌های مشتری، اشتراک و پلن سازمانی
- [ ] چند مجری/تیم روی یک سفارش با Permission و سهم مرحله‌ای
- [ ] BI پیشرفته، Cohort، Funnel و Forecast با کنترل دسترسی

## دروازه تکمیل هر فاز

هر فاز فقط زمانی تکمیل است که:

1. کد و Migration لازم نوشته شده باشد.
2. تست مثبت، منفی، مالکیت و Failure path مربوط پاس شود.
3. Lint، Typecheck و Build بدون خطا باشد.
4. UI در هر دو تم، RTL و Breakpointهای هدف بازبینی شود.
5. امنیت، Audit و Observability بخش‌های حساس بررسی شود.
6. اسناد و وضعیت همین نقشه راه با شواهد واقعی به‌روزرسانی شود.
