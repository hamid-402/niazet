# کنترل Runtime رابط کاربری

این gate مکمل قراردادهای استاتیک UI است و برنامه را با Chromium واقعی، API واقعی و PostgreSQL ایزوله بررسی می‌کند. Web پس از آماده‌شدن API و در برابر همان داده seedشده build می‌شود تا صفحات prerenderشده به وضعیت اتفاقی localhost وابسته نباشند. ماتریس شامل ۱۸ مسیر مهمان و نقش‌دار، چهار عرض ۳۲۰، ۷۶۸، ۱۲۸۰ و ۱۹۲۰ و دو تم روشن و تیره است؛ در نتیجه هر اجرا ۱۴۴ وضعیت واقعی را می‌سنجد.

برای هر وضعیت، screenshot کامل فقط در `.artifacts/ui-runtime` یا artifact چهارده‌روزه CI نگه‌داری می‌شود و وارد Git نمی‌شود. baseline فشرده و متنی فقط ساختار معنایی، رنگ‌های تم، تعداد عناصر قابل‌مشاهده و هندسه landmarkها را ثبت می‌کند؛ بنابراین regression قابل تشخیص است بدون آنکه مخزن با صدها تصویر سنگین شود.

Axe قوانین WCAG 2.0/2.1 سطح A و AA را اجرا می‌کند. علاوه بر آن، overflow افقی، ID تکراری، کنترل کوچک‌تر از ۲۴ پیکسل، metadata فارسی/RTL و تم واقعی بررسی می‌شوند. جریان Keyboard نیز Skip Link، listbox انتخاب تم، Escape و بازگرداندن Focus در Drawer عمومی و پنل نقش‌دار را واقعاً اجرا می‌کند.

تست هر بار دیتابیس `niazat_ui_*` می‌سازد، migrate و seed می‌کند و API و Next production را روی پورت‌های تصادفی محلی بالا می‌آورد. مقصد خارجی قابل تنظیم نیست و در پایان پردازش‌ها و دیتابیس موقت حذف می‌شوند.

## دستورها

- اجرای معمول: `npm run phase8:ui-runtime`
- بازسازی آگاهانه baseline: مقدار `UI_BASELINE_UPDATE_CONFIRM` برابر `niazat_update_visual_baseline` و سپس `npm run phase8:ui-baseline`

بازسازی baseline فقط پس از بازبینی artifact تصویری مجاز است. در ویندوز runner از Chromium نصب‌شده Playwright یا Chrome/Edge سیستم استفاده می‌کند؛ فایل مرورگر Playwright در صورت نصب دستی باید داخل `_runtime/playwright` نگه‌داری شود. CI مرورگر و وابستگی‌های Linux را در فضای موقت runner نصب می‌کند.
