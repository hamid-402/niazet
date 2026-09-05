import Link from 'next/link';
import { formatNumber } from '@/lib/format';

const ASSURANCES = [
  {
    title: 'اجرای داخلی و پاسخ‌گو',
    promise: 'سفارش به عضو مشخص تیم اجرایی داخل سامانه سپرده می‌شود.',
    evidence: 'تخصیص، تغییر مسئول و رویدادهای اصلی سفارش در تاریخچه قابل پیگیری ثبت می‌شوند.',
    boundary: 'ترکیب تیم و امکان اجرا پیش از پرداخت، متناسب با نوع درخواست تأیید می‌شود.',
  },
  {
    title: 'پرداخت در حساب امانی سامانه',
    promise: 'مبلغ سفارش هنگام شروع مستقیم به مجری آزاد نمی‌شود.',
    evidence: 'نگه‌داری، آزادسازی، بازپرداخت و اصلاحات مالی در دفتر کل سفارش ثبت می‌شوند.',
    boundary: 'این سازوکار حساب امانی داخل محصول است و شرایط حقوقی آن باید در قرارداد سفارش مطالعه شود.',
  },
  {
    title: 'کنترل کیفیت قابل سنجش',
    promise: 'تحویل با سلیقه مبهم سنجیده نمی‌شود؛ معیار پذیرش مبنای بررسی است.',
    evidence: 'چک‌لیست QC، نتیجه هر معیار و درخواست اصلاح پیش از تأیید نهایی ثبت می‌شوند.',
    boundary: 'معیارها باید پیش از شروع دقیق و قابل اندازه‌گیری باشند؛ موارد خارج از دامنه نیازمند توافق تازه‌اند.',
  },
  {
    title: 'محرمانگی و حداقل دسترسی',
    promise: 'اطلاعات سفارش فقط در اختیار نقش‌هایی قرار می‌گیرد که برای انجام کار به آن نیاز دارند.',
    evidence: 'کنترل دسترسی نقش‌محور، دریافت محافظت‌شده فایل و ثبت رویدادهای حساس در سامانه اعمال می‌شود.',
    boundary: 'هیچ سامانه‌ای بدون ریسک نیست؛ اطلاعات فوق‌حساس را فقط در صورت ضرورت و طبق توافق بارگذاری کنید.',
  },
  {
    title: 'پشتیبانی دارای مسیر پیگیری',
    promise: 'پرسش، اصلاح و اختلاف به گفت‌وگوی پراکنده و بدون سابقه وابسته نیست.',
    evidence: 'تیکت، اولویت، مسئول رسیدگی، زمان هدف پاسخ و رویدادهای پرونده ثبت می‌شوند.',
    boundary: 'زمان پاسخ با توجه به اولویت و ساعت کاری محاسبه می‌شود و با زمان حل کامل یکسان نیست.',
  },
] as const;

export function ServiceAssurance() {
  return (
    <section aria-labelledby="assurance-title" className="border-y border-border bg-surface py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-accent">اعتماد با سازوکار، نه شعار</p>
            <h2 id="assurance-title" className="mt-2 text-xl font-extrabold text-fg">تعهدهای محصول چگونه اجرا می‌شوند؟</h2>
            <p className="mt-2 text-sm leading-7 text-fg-muted">برای هر تعهد، هم نشانه قابل بررسی را می‌گوییم و هم مرز آن را؛ تا پیش از سفارش تصمیم روشن‌تری بگیرید.</p>
          </div>
          <Link href="/status" className="inline-flex min-h-11 items-center justify-center self-start rounded-control border border-border-strong bg-bg px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 md:self-auto">
            مشاهده وضعیت سرویس‌ها
          </Link>
        </div>

        <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ASSURANCES.map((item, index) => (
            <li key={item.title} className="flex min-w-0 flex-col rounded-card border border-border bg-bg p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-fg-on-accent">{formatNumber(index + 1)}</span>
                <h3 className="pt-1 text-sm font-extrabold text-fg">{item.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-fg-muted">{item.promise}</p>
              <dl className="mt-4 flex flex-1 flex-col gap-3 border-t border-border pt-4 text-xs leading-5">
                <div><dt className="font-bold text-success">نشانه قابل بررسی</dt><dd className="mt-1 text-fg-muted">{item.evidence}</dd></div>
                <div className="mt-auto rounded-control bg-warning-subtle p-2.5"><dt className="font-bold text-warning">مرز تعهد</dt><dd className="mt-1 text-fg-muted">{item.boundary}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
