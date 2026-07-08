# الحاقیه سند معماری v4 — جدول گذار وضعیت سفارش و رابطه Ledger/Wallet

> این سند مکمل `niazat_master_final_architecture_v4.md` است و دقیقاً دو خلأ مشخص‌شده را پر می‌کند: (۱) جدول گذار صریح برای وضعیت‌های ۲۰گانه سفارش، (۲) رابطه منبع حقیقت بین `ledger_entries` و `wallet_transactions`. جایگزین بخش ۱۴.۲ سند v4 می‌شود و بخش ۱۲.۶/۱۶.۴ آن را تکمیل می‌کند.

---

## ۱. جدول گذار صریح وضعیت سفارش

### ۱.۱ فهرست وضعیت‌ها (مطابق سند v4، بخش ۱۴.۱)

`draft`, `submitted`, `pending_triage`, `triaging`, `pending_quote`, `quoted`, `pending_payment`, `paid`, `assigned`, `in_progress`, `submitted_for_qc`, `qc_in_review`, `qc_rejected`, `ready_for_customer_review`, `delivered`, `revision_requested`, `confirmed`, `disputed`, `cancelled`, `closed`

### ۱.۲ دیاگرام مسیر اصلی (happy path)

```
draft → submitted → pending_triage → triaging → pending_quote → quoted
  → pending_payment → paid → assigned → in_progress → submitted_for_qc
  → qc_in_review → ready_for_customer_review → delivered → confirmed → closed
```

### ۱.۳ جدول کامل گذارهای مجاز

| از وضعیت | به وضعیت(های) مجاز | مجاز برای | اثر مالی |
|---|---|---|---|
| `draft` | `submitted`, `cancelled` | customer | — |
| `submitted` | `pending_triage`, `cancelled` | سیستم (خودکار در ثبت) / admin | — |
| `pending_triage` | `triaging`, `cancelled` | `admin` با scope عملیاتی | — |
| `triaging` | `pending_quote` (لاین توافقی)، `quoted` (لاین ثابت/فرمولی، quote خودکار)، `cancelled` | `admin` با scope عملیاتی | — |
| `pending_quote` | `quoted`, `cancelled` | `admin` با scope عملیاتی | — |
| `quoted` | `pending_payment`, `cancelled` | customer (تأیید قیمت) / admin | — |
| `pending_payment` | `paid`, `cancelled` | سیستم (پس از verify پرداخت) | ساخت `payment` + `escrow_hold(status=held)` |
| `paid` | `assigned`, `cancelled` | `admin` با scope عملیاتی | لغو در این مرحله → `escrow_hold → refunded_to_customer` (۱۰۰٪) |
| `assigned` | `in_progress`, `cancelled` | executor (شروع کار) / admin | لغو در این مرحله → refund ۱۰۰٪ |
| `in_progress` | `submitted_for_qc`, `cancelled`, `disputed` | executor (ارسال برای QC) / admin (لغو یا dispute استثنایی) | لغو در این مرحله → طبق `refund_policy` (پیش‌فرض ۵۰٪ با تأیید ادمین) |
| `submitted_for_qc` | `qc_in_review` | سیستم (خودکار، صف QC) | — |
| `qc_in_review` | `qc_rejected`, `ready_for_customer_review` | reviewer QC (نقش جدا از executor) | — |
| `qc_rejected` | `in_progress` | سیستم (خودکار، بازگشت برای اصلاح) | — |
| `ready_for_customer_review` | `delivered` | سیستم (خودکار، بلافاصله پس از نمایش به مشتری) | — |
| `delivered` | `confirmed`, `revision_requested`, `disputed` | customer / سیستم (auto-confirm پس از پایان پنجره اعتراض) | — |
| `revision_requested` | `in_progress` | سیستم (خودکار، بازگشت به اجرا) | — |
| `disputed` | `in_progress` (نیاز به بازکاری), `refund_full → cancelled`, `refund_partial → closed`, `release_to_executor → confirmed` | فقط `admin` با scope مالی/عملیاتی از مسیر `resolve-dispute` | طبق تصمیم resolve-dispute — release/refund/partial |
| `confirmed` | `closed` | سیستم (خودکار) یا admin | `escrow_hold → released_to_executor` (منهای کارمزد) |
| `cancelled` | — (نهایی) | — | — |
| `closed` | — (نهایی) | — | — |

