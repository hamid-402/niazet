# فاز ۲ — هسته تراکنشی سفارش و مالی

این سند وضعیت نهایی فاز ۲ و قراردادهای اجرایی آن را ثبت می‌کند.

## قواعد غیرقابل دورزدن

- تمام mutationهای مالی باید هدر `Idempotency-Key` با طول ۸ تا ۱۲۸ نویسه امن داشته باشند. وب‌اپ برای هر mutation یک UUID می‌سازد و همان کلید در retry احراز هویت حفظ می‌شود.
- Payment، Escrow release/refund، تایید سفارش، حل اختلاف، لغو مالی، برداشت و تایید milestone در تراکنش `Serializable` اجرا می‌شوند.
- `orders.version` و شرط وضعیت قبلی، تغییر هم‌زمان وضعیت را با Optimistic Concurrency متوقف می‌کند.
- هر گذار سفارش actor/source مجاز، note، History و `financialEffectType` دارد. خروج از `disputed` فقط در `resolve-dispute` ممکن است.
- `ledger_entries` و `wallet_transactions` در PostgreSQL با Trigger از Update/Delete محافظت می‌شوند. اصلاح فقط با Correction entry معکوس انجام می‌شود.
- Wallet فقط projection هم‌تراکنش Ledger است؛ تست `npm run phase2:db-integrity` Trigger و تطبیق موجودی را بررسی می‌کند.

## قرارداد دامنه

- پکیج باید فعال و متعلق به خدمت فعال باشد و snapshot نام، مبلغ، SLA و deliverable هنگام ساخت سفارش ذخیره می‌شود.
- مجری باید کاربر فعال، پروفایل تاییدشده، ظرفیت کمتر از ۱۰۰، عضو تیم انتخابی و—در صورت تعریف مهارت دسته‌بندی‌شده—دارای مهارت سازگار باشد.
- بازبین QC نمی‌تواند مجری همان سفارش باشد. تمام آیتم‌های checklist و حداقل یک خروجی اسکن‌شده الزامی‌اند.
- تایید QC معیارهای پذیرش را تایید می‌کند؛ درخواست اصلاح، شناسه معیارها و سقف revision را اتمیک کنترل می‌کند.
- milestoneها باید جمعاً برابر قیمت نهایی باشند؛ هر مرحله پرداخت، تحویل، تایید و آزادسازی Escrow مستقل دارد.

## مالی و عملیات

- داشبورد مالی GMV، Revenue/Commission، Escrow، Wallet liability و Refund را جدا گزارش می‌کند.
- Reconciliation هر شب ساعت ۰۲ به وقت `Asia/Tehran` اجرا می‌شود. مغایرت، Audit بحرانی، Outbox و اعلان finance/super admin می‌سازد.
- فاکتور برای هر سفارش یکتا است و endpoint دانلود PDF مالکیت مشتری را کنترل می‌کند.
- برداشت فقط بین حداقل/حداکثر تنظیم‌شده، از موجودی آزاد و به شبای معتبر MOD-97 که مدیر تایید کرده انجام می‌شود.
- SLA تیکت بر مبنای ساعت کاری ۰۹–۱۸ تهران، تعطیلی پنجشنبه/جمعه و `calendar.iran_holidays` محاسبه می‌شود.

## Endpointهای افزوده‌شده

- `POST /v1/admin/orders/:id/milestones`
- `POST /v1/executor/orders/:id/milestones/:milestoneId/deliver`
- `POST /v1/customer/orders/:id/milestones/:milestoneId/approve`
- `GET /v1/customer/invoices/:id/pdf`
- `POST /v1/customer/withdrawals`
- `POST /v1/admin/finance/withdrawals/verify-shaba`
- `POST /v1/admin/finance/ledger/:id/correction`
- `POST /v1/admin/finance/reconciliation/run`

## تایید فاز

```powershell
cd apps/api
npm run build
npm test -- --runInBand
npm run security:matrix
npm run phase2:db-integrity

cd ../web
npm run build
```
