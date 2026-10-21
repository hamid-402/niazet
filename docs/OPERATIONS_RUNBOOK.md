# استقرار، عملیات و پاسخ به رخداد

این Runbook همراه `DOCKER_PRODUCTION.md`، `DISASTER_RECOVERY.md`،
`PRODUCTION_PROVIDERS.md` و `SECRETS_AND_SUPPLY_CHAIN.md` اجرا می‌شود.

## پیش از استقرار

مسئول انتشار یک commit مشخص و CI موفق همان commit را ثبت می‌کند. migrationهای جدید
باید ابتدا روی دیتابیس staging با همان نسخه PostgreSQL اجرا و نتیجه در تیکت انتشار
ثبت شوند. برای تغییر schema روش expand/contract لازم است: ابتدا ستون/جدول سازگار اضافه،
سپس کد جدید و backfill، و حذف ساختار قدیمی فقط در انتشار بعدی با تأیید مستقل.
شماره نسخه image قبلی، زمان backup آزموده‌شده و مسئول rollback در تیکت ثبت شود.

پیکربندی را روی میزبان Production بررسی کنید:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Secretها را در خروجی `config` چاپ نکنید. پورت API و Web باید پشت reverse proxy HTTPS
باشند؛ PostgreSQL، ClamAV و Bucket عمومی نیستند. API startup migration را اجرا می‌کند؛
در صورت شکست startup، آن را با restartهای پی‌درپی پنهان نکنید.

## پذیرش و مشاهده پس از انتشار

Liveness `/health` و Readiness `/ready` باید 200 باشند. جزئیات Readiness فقط برای ادمین
مجاز است. سپس ورود/خروج، یک درخواست، خواندن سفارش، تیکت و دانلود کنترل‌شده با حساب‌های
آزمایشی مجاز بررسی شوند. عملیات مالی واقعی فقط مطابق برنامه آزمون Provider اجرا شود.
تا ۳۰ دقیقه، نرخ 5xx، p95، backlog/age Outbox، خطای Worker و دانلود را با خط مبنای قبلی
مقایسه کنید. 5xx بالاتر از آستانه تنظیم‌شده، عدم دسترسی فایل یا اختلاف مالی شرط توقف
انتشار و شروع بررسی rollback است. زمان، commit و نتیجه آزمون در تیکت انتشار ثبت شود.

## کار روزانه

اپراتور هر روز Readiness، هشدارها، dead-letter، آخرین اجرای jobها و نتیجه تطبیق
Wallet/Ledger را بررسی می‌کند. نتیجه Backup شب قبل و ظرفیت دیسک Quarantine/DB/Storage
کنترل شود. پرداخت verifying قدیمی، refund و withdrawal معوق باید به ادمین مالی ارجاع
شوند؛ هیچ وضعیت مالی صرفاً برای پاک‌کردن هشدار دستی تغییر نکند. Replay job تنها بعد از
رفع علت و با idempotency انجام شود. دوره آزمون Restore و RPO/RTO در سند DR آمده است.

## پاسخ به رخداد

P1: اختلاف مالی، افشای اطلاعات، عدم دسترسی گسترده یا فایل ناامن قابل دانلود. فوراً یک
مسئول رخداد تعیین و تغییرات انتشار متوقف شود. correlation ID، زمان UTC، commit و دامنه
تأثیر حفظ شوند؛ Secret و محتوای خصوصی در تیکت وارد نشوند. مسئول فنی ورودی آسیب‌دیده را
در reverse proxy محدود می‌کند؛ در حادثه مالی مسیرهای write مالی متوقف می‌شوند، اما DB
و Ledger حذف یا اصلاح مستقیم نمی‌شوند. مسئول محصول اطلاع‌رسانی به کاربران متاثر را
هماهنگ می‌کند. برای افشای Secret روند rotation اضطراری سند امنیت اجرا شود.

P2: اختلال محدود Provider یا صف بدون از دست‌رفتن داده. Readiness و Outbox بررسی، retry
فقط با سقف موجود انجام، و خطا به Provider ارجاع شود. رفع موقت و رفع اصلی هر دو ثبت شوند.
پس از رفع، آزمون نقش‌های متاثر و reconciliation مالی اجرا شود. حداکثر دو روز کاری بعد
timeline، علت، داده متاثر، اقدام اصلاحی و تست جلوگیری از تکرار در postmortem ثبت شود.

## Rollback کد و Migration

اگر schema افزایشی با image قبلی سازگار است، ترافیک ورودی را مهار و image همان commit
قبلی را deploy کنید؛ migration موفق را از جدول Prisma پاک نکنید. اگر migration شکست
خورده، ابتدا خطا و وضعیت `_prisma_migrations` روی staging بازتولید شود. `migrate resolve`
تنها وقتی مجاز است که DBA ثابت کرده تراکنش برگشته یا تغییرات دقیقاً تکمیل شده‌اند؛ علامت
applied/rolled-back را حدسی ثبت نکنید. برای تغییر ناسازگار، forward fix معمولاً کم‌خطرتر
از down migration است.

Restore دیتابیس تنها آخرین گزینه با تأیید مالک داده است: writeها متوقف، backup در مقصد
جداگانه بازیابی، رویدادهای مالی پس از backup با درگاه و ledger تطبیق، سپس ترافیک جابه‌جا
شود. Restore مستقیم روی DB جاری داده‌های جدید را از بین می‌برد و در این Runbook مجاز
نیست. دستورها و تأیید دقیق مقصد در `DISASTER_RECOVERY.md` آمده‌اند. پس از rollback نیز
ورود، سفارش، فایل، تیکت، Worker و تطبیق مالی دوباره بررسی شوند.
