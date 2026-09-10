# Liveness و Readiness

سه سطح بررسی وجود دارد:

- `GET /health`: فقط زنده‌بودن process؛ به وابستگی خارجی وصل نمی‌شود.
- `GET /ready`: پاسخ عمومی کم‌جزئیات با وضعیت Database، Storage، Queue، SMS، Email و Payment.
  اگر هر وابستگی حیاتی آماده نباشد status code برابر ۵۰۳ است.
- `GET /v1/admin/health/readiness`: جزئیات امن latency، backlog، stale lock، dead-letter و
  adapter فعال؛ فقط برای نقش admin و scopeهای رسمی.

Storage با ساخت فایل تصادفی با سطح دسترسی محدود و حذف قطعی آن بررسی می‌شود. Queue از جدول
durable outbox خوانده می‌شود و backlog، سن قدیمی‌ترین پیام آماده، lock رهاشده و dead-letterهای
۲۴ ساعت اخیر را با thresholdهای env مقایسه می‌کند. probeها timeout و cache کوتاه دارند تا خود
healthcheck باعث بار یا اختلال نشود.

بررسی SMS، Email و Payment نام driver پیکربندی‌شده را با adapter واقعاً فعال مقایسه می‌کند.
در توسعه `mock` آماده است؛ اگر در Production فقط نام یک provider واقعی در env نوشته شده ولی
adapter آن هنوز پیاده‌سازی نشده باشد، readiness عمداً ۵۰۳ می‌دهد. بنابراین تغییر env به‌تنهایی
نمی‌تواند اتصال واقعی را جعل کند.

Docker و Compose از `/ready` استفاده می‌کنند؛ Web فقط پس از آماده‌شدن API شروع می‌شود. وضعیت
هر dependency در metric `niazat_dependency_ready` نیز منتشر و شکست آن به رویداد ساخت‌یافته
`alert.triggered` تبدیل می‌شود.
