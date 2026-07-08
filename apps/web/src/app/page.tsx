import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { LinkButton } from '@/components/ui';

const CATEGORIES = [
  'طراحی و توسعه سایت',
  'محتوا و سئو',
  'تحقیق و تحلیل بازار',
  'گزارش مدیریتی',
  'طراحی گرافیک',
  'امور اداری و پیگیری',
  'دستیار کسب‌وکار',
  'خدمات سفارشی',
];

const STEPS = [
  { title: 'انتخاب خدمت', desc: 'خدمت موردنیازتان را از فهرست خدمات انتخاب کنید.' },
  { title: 'ثبت درخواست', desc: 'فرم کوتاه را تکمیل و نیاز خود را شرح دهید.' },
  { title: 'بررسی و قیمت‌گذاری', desc: 'کارشناسان ما درخواست را بررسی و قیمت نهایی را اعلام می‌کنند.' },
  { title: 'پرداخت امن', desc: 'مبلغ در امانت (escrow) نگه‌داری می‌شود تا تحویل کامل شود.' },
  { title: 'اجرای مدیریت‌شده', desc: 'تیم اجرا با گزارش مرحله‌ای کار را پیش می‌برد.' },
  { title: 'کنترل کیفیت و تحویل', desc: 'پیش از تحویل به شما، خروجی از کنترل کیفیت عبور می‌کند.' },
];

const FAQS = [
  {
    q: 'چه کسی کار من را انجام می‌دهد؟',
    a: 'در فاز فعلی، تمام کارها توسط تیم اجرای داخلی شرکت انجام می‌شود؛ نه فریلنسرهای آزاد و بدون احراز.',
  },
  {
    q: 'پول من چطور محافظت می‌شود؟',
    a: 'مبلغ سفارش تا تایید تحویل شما در امانت (escrow) نگه‌داری می‌شود و مستقیم به کسی پرداخت نمی‌شود.',
  },
  {
    q: 'اگر از خروجی راضی نبودم چه؟',
    a: 'می‌توانید درخواست اصلاح ثبت کنید یا در صورت لزوم dispute باز کنید تا تیم پشتیبانی بررسی کند.',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />

      <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center md:px-8">
        <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">
          خدمات تخصصی، با اجرای مدیریت‌شده و پرداخت امن
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
          «نیازت با ما» سامانه‌ای است که در آن کار شما توسط تیم اجرای داخلی شرکت، با کنترل کیفیت و
          گزارش مرحله‌ای، انجام می‌شود.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <LinkButton href="/services">شروع ثبت درخواست</LinkButton>
          <LinkButton href="/services" variant="secondary">
            مشاهده خدمات
          </LinkButton>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <h2 className="mb-4 text-center text-lg font-bold text-slate-800">دسته‌های خدمات</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href="/services"
              className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400"
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="mb-8 text-center text-lg font-bold text-slate-800">روند کار</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-slate-200 p-5">
                <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-2 font-bold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-16 md:px-8">
        <h2 className="mb-6 text-center text-lg font-bold text-slate-800">سوالات پرتکرار</h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((item) => (
            <details key={item.q} className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-medium text-slate-800">{item.q}</summary>
              <p className="mt-2 text-sm text-slate-500">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        © نیازت با ما — سامانه خدمات مدیریت‌شده
      </footer>
    </div>
  );
}
