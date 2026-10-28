# راهنمای Backup و بازیابی بحران

این سند رویه عملیاتی نسخه فعلی «نیازت» برای تهیه Backup رمزنگاری‌شده، آزمون Restore، نگه‌داری نسخه‌ها و Disaster Recovery است. فایل‌های پشتیبان و کلیدها نباید در Git یا ایمیج برنامه ذخیره شوند.

## اهداف سرویس

- **RPO:** حداکثر ۶ ساعت در نسخه فعلی؛ Backup کامل رمزنگاری‌شده هر ۶ ساعت اجرا شود. برای رسیدن به RPO کمتر از ۱۵ دقیقه باید در فاز زیرساخت، WAL archiving و Point-in-Time Recovery افزوده شود.
- **RTO:** حداکثر ۲ ساعت برای بازیابی سرویس اصلی، شامل Restore، کنترل صحت، تغییر اتصال و Smoke test.
- اصل 3-2-1: حداقل سه کپی، روی دو نوع رسانه، و حداقل یک کپی خارج از محیط اصلی و ترجیحاً immutable نگه‌داری شود.
- Retention پایه: ۳۰ روز با حداقل ۷ Backup؛ سیاست سازمانی یا الزام قانونی می‌تواند این بازه را افزایش دهد.

## کنترل‌های امنیتی

Backup با AES-256-GCM رمز می‌شود؛ header و payload هر دو با authentication tag محافظت می‌شوند و فایل checksum جداگانه نیز دارد. کلید باید دقیقاً ۳۲ بایت و به‌صورت Base64 در secret manager نگه‌داری شود. `BACKUP_KEY_ID` شناسه کلید است، نه خود کلید.

- حساب اجراکننده فقط دسترسی لازم برای `pg_dump` و نوشتن در مقصد Backup را داشته باشد.
- متغیرهای `.env.backup` فقط روی ماشین امن عملیات ساخته شوند؛ فایل نمونه فاقد secret است.
- کلید جدید ابتدا فعال شود و کلیدهای قدیمی تا پایان Retention تمام Backupهای وابسته نگه‌داری شوند.
- دسترسی به مخزن off-site، اجرای Restore و حذف Backup باید audit شود.
- خروجی رمزگشایی‌شده روی دیسک موقت نوشته نمی‌شود؛ جریان داده مستقیم به `pg_restore` می‌رود.

## ساخت و اجرای Backup

ایمیج مستقل عملیات با PostgreSQL client ساخته می‌شود:

```bash
docker build -f apps/api/Dockerfile.backup -t niazat-backup:local apps/api
docker run --rm --env-file .env.backup -v /secure/niazat-backups:/secure-backups/niazat niazat-backup:local
```

تنظیمات ضروری در `.env.backup.example` مستند شده‌اند. فایل خروجی ابتدا با پسوند `.partial` ساخته و فقط پس از موفقیت کامل به نام نهایی منتقل می‌شود. هر اجرا باید فایل `.niazat.dump.enc` و manifest متناظر `.sha256` تولید کند. سپس هر دو فایل به storage خارج از سرور اصلی منتقل و ثبت شوند.

## Retention ایمن

ابتدا dry-run اجرا و فهرست نامزدها بازبینی شود؛ فقط نام‌هایی با الگوی رسمی Backup قابل حذف‌اند:

```bash
docker run --rm --env-file .env.backup --entrypoint node -v /secure/niazat-backups:/secure-backups/niazat niazat-backup:local /opt/niazat/backup-retention.mjs
```

پس از تأیید خروجی، `BACKUP_RETENTION_APPLY=true` تنظیم و همان فرمان دوباره اجرا شود. مسیر root، فایل‌های ناشناس، Backupهای جدیدتر از بازه و حداقل تعداد نگه‌داری حذف نمی‌شوند.

## رویه بازیابی

1. رخداد ثبت، مسئول Incident مشخص و تغییرات پایگاه داده متوقف شود؛ در صورت امکان سرویس write به maintenance/read-only برود.
2. Backup مناسب براساس timestamp، شناسه کلید و RPO انتخاب و هر دو فایل archive و checksum از storage مستقل دریافت شوند.
3. ابتدا در یک دیتابیس تازه و ایزوله Restore شود؛ هرگز مقصد را بدون snapshot و تأیید نام دقیق جایگزین نکنید.
4. متغیرهای `BACKUP_FILE`، `RESTORE_DATABASE_URL` و `RESTORE_CONFIRM_DATABASE` تنظیم شوند. مقدار تأیید باید دقیقاً با نام دیتابیس مقصد برابر باشد.
5. Restore اجرا شود. اسکریپت پیش از اتصال، checksum و AES-GCM authentication کل فایل را بررسی می‌کند و `pg_restore` را با `--single-transaction` اجرا می‌کند:

```bash
docker run --rm --env-file .env.backup --entrypoint node -v /secure/niazat-backups:/secure-backups/niazat niazat-backup:local /opt/niazat/backup-restore.mjs
```

6. migration status، تعداد جدول‌ها، رکوردهای حیاتی، ارتباط فایل‌ها با metadata، صف outbox و حساب‌های نقش‌دار کنترل شوند.
7. API با دیتابیس بازیابی‌شده بالا بیاید؛ `/ready`، تست ورود، سفارش، پرداخت آزمایشی، اعلان و دسترسی فایل اجرا شود.
8. پس از تأیید مسئول فنی و مالک کسب‌وکار، اتصال production به مقصد جدید تغییر کند و برای خطا، latency و reconciliation پایش فعال باشد.
9. زمان آخرین داده سالم، میزان data loss نسبت به RPO، زمان دستیابی به RTO و تمام تصمیم‌ها در گزارش رخداد ثبت شوند.

## Failback و Rollback

دیتابیس قبلی تا پایان پنجره تأیید به‌صورت read-only و بدون حذف نگه‌داری شود. اگر صحت داده یا Smoke test رد شد، ترافیک به محیط قبلی برگردد، اتصال مقصد جدید قطع و علت شکست ثبت شود. برای Failback پس از پایدارشدن، ابتدا اختلاف داده‌های ایجادشده در دوره بحران reconcile، سپس یک Backup تازه و آزمون‌شده تهیه و جابه‌جایی در پنجره نگه‌داری انجام شود.

## آزمون دوره‌ای و شواهد

- هر Backup: کنترل موفقیت job، اندازه غیرصفر، checksum، upload خارج از محیط و هشدار شکست.
- ماهانه: Restore خودکار در دیتابیس disposable و مقایسه probe data و تعداد جدول‌ها.
- فصلی: مانور کامل DR با حضور تیم محصول و عملیات، اندازه‌گیری واقعی RPO/RTO و تمرین Failback.
- سالانه یا پس از تغییر معماری: بازبینی retention، دسترسی‌ها، ظرفیت storage، سازگاری نسخه PostgreSQL و سناریوی از دست رفتن کامل region.

CI نیز یک دیتابیس مستقل با پسوند `_restore_test` می‌سازد، Backup رمزنگاری‌شده واقعی می‌گیرد، آن را Restore می‌کند، داده و تعداد جدول‌ها را می‌سنجد، دستکاری archive را رد می‌کند و Retention را در حالت dry-run و apply آزمایش می‌کند. خروجی CI، شناسه run، checksum، key ID و نتیجه مانور باید به‌عنوان evidence نگه‌داری شود؛ خود کلید یا URL دارای credential نباید وارد log شود.
