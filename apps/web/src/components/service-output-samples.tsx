import { formatNumber } from '@/lib/format';

const OUTPUT_SAMPLES = [
  {
    title: 'گزارش تحلیل بازار',
    format: 'PDF و فایل داده',
    preview: ['خلاصه مدیریتی', 'نقشه رقبا', 'منابع و محدودیت‌ها'],
    privacy: 'نام برندها و عددها در پیش‌نمایش جایگزین شده‌اند.',
  },
  {
    title: 'تقویم محتوای ماهانه',
    format: 'Spreadsheet',
    preview: ['موضوع و هدف', 'کانال و زمان انتشار', 'وضعیت تأیید'],
    privacy: 'نام کمپین، حساب‌ها و اطلاعات دسترسی نمایش داده نمی‌شوند.',
  },
  {
    title: 'بسته تحویل صفحه فرود',
    format: 'فایل طراحی و مستند تحویل',
    preview: ['ساختار صفحه', 'حالت‌های واکنش‌گرا', 'چک‌لیست تحویل'],
    privacy: 'نشان تجاری، دامنه و داده‌های تحلیلی حذف شده‌اند.',
  },
  {
    title: 'مقایسه تأمین‌کنندگان',
    format: 'جدول و جمع‌بندی',
    preview: ['معیارهای مقایسه', 'شواهد هر گزینه', 'ریسک‌ها و ابهام‌ها'],
    privacy: 'اطلاعات تماس، قیمت واقعی و هویت طرف‌ها پوشانده شده‌اند.',
  },
] as const;

export function ServiceOutputSamples() {
  return (
    <section aria-labelledby="output-samples-title" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-accent">شکل خروجی را پیش از سفارش ببینید</p>
          <h2 id="output-samples-title" className="mt-2 text-xl font-extrabold text-fg">نمونه ساختار خروجی‌ها</h2>
          <p className="mt-2 text-sm leading-7 text-fg-muted">
            این پیش‌نمایش‌ها قالب و سطح جزئیات را نشان می‌دهند؛ مشتری واقعی، نتیجه واقعی یا ادعای عملکرد نیستند.
          </p>
        </div>
        <p className="rounded-control border border-success-border bg-success-subtle px-3 py-2 text-xs font-bold text-success">
          فقط داده نمایشی و بدون اطلاعات هویتی
        </p>
      </div>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {OUTPUT_SAMPLES.map((sample) => (
          <li key={sample.title} className="overflow-hidden rounded-card border border-border bg-surface shadow-elevation-1">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-subtle px-4 py-3">
              <div className="flex items-center gap-2" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-danger" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
              </div>
              <span className="text-xs font-bold text-fg-subtle">نمونه ساختاری</span>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-extrabold text-fg">{sample.title}</h3>
                <span className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs font-medium text-fg-muted">{sample.format}</span>
              </div>
              <div aria-label={`پیش‌نمایش بخش‌های ${sample.title}`} className="mt-4 rounded-control border border-border bg-bg p-3">
                <div aria-hidden="true" className="mb-3 h-2 w-2/5 rounded-full bg-border-strong" />
                <ol className="space-y-2">
                  {sample.preview.map((item, index) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-fg-muted">
                      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-accent-soft text-xs font-bold text-accent">{formatNumber(index + 1)}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
                <div aria-hidden="true" className="mt-4 grid grid-cols-4 gap-2">
                  <span className="h-10 rounded-control bg-surface-sunken" />
                  <span className="h-16 rounded-control bg-surface-sunken" />
                  <span className="h-12 rounded-control bg-surface-sunken" />
                  <span className="h-20 rounded-control bg-accent-soft" />
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-fg-muted">
                <span aria-hidden="true" className="font-bold text-success">✓</span>
                <span><strong className="text-fg">حریم خصوصی:</strong> {sample.privacy}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