### ۱.۴ قواعد پیاده‌سازی (بدون تغییر نسبت به اصل سند v4)

- هیچ endpointای مستقیماً `order.status` را ست نمی‌کند؛ همه از `validate_transition(order, to_status, actor)` عبور می‌کنند که جدول بالا را چک می‌کند.
- هر گذار (حتی گذارهای خودکار سیستمی) یک رکورد در `order_status_history` می‌سازد؛ برای گذار سیستمی، `changed_by = NULL` و `source = 'system'`.
- گذار `disputed → *` **تنها** از طریق endpoint مشخص `resolve-dispute` مجاز است، نه از `PUT /orders/{id}/status` عمومی — چون این گذار همیشه باید اثر مالی، note و resolution type همراه داشته باشد.
- لغو (`cancelled`) از هر وضعیت غیرنهایی مجاز است اما اثر مالی‌اش (چقدر رفاند) وابسته به وضعیتی است که از آن لغو شده — مطابق ستون «اثر مالی» بالا.

### ۱.۵ نکته درباره QC reviewer

مطابق تصمیم قبلی سند v4 (بخش ۹.۱/۱۶.۱)، برای سفارش‌های حساس `qc_in_review` باید توسط کاربری غیر از `executor_id` همان سفارش انجام شود؛ این باید در سطح اپلیکیشن (نه فقط قرارداد) enforce شود — یعنی `assign_qc_reviewer()` نباید اجازه بدهد reviewer همان مجری باشد.

---

## ۲. رابطه Ledger و Wallet — منبع حقیقت

### ۲.۱ تصمیم

**`ledger_entries` منبع حقیقت مالی است. `wallets.balance` و `wallet_transactions` صرفاً یک cache مشتق‌شده (read-optimized projection) هستند، نه منبع مستقل.**

دلیل: اگر هر دو مستقل نوشته شوند (یکی برای هر تراکنش کیف پول، دیگری برای گزارش مالی)، دیر یا زود بین‌شان واگرایی پیش می‌آید — دقیقاً همان مشکلی که در سند بازیابی‌شده اول (نسخه صفر) با فیلد ساده `balance` داشتیم.

### ۲.۲ معماری لایه‌ای

```
   [عملیات مالی]  →  ledger_entries (منبع حقیقت، دوطرفه، تغییرناپذیر/append-only)
                              │
                              ▼
                  wallet_transactions (projection، برای نمایش سریع در UI کیف پول)
                              │
                              ▼
                     wallets.balance (cache نهایی، برای query سریع موجودی)
```

### ۲.۳ جدول ledger_accounts (حساب‌های داخلی سیستم)

