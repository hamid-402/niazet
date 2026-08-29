# قرارداد عملیات کارکنان — فاز ۵

این بخش نقطه واحد مدیریت Team، Skill، نوع همکاری، احراز صلاحیت، حضور، ظرفیت و دسترسی حساب مجری است.

## قواعد اصلی

- مجری بیرونی هنگام ایجاد با `verification_status=pending` ثبت می‌شود؛ کارمند داخلی پیش‌فرض `approved` است.
- موتور تخصیص فقط مجری فعال، تأییدشده، دارای ظرفیت و مهارت سازگار را می‌پذیرد.
- ظرفیت در بازه صفر تا صد نگهداری می‌شود و هر تغییر یک `staff_capacity_snapshot` می‌سازد.
- ظرفیت ۱۰۰ درصد وضعیت فعال/بیش‌ازظرفیت را به `over_capacity` تغییر می‌دهد؛ کاهش ظرفیت آن را به `active` بازمی‌گرداند.
- برای هر مجری و هر تاریخ فقط یک رکورد حضور وجود دارد. ثبت دوباره همان تاریخ یک اصلاح Audit‌شده است.
- تغییر access، همه نشست‌های فعال مجری را باطل می‌کند تا سیاست جدید فوری اعمال شود.
- capability اضافه فقط `customer` است؛ نقش اصلی مجری در `users.role` ثابت می‌ماند.
- تغییر وضعیت، ظرفیت، پروفایل، مهارت، حضور و دسترسی بدون یادداشت تصمیم پذیرفته نمی‌شود.

## endpointهای Ops Admin

- `GET/POST /v1/admin/teams`
- `GET/POST /v1/admin/skills`
- `GET/POST /v1/admin/staff`
- `GET /v1/admin/staff/:id`
- `PATCH /v1/admin/staff/:id/profile`
- `PATCH /v1/admin/staff/:id/status`
- `PATCH /v1/admin/staff/:id/capacity`
- `PATCH /v1/admin/staff/:id/skills`
- `GET/PATCH /v1/admin/staff/:id/attendance`
- `PATCH /v1/admin/staff/:id/access`

`super_admin` مطابق قاعده عمومی scope به endpointهای Ops دسترسی دارد؛ `finance_admin` پاسخ 403 می‌گیرد.

## پروفایل داخلی تب‌بندی‌شده

پروفایل داخلی مجری این تب‌ها را دارد:

- خلاصه، احراز و دسترسی حساب
- سفارش‌های مرتبط
- Snapshotهای عملکرد و ریسک
- امتیازها، شکایت‌ها و تشکرها
- مهارت‌ها و سطح تسلط
- ظرفیت، حضور و تاریخچه Snapshot ظرفیت
- History تصمیم‌های مدیریتی از Audit log با actor و before/after

## داده حضور

وضعیت‌های مجاز:

- `present`
- `remote`
- `leave`
- `sick_leave`
- `absent`

بازه گزارش حضور حداکثر ۳۶۶ روز است و تاریخ با قالب ISO دریافت می‌شود.

## آزمون قرارداد

پس از روشن بودن API روی 3001 و Web روی 3002:

```powershell
cd apps/api
npm.cmd run phase5:staff-contract
```
