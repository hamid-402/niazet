'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Briefcase,
  ClipboardList,
  Code2,
  FileEdit,
  Lock,
  Palette,
  PenLine,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import { PublicNav } from '@/components/public-nav';
import { LinkButton } from '@/components/ui';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

const CATEGORIES = [
  { title: 'طراحی و توسعه سایت', icon: Code2 },
  { title: 'محتوا و سئو', icon: PenLine },
  { title: 'تحقیق و تحلیل بازار', icon: SearchCheck },
  { title: 'گزارش مدیریتی', icon: ClipboardList },
  { title: 'طراحی گرافیک', icon: Palette },
  { title: 'امور اداری و پیگیری', icon: Briefcase },
  { title: 'دستیار کسب‌وکار', icon: Users },
  { title: 'خدمات سفارشی', icon: Sparkles },
];

const STEPS = [
  { title: 'انتخاب خدمت', desc: 'خدمت موردنیازتان را از فهرست خدمات انتخاب کنید.', icon: ClipboardList },
  { title: 'ثبت درخواست', desc: 'فرم کوتاه را تکمیل و نیاز خود را شرح دهید.', icon: FileEdit },
  { title: 'بررسی و قیمت‌گذاری', desc: 'کارشناسان ما درخواست را بررسی و قیمت نهایی را اعلام می‌کنند.', icon: SearchCheck },
  { title: 'پرداخت امن', desc: 'مبلغ در امانت (escrow) نگه‌داری می‌شود تا تحویل کامل شود.', icon: ShieldCheck },
  { title: 'اجرای مدیریت‌شده', desc: 'تیم اجرا با گزارش مرحله‌ای کار را پیش می‌برد.', icon: Workflow },
  { title: 'کنترل کیفیت و تحویل', desc: 'پیش از تحویل به شما، خروجی از کنترل کیفیت عبور می‌کند.', icon: BadgeCheck },
];

