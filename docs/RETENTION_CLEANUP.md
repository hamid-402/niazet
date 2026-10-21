# عملیات Retention و Cleanup

Cleanup دوره‌ای «نیازت» از همان Job Runner دیتابیس‌محور استفاده می‌کند؛ run key یکتا مانع اجرای تکراری در یک بازه می‌شود و advisory lock از اجرای هم‌زمان چند replica جلوگیری می‌کند. هر اجرا batch محدود دارد تا lock طولانی و جهش بار ایجاد نشود و نتیجه در `background_job_runs`، Metrics و Audit ثبت می‌شود.

## سیاست پیش‌فرض

| داده | Retention | رفتار |
| --- | ---: | --- |
| Session منقضی یا باطل‌شده | ۳۰ روز | فرصت بررسی reuse و رخداد امنیتی حفظ می‌شود. |
| OTP مصرف‌شده یا منقضی | ۷ روز | hash کد پس از دوره کوتاه عملیاتی حذف می‌شود. |
| Idempotency منقضی | ۱ روز grace بعد از expiry | replay تا پایان TTL و grace حفظ می‌شود. |
| Outbox با وضعیت `sent` | ۳۰ روز | deliveryهای وابسته cascade و reference اعلان‌ها null می‌شود. |
| Outbox با وضعیت `dead_letter` | ۹۰ روز | فرصت بررسی و replay دستی حفظ می‌شود. |
| Outbox با وضعیت `pending`، `failed` یا `processing` | حذف نمی‌شود | کار قابل اقدام هرگز توسط retention پاک نمی‌شود. |
| Signed URL منقضی، مصرف‌شده یا revoked | ۷ روز | فقط grant حذف می‌شود، نه فایل اصلی. |
| Background job run تکمیل‌شده | ۳۰ روز | اجرای جاری و ناقص حذف نمی‌شود. |
| فایل infected/rejected | ۲۴ ساعت | payload فیزیکی حذف و metadata با `purgedAt` برای Audit حفظ می‌شود. |
| فایل فیزیکی orphan | ۶۰ دقیقه grace | فقط فایل معمولی داخل rootهای upload/quarantine و بدون رکورد DB حذف می‌شود. |

تمام مقدارها از متغیرهای مستندشده در `.env.production.example` قابل تغییرند. کاهش retention امنیتی یا مالی باید با تأیید مالک داده انجام شود. `DATA_CLEANUP_BATCH_SIZE` پیش‌فرض ۵۰۰ و حداکثر ۵۰۰۰ است؛ اگر نتیجه به سقف batch رسید، job در بازه بعد ادامه می‌دهد.

## اجرا و کنترل

دو job جدید `cleanup_expired_records` و `cleanup_storage_files` هستند. زمان‌بندی به‌ترتیب هر ۳۶۰ و ۶۰ دقیقه است. اجرای دستی فقط برای ادمین با scope `super_admin` مجاز است:

```http
POST /v1/admin/jobs/cleanup_expired_records/run
POST /v1/admin/jobs/cleanup_storage_files/run
```

پیش از کاهش retention یا اجرای دستی در رخداد عملیاتی، backup معتبر و ظرفیت DB بررسی شود. پس از اجرا، `processed` و breakdown هر مدل، Audit با actionهای `data.cleanup` و `file.cleanup`، شمار خطا و metric job کنترل شوند. تکرار اجرای دستی در همان interval عمداً با نتیجه `already_run` رد می‌شود.

## Failure path

اگر lock در دست replica دیگری باشد، job بدون حذف با وضعیت skipped پایان می‌یابد. خطای دیتابیس transaction حذف رکوردها را rollback می‌کند. حذف فایل فقط پس از کنترل containment، regular-file بودن، grace period و نبود metadata انجام می‌شود؛ symlink، directory و مسیر خارج از storage root رد می‌شوند. `FILE_CLEANUP_ENABLED=false` فقط cleanup فیزیکی را متوقف می‌کند و cleanup داده‌های منقضی مستقل باقی می‌ماند.
