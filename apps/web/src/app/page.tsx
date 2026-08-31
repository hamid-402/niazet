import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { LinkButton } from '@/components/ui';
import { ManagedServiceFlow } from '@/components/managed-service-flow';
import { ServiceProcessStepper } from '@/components/service-process-stepper';

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

const TRUST_SIGNALS = [
  {
    title: 'اجرای داخلی و احراز‌شده',
    description: 'درخواست شما به تیم مشخص شرکت سپرده می‌شود؛ نه مجری ناشناس.',
  },
  {
    title: 'پرداخت در حساب امانی',
    description: 'مبلغ تا رسیدن سفارش به مرحله تحویل، مستقیم آزاد نمی‌شود.',
  },
  {
    title: 'کنترل کیفیت پیش از تحویل',
    description: 'خروجی پیش از ارائه به شما با معیارهای توافق‌شده بررسی می‌شود.',
  },
] as const;

const FAQS = [
  {
    q: 'چه کسی کار من را انجام می‌دهد؟',
    a: 'در فاز فعلی، تمام کارها توسط تیم اجرای داخلی شرکت انجام می‌شود؛ نه فریلنسرهای آزاد و بدون احراز.',
  },
  {
    q: 'پول من چطور محافظت می‌شود؟',
    a: 'مبلغ سفارش تا تأیید تحویل شما در حساب امانی نگه‌داری می‌شود و مستقیم به کسی پرداخت نمی‌شود.',
  },
  {
    q: 'اگر از خروجی راضی نبودم چه؟',
    a: 'می‌توانید درخواست اصلاح یا بررسی اختلاف ثبت کنید تا تیم پشتیبانی موضوع را پیگیری کند.',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />

      <main id="main-content">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center md:px-8">
          <p className="mb-3 text-sm font-bold text-accent">سامانه خدمات مدیریت‌شده</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg md:text-4xl">
            خدمات تخصصی، با اجرای مدیریت‌شده و پرداخت امن
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-fg-muted">
            درخواستتان را ثبت کنید؛ تیم داخلی نیازت مسیر اجرا، زمان و هزینه را شفاف
            می‌کند و تا کنترل کیفیت و تحویل نهایی کنار شما می‌ماند.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/services">شروع ثبت درخواست</LinkButton>
            <LinkButton href="/services" variant="secondary">
              مشاهده خدمات و قیمت‌گذاری
            </LinkButton>
          </div>
          <ul aria-label="دلایل اعتماد به نیازت" className="mx-auto mt-10 grid max-w-5xl gap-3 text-right md:grid-cols-3">
            {TRUST_SIGNALS.map((signal) => (
              <li key={signal.title} className="rounded-card border border-border bg-surface p-4 shadow-elevation-1">
                <p className="font-bold text-fg"><span aria-hidden="true" className="ml-2 text-success">✓</span>{signal.title}</p>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{signal.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <ManagedServiceFlow />

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <h2 className="mb-4 text-center text-lg font-bold text-fg">
          دسته‌های خدمات
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href="/services"
              className="rounded-card border border-border bg-surface p-4 text-center text-sm font-medium text-fg shadow-elevation-1 transition-colors hover:border-border-strong hover:bg-bg-subtle"
            >
              {cat}
            </Link>
          ))}
        </div>
        </section>

        <ServiceProcessStepper />

        <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-16 md:px-8">
        <h2 className="mb-6 text-center text-lg font-bold text-fg">
          سوالات پرتکرار
        </h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="rounded-card border border-border bg-surface p-4"
            >
              <summary className="cursor-pointer font-medium text-fg">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-6 text-center text-xs text-fg-subtle">
        © نیازت با ما — سامانه خدمات مدیریت‌شده
      </footer>
    </div>
  );
}
