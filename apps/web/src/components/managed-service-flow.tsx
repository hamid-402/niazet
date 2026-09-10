const FLOW_STEPS = [
  { number: '۱', title: 'ثبت درخواست', detail: 'نیاز و خروجی موردنظر' },
  { number: '۲', title: 'بررسی', detail: 'مسیر اجرا، زمان و هزینه' },
  { number: '۳', title: 'پرداخت امن', detail: 'نگه‌داری در حساب امانی' },
  { number: '۴', title: 'اجرا', detail: 'تیم داخلی و گزارش مرحله‌ای' },
  { number: '۵', title: 'کنترل کیفیت', detail: 'بررسی معیارهای توافق‌شده' },
  { number: '۶', title: 'تحویل', detail: 'دریافت خروجی و امکان اصلاح' },
] as const;

export function ManagedServiceFlow() {
  return (
    <section aria-labelledby="managed-flow-title" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
      <div className="rounded-card border border-border bg-surface p-5 shadow-elevation-1 md:p-7">
        <div className="mb-6 text-center">
          <h2 id="managed-flow-title" className="text-lg font-bold text-fg">مسیر درخواست تا تحویل</h2>
          <p className="mt-2 text-sm text-fg-muted">در هر مرحله می‌دانید چه اتفاقی افتاده و اقدام بعدی چیست.</p>
        </div>
        <div className="relative">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 1000 40" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-[8%] top-5 hidden h-10 w-[84%] text-border-strong md:block">
            <path d="M8 20 H992" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 10" />
          </svg>
          <ol className="relative grid gap-3 sm:grid-cols-2 md:grid-cols-6">
            {FLOW_STEPS.map((step) => (
              <li key={step.number} className="flex min-w-0 items-start gap-3 rounded-control bg-bg-subtle p-3 md:flex-col md:items-center md:bg-transparent md:p-0 md:text-center">
                <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-surface font-extrabold text-accent shadow-elevation-1">{step.number}</span>
                <div className="min-w-0 md:mt-2">
                  <h3 className="text-sm font-bold text-fg">{step.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