const FEATURES = [
  { title: 'پرداخت امن با Escrow', desc: 'مبلغ سفارش تا تایید تحویل شما نزد پلتفرم امانت می‌ماند.', icon: Lock },
  { title: 'کنترل کیفیت مستقل', desc: 'هر خروجی پیش از تحویل، از یک بررسی کیفی مستقل عبور می‌کند.', icon: BadgeCheck },
  { title: 'تیم اجرای داخلی', desc: 'کار شما توسط تیم متخصص و احرازشده شرکت انجام می‌شود.', icon: Users },
  { title: 'شفافیت کامل', desc: 'در هر مرحله، گزارش پیشرفت و مسئول پیگیری مشخص را می‌بینید.', icon: ShieldCheck },
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
    <div className="flex flex-1 flex-col overflow-x-hidden">
      <PublicNav />

      {/* Hero */}
      <section className="relative border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-geo-pattern text-brand/[0.035] dark:text-accent/[0.05]" />
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ duration: 0.6 }}>
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
              <Sparkles size={13} /> اجرای مدیریت‌شده، نه مارکت‌پلیس آزاد
            </span>
            <h1 className="text-3xl font-extrabold leading-tight text-foreground md:text-4xl">
              خدمات تخصصی، با اجرای مدیریت‌شده و پرداخت امن
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-muted">
              «نیازت با ما» سامانه‌ای است که در آن کار شما توسط تیم اجرای داخلی شرکت، با کنترل
              کیفیت و گزارش مرحله‌ای، انجام می‌شود.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/services" variant="accent">
                شروع ثبت درخواست
              </LinkButton>
              <LinkButton href="/services" variant="secondary">
                مشاهده خدمات
              </LinkButton>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} className="text-accent" /> پرداخت امن
              </span>
              <span className="inline-flex items-center gap-2">
                <BadgeCheck size={16} className="text-accent" /> کنترل کیفیت
              </span>
              <span className="inline-flex items-center gap-2">
                <Users size={16} className="text-accent" /> تیم اجرای داخلی
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-3xl border border-border shadow-xl">
              <Image
                src="/images/hero-illustration.png"
                alt="نمای مفهومی از اجرای مدیریت‌شده، کنترل کیفیت و پرداخت امن"
                width={1024}
                height={768}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8">
        <motion.h2
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="mb-8 text-center text-lg font-bold text-foreground"
        >
          دسته‌های خدمات
        </motion.h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link
                href="/services"
                className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center shadow-sm transition hover:-translate-y-1 hover:border-accent/50 hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-accent-soft group-hover:text-accent">
                  <cat.icon size={20} strokeWidth={1.8} />
                </span>
                <span className="text-sm font-medium text-foreground">{cat.title}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Process timeline */}
      <section id="how-it-works" className="border-y border-border bg-muted-soft/50 py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <motion.h2
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="mb-10 text-center text-lg font-bold text-foreground"
          >
            روند کار
          </motion.h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-60px' }}
                variants={fadeUp}
                transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
                className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground">
                  {i + 1}
                </span>
                <step.icon size={20} className="mb-3 text-accent" strokeWidth={1.8} />
                <h3 className="font-bold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-muted">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8">
        <motion.h2
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="mb-10 text-center text-lg font-bold text-foreground"
        >
          چرا نیازت با ما؟
        </motion.h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={fadeUp}
              transition={{ duration: 0.45, delay: i * 0.07 }}
              className="rounded-2xl border border-border p-5"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <f.icon size={18} strokeWidth={1.8} />
              </span>
              <h3 className="font-bold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-7 text-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="relative overflow-hidden rounded-3xl bg-brand px-6 py-12 text-center"
        >
          <div className="pointer-events-none absolute inset-0 bg-geo-pattern text-accent/10" />
          <h2 className="relative text-2xl font-extrabold text-brand-foreground">
            آماده‌اید نیازتان را با ما در میان بگذارید؟
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-brand-foreground/80">
            همین حالا درخواستتان را ثبت کنید تا کارشناسان ما در سریع‌ترین زمان بررسی کنند.
          </p>
          <div className="relative mt-6">
            <LinkButton href="/services" variant="accent">
              شروع ثبت درخواست
            </LinkButton>
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-4 pb-20 md:px-8">
        <motion.h2
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="mb-6 text-center text-lg font-bold text-foreground"
        >
          سوالات پرتکرار
        </motion.h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => (
            <motion.details
              key={item.q}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="group rounded-xl border border-border bg-card p-4 open:border-accent/40"
            >
              <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground marker:content-none">
                {item.q}
                <span className="text-accent transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-7 text-muted">{item.a}</p>
            </motion.details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted-soft/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4 md:px-8">
          <div className="col-span-2 md:col-span-1">
            <span className="flex items-center gap-2 text-base font-extrabold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-accent">
                <Sparkles size={14} />
              </span>
              نیازت با ما
            </span>
            <p className="mt-3 text-sm leading-7 text-muted">
              سامانه خدمات مدیریت‌شده؛ اجرا با تیم داخلی، پرداخت امن، کنترل کیفیت مستقل.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">دسترسی سریع</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link href="/services" className="hover:text-accent">خدمات</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-accent">روند کار</Link></li>
              <li><Link href="/#faq" className="hover:text-accent">سوالات پرتکرار</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">حساب کاربری</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link href="/login" className="hover:text-accent">ورود</Link></li>
              <li><Link href="/register" className="hover:text-accent">ثبت‌نام</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-bold text-foreground">اعتماد شما</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li className="inline-flex items-center gap-2"><Lock size={14} className="text-accent" /> پرداخت امن escrow</li>
              <li className="inline-flex items-center gap-2"><BadgeCheck size={14} className="text-accent" /> کنترل کیفیت مستقل</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-5 text-center text-xs text-muted">
          © نیازت با ما — سامانه خدمات مدیریت‌شده
        </div>
      </footer>
    </div>
  );
}
