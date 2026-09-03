# اجرای Production با Docker

دو image مستقل و چندمرحله‌ای در `apps/api/Dockerfile` و `apps/web/Dockerfile` ساخته
می‌شوند. stage نهایی هر دو با کاربر `node` اجرا می‌شود، سورس و وابستگی‌های توسعه را حمل
نمی‌کند و healthcheck داخلی دارد. API قبل از اجرای Nest، فرمان `prisma migrate deploy` را
اجرا می‌کند و در صورت شکست migration بالا نمی‌آید.

## پیش‌نیازهای انتشار

- Docker Engine به‌روز و Docker Compose v2
- PostgreSQL مدیریت‌شده با TLS، پشتیبان‌گیری و حساب کم‌دسترسی
- ClamAV قابل دسترسی از شبکه خصوصی
- درگاه پرداخت، SMS و Email واقعی که adapter آن‌ها در برنامه پیاده‌سازی و آزموده شده باشد
- دو secret تصادفی و متفاوت با حداقل ۳۲ نویسه برای access و download token
- دامنه HTTPS و reverse proxy یا load balancer برای TLS

اتصال adapterهای واقعی پرداخت، SMS و Email هنوز آیتم جداگانه فاز ۸ است. تا تکمیل و آزمون
آن آیتم، این compose زیرساخت امن ساخت و اجرا را آماده می‌کند اما مجوز انتشار عمومی محصول
نیست.

## آماده‌سازی و اجرا

1. `.env.production.example` را با نام `.env.production` کپی کنید.
2. تمام مقدارهای `REPLACE_*` و آدرس‌های نمونه را با secret و endpoint واقعی جایگزین کنید.
3. فایل `.env.production` را وارد Git یا image نکنید؛ این نام در `.gitignore` است.
4. ابتدا پیکربندی را اعتبارسنجی و سپس سرویس‌ها را اجرا کنید:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Web روی پورت `3002` و API روی `3001` منتشر می‌شود. در محیط واقعی بهتر است این پورت‌ها فقط
برای reverse proxy شبکه داخلی قابل دسترسی باشند. filesystem کانتینرها read-only است؛ فقط
`niazat_storage` برای upload/quarantine و cache موقت Web قابل نوشتن است.

## Migration و rollback

startup API فقط migrationهای forward و ثبت‌شده Prisma را با `migrate deploy` اعمال می‌کند.
اگر migration شکست بخورد API با exit code غیرصفر متوقف می‌شود و Web به دلیل health dependency
بالا نمی‌آید. rollback دیتابیس نباید با تغییر دستی schema انجام شود؛ ابتدا سرویس متوقف، snapshot
رمزنگاری‌شده بازیابی و سپس image قبلی deploy شود. Runbook کامل backup/restore و rollback در
آیتم‌های بعدی فاز ۸ تکمیل می‌شود.

## بررسی مستقل

```powershell
node scripts/phase8-docker-contract.mjs
docker build -t niazat-api:verify apps/api
docker build -f apps/web/Dockerfile -t niazat-web:verify .
```

CI همین قرارداد و ساخت هر دو image را روی Linux اجرا می‌کند؛ بنابراین ناسازگاری Dockerfile یا
standalone output پیش از merge آشکار می‌شود.
