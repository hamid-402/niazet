'use client';

import { type KeyboardEvent, useRef, useState } from 'react';

const PROCESS_STEPS = [
  {
    number: '۱',
    title: 'انتخاب خدمت',
    summary: 'خدمت یا بسته مناسب را با خروجی، زمان و محدوده روشن انتخاب می‌کنید.',
    customerAction: 'انتخاب خدمت و پاسخ به چند سؤال کوتاه',
    systemAction: 'نمایش دامنه کار، خروجی و برآورد اولیه',
    outcome: 'درخواست اولیه شفاف',
  },
  {
    number: '۲',
    title: 'بررسی درخواست',
    summary: 'کارشناس نیازت جزئیات را بررسی می‌کند و ابهام‌ها پیش از شروع برطرف می‌شوند.',
    customerAction: 'تکمیل اطلاعات یا فایل‌های لازم',
    systemAction: 'تأیید امکان اجرا، زمان، هزینه و معیار پذیرش',
    outcome: 'پیشنهاد نهایی قابل تأیید',
  },
  {
    number: '۳',
    title: 'پرداخت امن',
    summary: 'پس از تأیید پیشنهاد، مبلغ سفارش تا زمان تحویل در حساب امانی می‌ماند.',
    customerAction: 'تأیید پیشنهاد و پرداخت',
    systemAction: 'ثبت تراکنش و قفل‌کردن مبلغ سفارش',
    outcome: 'مجوز امن شروع کار',
  },
  {
    number: '۴',
    title: 'اجرای مدیریت‌شده',
    summary: 'تیم داخلی طبق محدوده توافق‌شده کار می‌کند و وضعیت سفارش قابل پیگیری است.',
    customerAction: 'پاسخ به پرسش‌های ضروری در صورت نیاز',
    systemAction: 'اجرای مرحله‌ای و ثبت گزارش پیشرفت',
    outcome: 'نسخه آماده کنترل کیفیت',
  },
  {
    number: '۵',
    title: 'کنترل کیفیت',
    summary: 'خروجی با معیارهای پذیرش سفارش بررسی می‌شود و نقص‌ها پیش از تحویل رفع می‌شوند.',
    customerAction: 'بدون اقدام؛ نتیجه بررسی قابل مشاهده است',
    systemAction: 'بازبینی، ثبت شواهد و اصلاح داخلی',
    outcome: 'خروجی تأییدشده',
  },
  {
    number: '۶',
    title: 'تحویل و اصلاح',
    summary: 'خروجی نهایی تحویل می‌شود و در محدوده توافق، امکان درخواست اصلاح وجود دارد.',
    customerAction: 'بررسی تحویل و تأیید یا ثبت اصلاح',
    systemAction: 'ثبت تحویل، مهلت پاسخ و آزادسازی امن مبلغ',
    outcome: 'سفارش کامل و قابل پیگیری',
  },
] as const;

export function ServiceProcessStepper() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeStep = PROCESS_STEPS[activeIndex];

  const selectAndFocus = (index: number) => {
    const safeIndex = (index + PROCESS_STEPS.length) % PROCESS_STEPS.length;
    setActiveIndex(safeIndex);
    stepButtons.current[safeIndex]?.focus();
  };

  const handleStepKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextIndex = index + 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextIndex = index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = PROCESS_STEPS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectAndFocus(nextIndex);
  };

  return (
    <section id="how-it-works" aria-labelledby="process-stepper-title" className="bg-surface py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold text-accent">روند شفاف سفارش</p>
          <h2 id="process-stepper-title" className="mt-2 text-xl font-extrabold text-fg">
            در هر مرحله چه اتفاقی می‌افتد؟
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-muted">
            یک مرحله را انتخاب کنید؛ با کلیدهای جهت‌دار، Home و End هم می‌توانید بین مراحل جابه‌جا شوید.
          </p>
        </div>

        <ol aria-label="مراحل سفارش خدمت" className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {PROCESS_STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={step.title}>
                <button
                  ref={(element) => { stepButtons.current[index] = element; }}
                  type="button"
                  aria-current={isActive ? 'step' : undefined}
                  aria-controls="service-process-detail"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleStepKeyDown(event, index)}
                  className={`flex h-full w-full items-center gap-3 rounded-control border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:flex-col lg:text-center ${isActive ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg text-fg hover:border-border-strong hover:bg-bg-subtle'}`}
                >
                  <span aria-hidden="true" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${isActive ? 'bg-accent text-fg-on-accent' : 'bg-bg-subtle text-fg-muted'}`}>
                    {step.number}
                  </span>
                  <span className="text-sm font-bold">{step.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div id="service-process-detail" aria-live="polite" aria-atomic="true" className="mt-4 rounded-card border border-border bg-bg p-5 shadow-elevation-1 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-accent">مرحله {activeStep.number} از ۶</p>
              <h3 className="mt-1 text-lg font-extrabold text-fg">{activeStep.title}</h3>
            </div>
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-fg-muted">
              خروجی: {activeStep.outcome}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-muted">{activeStep.summary}</p>
          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-control bg-surface p-4">
              <dt className="text-xs font-bold text-fg-subtle">اقدام شما</dt>
              <dd className="mt-1 text-sm font-medium text-fg">{activeStep.customerAction}</dd>
            </div>
            <div className="rounded-control bg-surface p-4">
              <dt className="text-xs font-bold text-fg-subtle">اقدام نیازت</dt>
              <dd className="mt-1 text-sm font-medium text-fg">{activeStep.systemAction}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((current) => current - 1)} className="rounded-control border border-border bg-surface px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50">
              مرحله قبل
            </button>
            <button type="button" disabled={activeIndex === PROCESS_STEPS.length - 1} onClick={() => setActiveIndex((current) => current + 1)} className="rounded-control bg-accent px-4 py-2 text-sm font-bold text-fg-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
              مرحله بعد
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
