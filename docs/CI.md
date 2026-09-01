# Continuous Integration

Workflow اصلی در `.github/workflows/ci.yml` روی هر Push و Pull Request اجرا می‌شود و سه gate مستقل دارد:

1. `quality`: نصب قفل‌شده با `npm ci`، Format-check، lint، typecheck، تست‌های Unit و قراردادهای UI؛
2. `postgres`: PostgreSQL 16 واقعی، `prisma migrate deploy/status`، Integration و E2E کامل نقش‌ها و workflow؛
3. `build`: فقط پس از موفقیت دو gate قبل، build تولیدی API و Web.

`permissions: contents: read` حداقل دسترسی لازم را اعمال می‌کند، اجرای قدیمی همان branch با `concurrency` لغو می‌شود و هر job محدودیت زمانی دارد. Secretهای داخل workflow فقط مقادیر ثابت محیط test هستند و هیچ credential محیط واقعی یا فایل `.env` وارد Git نمی‌شود.

Jobهای بدون PostgreSQL نیز یک `DATABASE_URL` صرفاً نحوی دارند و پیش از lint/typecheck، `prisma generate` را صریح اجرا می‌کنند؛ این URL برای اتصال استفاده نمی‌شود و فقط بارگذاری `prisma.config.ts` و تولید typeهای Client را در محیط تمیز Linux پایدار می‌کند.

معادل بررسی‌های اصلی روی لوکال:

```powershell
node scripts/format-check.mjs
npm.cmd run lint:check --prefix apps/api
npm.cmd run typecheck --prefix apps/api
npm.cmd test --prefix apps/api -- --runInBand
npm.cmd run lint --prefix apps/web
npm.cmd run typecheck --prefix apps/web
npm.cmd run phase8:ui-quality-contract --prefix apps/web
```

تست‌های PostgreSQL و E2E دیتابیس‌های تصادفی خودشان را می‌سازند و در `finally` پاک می‌کنند؛ workflow به دیتابیس توسعه یا production متصل نمی‌شود.
