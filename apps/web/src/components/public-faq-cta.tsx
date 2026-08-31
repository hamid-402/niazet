'use client';

import { useAuth } from '@/lib/auth-context';
import { roleHomePath } from '@/lib/role-paths';
import { LinkButton } from '@/components/ui';

const FAQS = [
  {
    question: 'چه کسی سفارش من را انجام می‌دهد؟',
    answer: 'در فاز فعلی، سفارش‌ها به اعضای مشخص تیم اجرای داخلی ارجاع می‌شوند و تغییر مسئول در تاریخچه سفارش ثبت می‌شود.',
  },
  {
    question: 'پیش از پرداخت چه اطلاعاتی می‌بینم؟',
    answer: 'دامنه کار، خروجی، زمان هدف، قیمت، معیار پذیرش و سیاست اصلاح در پیشنهاد نهایی مشخص می‌شوند.',
  },
  {
    question: 'مبلغ سفارش چه زمانی آزاد می‌شود؟',
    answer: 'مبلغ ابتدا در حساب امانی داخل سامانه ثبت می‌شود و آزادسازی یا بازپرداخت آن مطابق وضعیت سفارش و شرایط توافق انجام می‌شود.',
  },
  {
    question: 'اگر خروجی نیاز به اصلاح داشته باشد چه می‌شود؟',
    answer: 'می‌توانید در مهلت و محدوده ثبت‌شده برای سفارش، اصلاح بخواهید؛ درخواست و پاسخ تیم اجرا در همان پرونده قابل پیگیری است.',
  },
  {
    question: 'فایل‌ها و اطلاعات سفارش را چه کسانی می‌بینند؟',
    answer: 'دسترسی بر اساس نقش و نیاز کاری محدود می‌شود. برای اطلاعات فوق‌حساس، پیش از بارگذاری درباره ضرورت و شیوه تبادل با پشتیبانی هماهنگ کنید.',
  },
  {
    question: 'اگر درباره تحویل یا پرداخت اختلافی پیش بیاید چه کنم؟',
    answer: 'از داخل سفارش تیکت یا درخواست بررسی ثبت کنید تا سوابق تحویل، معیارها و رویدادهای مالی در یک مسیر مستند بررسی شوند.',
  },
] as const;

export function PublicFaqAndFinalCta() {
  const { user, loading } = useAuth();
  const canOrder = user?.role === 'customer' || user?.capabilities.includes('customer');

  return (
    <>
      <section id="faq" aria-labelledby="public-faq-title" className="mx-auto w-full max-w-3xl px-4 py-16 md:px-8">
        <div className="text-center">
          <p className="text-sm font-bold text-accent">پاسخ روشن پیش از شروع</p>
          <h2 id="public-faq-title" className="mt-2 text-xl font-extrabold text-fg">سوالات پرتکرار</h2>
        </div>
        <div className="mt-7 flex flex-col gap-3">
          {FAQS.map((item) => (
            <details key={item.question} className="group rounded-card border border-border bg-surface p-4 shadow-elevation-1 open:border-border-strong">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-control font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span aria-hidden="true" className="text-xl leading-none text-accent transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 border-t border-border pt-3 text-sm leading-7 text-fg-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="final-cta-title" className="border-t border-border bg-accent-soft py-14">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
          <h2 id="final-cta-title" className="text-2xl font-extrabold text-fg">آماده‌اید نیازتان را به یک سفارش شفاف تبدیل کنید؟</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
            ابتدا خدمات و خروجی‌ها را مقایسه کنید؛ تا پیش از تأیید پیشنهاد و پرداخت، اجرای سفارش شروع نمی‌شود.
          </p>
          {loading ? (
            <div role="status" aria-live="polite" aria-busy="true" className="mt-6 flex min-h-11 items-center justify-center">
              <span className="rounded-control border border-border bg-surface px-5 py-2 text-sm font-bold text-fg-muted">در حال تشخیص وضعیت ورود…</span>
            </div>
          ) : user ? (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {canOrder ? <LinkButton href="/orders/new">ثبت درخواست جدید</LinkButton> : <LinkButton href={roleHomePath(user)}>رفتن به میز کار</LinkButton>}
              <LinkButton href={canOrder ? roleHomePath(user) : '/services'} variant="secondary">{canOrder ? 'پیگیری سفارش‌ها' : 'مشاهده خدمات'}</LinkButton>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <LinkButton href="/register">ساخت حساب و شروع</LinkButton>
              <LinkButton href="/login" variant="secondary">قبلاً حساب دارم</LinkButton>
              <LinkButton href="/services" variant="secondary">فعلاً مشاهده خدمات</LinkButton>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
