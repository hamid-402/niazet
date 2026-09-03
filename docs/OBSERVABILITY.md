# Observability و هشدار عملیاتی

API تمام logها را به‌صورت یک JSON در هر خط می‌نویسد. هر رکورد زمان، سطح، سرویس، محیط،
`correlationId`، `traceId`، `spanId` و منبع را دارد. کلیدهای رمز، token، cookie، OTP، اطلاعات
تماس و بانکی پیش از خروج حذف می‌شوند؛ body و query درخواست نیز log نمی‌شود.

Middleware ورودی `X-Correlation-Id` امن را حفظ می‌کند و برای مقدار نامعتبر UUID می‌سازد.
هدر استاندارد W3C `traceparent` ادامه داده می‌شود و span جدید API در پاسخ برمی‌گردد. BFF وب
هر دو هدر را در رفت‌وبرگشت نگه می‌دارد.

## Metrics

`GET /metrics` خروجی Prometheus شامل تعداد و مدت HTTP با route کم‌کاردینالیتی، درخواست‌های
فعال، نتیجه jobها، alertها، uptime و حافظه resident می‌دهد. در Production دسترسی فقط با یکی
از هدرهای زیر و `OBSERVABILITY_TOKEN` تصادفی حداقل ۳۲ نویسه مجاز است:

```text
Authorization: Bearer <OBSERVABILITY_TOKEN>
X-Observability-Token: <OBSERVABILITY_TOKEN>
```

این endpoint باید فقط در شبکه monitoring در دسترس باشد و token آن جدا از access/download
secret نگهداری و دوره‌ای تعویض شود.

## Alertهای داخلی

- نرخ 5xx در پنجره `ALERT_WINDOW_SECONDS` پس از حداقل `ALERT_MIN_REQUESTS`
- درخواست کندتر از `ALERT_SLOW_REQUEST_MS`
- cooldown مستقل هر نوع alert با `ALERT_COOLDOWN_SECONDS`

trigger یک log ساخت‌یافته `alert.triggered` و counter با severity تولید می‌کند. سامانه جمع‌آوری
log/Prometheus باید این رخدادها را به Pager/Email/Chat سازمان متصل کند. مقدار آغازین پیشنهادی
برای alert بیرونی: نرخ 5xx بیش از ۱۰٪ در ۵ دقیقه، dead-letter بیش از صفر و عدم scrape موفق
بیش از دو interval است. اتصال مقصد واقعی و secret آن باید در زیرساخت استقرار انجام شود، نه در Git.
