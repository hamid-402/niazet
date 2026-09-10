# تست Integration با PostgreSQL واقعی

دستور اجرا از پوشه `apps/api`:

```powershell
npm.cmd run test:integration:postgres
```

Runner مقدار `DATABASE_URL` را از محیط یا `apps/api/.env` می‌خواند، اما مقدار آن را چاپ نمی‌کند. کنار دیتابیس اصلی، یک دیتابیس موقت و تصادفی با پیشوند `niazat_it_` می‌سازد و تمام migrationها را با `prisma migrate deploy` از صفر روی آن اعمال می‌کند. استفاده از دیتابیس مستقل باعث می‌شود extensionهایی مثل `pgcrypto` نیز دقیقاً مانند استقرار تازه نصب و بررسی شوند.

مواردی که واقعاً بررسی می‌شوند:

- تعداد و موفقیت تمام migrationهای موجود در مخزن؛
- Constraintهای مبلغ مثبت و حساب‌های بدهکار/بستانکار متمایز؛
- Unique index کلید Idempotency؛
- Unique index مرکب تحویل اعلان بر اساس Outbox Event و کانال؛
- Triggerهای append-only برای Ledger؛
- Rollback تراکنش در خطای برنامه و خطای واقعی Constraint؛
- Commit اتمیک چند نوشتن موفق.

پاک‌سازی در بلوک `finally` انجام می‌شود: اتصال‌های همان دیتابیس موقت بسته و سپس فقط نام تصادفی اعتبارسنجی‌شده با `DROP DATABASE` حذف می‌شود. runner پیش از اجرا کنترل می‌کند که این نام با دیتابیس تنظیم‌شده یکسان نباشد و هیچ دستور حذف روی دیتابیس اصلی یا schema عمومی اجرا نمی‌کند.

سه migration سازگاری، ترتیب تاریخی نادرست ایجاد `outbox_event_id` را بدون تغییر checksum migrationهای اجراشده اصلاح می‌کنند. در دیتابیس‌های موجود مرحله handoff یک no-op است؛ در نصب تازه، ستون آماده‌سازی خالی rename می‌شود تا migration اصلی ستون canonical را بسازد. این مسیر هیچ `DROP COLUMN` ندارد و index مرکب نهایی را تثبیت می‌کند.
