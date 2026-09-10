# Design System «نیازت با ما»

مرجع اجرایی سیستم طراحی در `apps/web/src/app/globals.css` است. کامپوننت‌ها باید از tokenهای معنایی استفاده کنند؛ رنگ palette خام مانند `slate-500` یا عدد دلخواه برای z-index مجاز نیست.

## پایه‌ها

- Color: سطح‌ها، متن، border، accent و stateهای success/warning/danger/info برای هر دو تم «لاجورد و عسل» تعریف شده‌اند.
- Type: مقیاس `caption`، `body-sm`، `body`، `body-lg`، heading و display با فونت Vazirmatn و line-height مناسب فارسی.
- Spacing و Grid: `page-container`، `reading-container` و grid دوازده‌ستونه `layout-grid` از gutter و gap سیال استفاده می‌کنند.
- Radius و Shadow: فقط `control`، `card`، `modal`، `pill` و elevationهای ۱ تا ۴.
- Icon: اندازه‌های `icon-sm`، `icon-md` و `icon-lg`؛ آیکن تنها باید نام دسترس‌پذیر داشته باشد.
- State: رنگ‌های semantic، focus ring مشترک، disabled opacity/cursor و reduced motion.
- Breakpoint: از `xs` تا `2xl`؛ طراحی پایه موبایل است و enhancement از breakpoint بالاتر انجام می‌شود.
- Density: حالت پیش‌فرض comfortable است؛ `data-density="compact"` ارتفاع کنترل، padding و gap را فشرده می‌کند.
- Z-index: فقط لایه‌های `dropdown`، `sticky`، `overlay`، `modal`، `toast` و `popover`.

## قواعد مصرف

1. رنگ را براساس معنای محتوا انتخاب کنید، نه ظاهر یک تم خاص.
2. کنترل جدید از `Button`، `Field` و `inputClass` مشترک استفاده کند.
3. صفحه اصلی از `page-container` و متن طولانی از `reading-container` استفاده کند.
4. مقدار arbitrary برای radius، shadow و z-index اضافه نشود؛ اگر نیاز واقعی جدیدی وجود دارد ابتدا token تعریف شود.
5. قبل از commit، `npm run phase6:design-system-contract` در `apps/web` اجرا شود.
