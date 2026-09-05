# نیازت با ما

سامانه خدمات مدیریت‌شده «نیازت با ما» — مشتری خدمات تخصصی سفارش می‌دهد و تیم اجرای داخلی شرکت،
با کنترل کیفیت، escrow و گزارش مرحله‌ای، آن را انجام می‌دهد.

اسناد مرجع محصول/معماری در `docs/specs/` و نقشه راه پیاده‌سازی در `docs/ROADMAP.md` قرار دارد.

فایل‌های حجیم قابل بازسازی مانند `node_modules` و Cache ساخت، از کد منبع جدا و داخل
`_runtime` نگهداری می‌شوند. راهنمای اتصال، جداسازی و تشخیص فایل‌های واقعی پروژه در
`docs/LOCAL_RUNTIME.md` است.

## ساختار مخزن

```
apps/
  api/   # بک‌اند NestJS + Prisma + PostgreSQL
  web/   # فرانت‌اند Next.js (App Router) + Tailwind CSS
docs/
  specs/     # اسناد مرجع محصول و معماری
  ROADMAP.md # نظر، سوالات و نقشه راه
```

## اجرای محلی

بار اول وابستگی‌ها را مستقیماً در محیط جداشده نصب کنید و سپس هر دو برنامه را بالا بیاورید:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\runtime.ps1 install
powershell -ExecutionPolicy Bypass -File .\scripts\local.ps1 start
```

سایت در `http://localhost:3002` و API در `http://localhost:3001` در دسترس است. پورت ۳۰۰۲ عمداً ثابت شده تا با برنامه‌های دیگری که معمولاً روی ۳۰۰۰ اجرا می‌شوند برخورد نکند. برای وضعیت یا توقف:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\local.ps1 stop
```

### پیش‌نیاز: دیتابیس Postgres

```bash
docker compose up -d postgres
```

یا اگر Postgres را مستقیم روی سیستم نصب کرده‌اید، کافی است دیتابیسی به نام `niazat` بسازید.

### بک‌اند (apps/api)

```bash
cd apps/api
cp .env.example .env   # و در صورت نیاز DATABASE_URL را اصلاح کنید
npx prisma migrate dev
npx tsx prisma/seed.ts
npm run start:dev       # http://localhost:3001 (مستندات Swagger در /docs)
```

اطلاعات ورود کاربران نمونه (رمز مشترک `Passw0rd!123`) در خروجی seed چاپ می‌شود.

برای تست دستی کل چرخه عمر یک سفارش:

```bash
bash scripts/e2e-smoke.sh
```

### فرانت‌اند (apps/web)

```bash
cd apps/web
cp .env.local.example .env.local
npm run dev              # http://localhost:3000
```

## تست و کیفیت کد

```bash
cd apps/api && npm run lint && npm test && npm run build
cd apps/web && npm run lint && npm run build
```

## وضعیت پروژه

این مخزن در حال ساخت افزایشی طبق `docs/ROADMAP.md` است. برای وضعیت دقیق هر بخش (تکمیل‌شده /
در دست اقدام / فاز بعد) همان سند را ببینید.
