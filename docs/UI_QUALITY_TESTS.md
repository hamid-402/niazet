# آزمون کیفیت UI، دسترس‌پذیری و Visual Regression

قراردادهای قابل اجرای بدون مرورگر از پوشه `apps/web`:

```powershell
npm.cmd run phase8:ui-quality-contract
npm.cmd run phase8:visual-matrix
```

این مجموعه ۱۳ قرارداد قبلی طراحی و UI را یک‌جا اجرا می‌کند و موارد زیر را نیز الزام‌آور می‌کند:

- زبان فارسی، جهت RTL، Skip Link و مقصد محتوای اصلی؛
- Focus visible، reduced motion و جلوگیری از overflow افقی؛
- Focus trap، Escape و بازگرداندن تمرکز در Drawer و Modal؛
- شناسه یکتای ARIA و اتصال trigger به منوی موبایل، انتخاب‌گر تم و مرکز اعلان‌ها؛
- حرکت با Arrow، Home، End و Escape در انتخاب‌گر پوسته؛
- جدول‌های واکنش‌گرا و نقاط شکست ۳۲۰، ۷۶۸، ۱۲۸۰ و ۱۹۲۰ پیکسل؛
- کنتراست توکن‌های هر دو پوسته و احترام به `prefers-reduced-motion`؛
- Loading، Empty، Error، RTL formatting، Microcopy و کنترل‌های فهرست.

ماتریس Visual Regression شامل ۱۸ سناریوی عمومی و نقش‌محور، چهار viewport و دو پوسته `simple-light` و `simple-dark` است؛ در مجموع ۱۴۴ snapshot قطعی با animation خاموش و آستانه اختلاف حداکثر ۰٫۵٪.

تولید baseline و مقایسه تصویری فقط باید با مرورگر داخلی Codex انجام شود. در وضعیت فعلی، اتصال آن در سطح sandbox ویندوز با ACL متوقف می‌شود؛ بنابراین تا ثبت شواهد runtime، مورد Visual Regression در Roadmap باز می‌ماند و اسکریپت مستقل Playwright به‌عنوان جایگزین اجرا نمی‌شود.