```sql
CREATE TABLE ledger_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type    VARCHAR(30) NOT NULL,
                    -- customer_wallet | executor_wallet | platform_commission
                    -- | platform_escrow | payment_gateway_clearing
    owner_user_id   UUID REFERENCES users(id),  -- NULL برای حساب‌های سیستمی
    currency        VARCHAR(10) NOT NULL DEFAULT 'IRT',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

هر کاربر (مشتری/مجری) یک `ledger_account` از نوع `customer_wallet` یا `executor_wallet` دارد؛ به علاوه چند حساب سیستمی ثابت: `platform_escrow` (محل نگهداری وجه در امانت)، `platform_commission` (محل تجمیع کارمزد)، `payment_gateway_clearing` (واسط verify پرداخت).

### ۲.۴ جدول ledger_entries (منبع حقیقت، دوطرفه)

```sql
CREATE TABLE ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debit_account_id    UUID NOT NULL REFERENCES ledger_accounts(id),
    credit_account_id   UUID NOT NULL REFERENCES ledger_accounts(id),
    amount              INTEGER NOT NULL CHECK (amount > 0),
    currency            VARCHAR(10) NOT NULL DEFAULT 'IRT',
    reference_type      VARCHAR(30) NOT NULL,
                        -- payment | escrow_release | escrow_refund | withdrawal | commission
    reference_id        UUID NOT NULL,          -- order_id یا payment_id یا withdrawal_id
    idempotency_key     VARCHAR(100) UNIQUE,
    created_by          UUID REFERENCES users(id),  -- NULL برای سیستم
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);
```

قاعده حسابداری: هر entry دقیقاً یک debit و یک credit به یک مبلغ دارد (double-entry ساده). **رکوردهای `ledger_entries` هرگز UPDATE یا DELETE نمی‌شوند** — فقط INSERT. اصلاح یعنی یک entry جبرانی جدید، نه ویرایش قبلی.

### ۲.۵ مثال جریان مالی با ledger

**پرداخت مشتری و ورود به escrow:**
```
debit:  payment_gateway_clearing
credit: platform_escrow
amount: final_price
```

**تأیید تحویل و آزادسازی به مجری (با کسر کارمزد):**
```
entry 1 → debit: platform_escrow           credit: executor_wallet[executor_id]   amount: executor_amount
entry 2 → debit: platform_escrow           credit: platform_commission            amount: commission_amount
```

**رفاند کامل قبل از شروع کار:**
```
debit:  platform_escrow
credit: customer_wallet[customer_id]  (یا مستقیم بازگشت به درگاه پرداخت، بسته به سیاست)
amount: final_price
```

### ۲.۶ نقش wallets / wallet_transactions به‌عنوان cache

- `wallet_transactions` بلافاصله بعد از هر `ledger_entries` مرتبط با یک کاربر، به‌صورت derived نوشته می‌شود (در همان تراکنش دیتابیسی، نه async) — صرفاً برای نمایش سریع در پنل کیف پول بدون join سنگین روی ledger.
- `wallets.balance` عدد نهایی cache‌شده است که با هر `wallet_transaction` جدید آپدیت می‌شود.
- **قانون طلایی:** اگر همیشه `SUM(ledger_entries که credit_account = X) - SUM(ledger_entries که debit_account = X)` را برای یک حساب محاسبه کنیم، باید دقیقاً برابر `wallets.balance` همان کاربر باشد. یک job دوره‌ای (`verify_wallet_ledger_consistency`, هر شب) این تطبیق را چک می‌کند و در صورت واگرایی، به `finance_admin` هشدار `CRITICAL` می‌دهد.

### ۲.۷ چرا این لایه‌بندی به‌جای فقط ledger یا فقط wallet

- فقط `wallet_transactions` (پیشنهاد قبلی من در v2/v3): برای audit مالی جدی و گزارش مالیاتی سالانه (که خود سند v4 هم در بخش فاکتور خواسته) کافی نیست — چون تک‌ستونی و بدون مفهوم حساب دوطرفه است.
- فقط `ledger_entries` بدون wallet cache: هر بار نمایش موجودی کیف پول نیاز به aggregate روی کل تاریخچه ledger دارد — برای کاربر با تراکنش‌های زیاد کند می‌شود.
- ترکیب هر دو با قاعده‌ی «ledger منبع حقیقت، wallet cache مشتق» — هم سرعت UI را حفظ می‌کند هم صحت حسابداری را.

---

## ۳. تغییرات لازم در بقیه سند v4 (فقط ارجاع، نه بازنویسی کامل)

- بخش ۱۴.۲ سند v4 («اصول state machine») باید مستقیماً به بخش ۱ همین الحاقیه ارجاع بدهد.
- بخش ۱۲.۶ سند v4 («Ledger») باید مستقیماً به بخش ۲ همین الحاقیه ارجاع بدهد و بند «wallets/wallet_transactions باید cache باشند، نه منبع حقیقت مستقل» به قواعد غیرقابل مذاکره (بخش ۲۷ سند v4) اضافه شود.
