# نیازت با ما

سامانه خدمات مدیریت‌شده «نیازت با ما» — مشتری خدمات تخصصی سفارش می‌دهد و تیم اجرای داخلی شرکت،
با کنترل کیفیت، escrow و گزارش مرحله‌ای، آن را انجام می‌دهد.

اسناد مرجع محصول/معماری در `docs/specs/` و نقشه راه پیاده‌سازی در `docs/ROADMAP.md` قرار دارد.

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

### پیش‌نیاز: دیتابیس Postgres

```bash
docker compose up -d postgres
```

یا اگر Postgres را مستقیم روی سیستم نصب کرده‌اید، کافی است دیتابیسی به نام `niazat` بسازید.

### بک‌اند (apps/api)

```bash
cd apps/api
cp .env.example .env   # و در صورت نیاز DATABASE_URL را اصلاح کنید
npm install
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
npm install
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
