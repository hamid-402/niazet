import Link from 'next/link';
import { formatNumber } from '@/lib/format';

const USE_CASES = [
  {
    audience: 'کسب‌وکار',
    need: 'یک فروشگاه محلی می‌خواهد کمپین فروش فصلی را سریع و با پیام یکپارچه راه‌اندازی کند.',
    services: ['تحلیل رقبا', 'صفحه فرود', 'متن کمپین'],
    deliverable: 'گزارش کوتاه بازار، صفحه فرود آماده انتشار و بسته محتوای کمپین',
  },
  {
    audience: 'دانشگاه و پژوهش',
    need: 'یک تیم پژوهشی برای مرتب‌سازی داده‌ها و ارائه روشن نتایج به خروجی حرفه‌ای نیاز دارد.',
    services: ['پاک‌سازی داده', 'نمودار و تحلیل', 'صفحه‌آرایی گزارش'],
    deliverable: 'داده ساخت‌یافته، نمودارهای قابل استناد و گزارش نهایی صفحه‌آرایی‌شده',
  },
  {
    audience: 'محتوا',
    need: 'یک برند کوچک می‌خواهد انتشار ماهانه محتوا منظم شود و هر مطلب هدف مشخصی داشته باشد.',
    services: ['تقویم محتوا', 'تحقیق کلیدواژه', 'تولید و ویرایش'],
    deliverable: 'تقویم یک‌ماهه، بریف هر محتوا و فایل‌های نهایی آماده انتشار',
  },
  {
    audience: 'طراحی',
    need: 'یک محصول تازه برای معرفی اولیه به هویت دیداری منسجم و اقلام ضروری عرضه نیاز دارد.',
    services: ['جهت هنری', 'قالب شبکه اجتماعی', 'پرزنت معرفی'],
    deliverable: 'راهنمای بصری کوتاه، قالب‌های قابل ویرایش و فایل ارائه محصول',
  },
  {
    audience: 'امور سفارشی',
    need: 'یک مدیر برای تصمیم خرید، به جمع‌آوری گزینه‌ها و مقایسه مستند تأمین‌کنندگان نیاز دارد.',
    services: ['جمع‌آوری اطلاعات', 'استعلام و پیگیری', 'مقایسه گزینه‌ها'],
    deliverable: 'جدول مقایسه، مستندات استعلام و جمع‌بندی قابل تصمیم‌گیری',
  },
] as const;

export function ServiceUseCases() {
  return (
    <section aria-labelledby="use-cases-title" className="border-y border-border bg-bg-subtle py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold text-accent">از نیاز تا خروجی مشخص</p>
          <h2 id="use-cases-title" className="mt-2 text-xl font-extrabold text-fg">نیازت در عمل چه مسئله‌هایی را حل می‌کند؟</h2>
          <p className="mt-2 text-sm leading-7 text-fg-muted">
            این‌ها سناریوهای کاربردی‌اند، نه نظر یا نتیجه ساختگی مشتری؛ ترکیب نهایی هر سفارش پس از بررسی نیاز مشخص می‌شود.
          </p>
        </div>

        <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {USE_CASES.map((useCase, index) => (
            <li key={useCase.audience} className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-5 shadow-elevation-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-extrabold text-fg">{useCase.audience}</h3>
                <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">
                  {formatNumber(index + 1)}
                </span>
              </div>
              <dl className="mt-4 flex flex-1 flex-col gap-4">
                <div>
                  <dt className="text-xs font-bold text-fg-subtle">نیاز واقعی</dt>
                  <dd className="mt-1 text-sm leading-6 text-fg-muted">{useCase.need}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-fg-subtle">ترکیب خدمت</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {useCase.services.map((service) => (
                      <span key={service} className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-medium text-fg">{service}</span>
                    ))}
                  </dd>
                </div>
                <div className="rounded-control bg-success-soft p-3">
                  <dt className="text-xs font-bold text-success-strong">خروجی قابل تحویل</dt>
                  <dd className="mt-1 text-sm leading-6 text-fg">{useCase.deliverable}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="mt-7 text-center">
          <Link href="/services" className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-fg transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
            پیدا کردن خدمت مناسب برای نیاز من
          </Link>
        </div>
      </div>
    </section>
  );
}
