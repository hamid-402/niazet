import { OrbitServiceExplorer } from '@/components/orbit-service-explorer';
import { PublicNav } from '@/components/public-nav';
import { OrbitHero } from '@/components/orbit-hero';
import { ManagedServiceFlow } from '@/components/managed-service-flow';
import { ServiceProcessStepper } from '@/components/service-process-stepper';
import { ServiceUseCases } from '@/components/service-use-cases';
import { ServiceOutputSamples } from '@/components/service-output-samples';
import { ServiceAssurance } from '@/components/service-assurance';
import { PublicFaqAndFinalCta } from '@/components/public-faq-cta';
import { GeometricSectionDivider } from '@/components/geometric-section-divider';
import { PublicStructuredData } from '@/components/public-structured-data';
import { BrandMark } from '@/components/brand-mark';

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

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <PublicStructuredData />
      <PublicNav />

      <main id="main-content">
        <OrbitHero>
          <ul aria-label="دلایل اعتماد به نیازت" className="hero-trust mx-auto mt-10 grid max-w-5xl gap-3 text-right md:grid-cols-3">
            {TRUST_SIGNALS.map((signal) => (
              <li key={signal.title} className="rounded-card border border-border bg-surface p-4 shadow-elevation-1">
                <p className="font-bold text-fg"><span aria-hidden="true" className="ml-2 text-success">✓</span>{signal.title}</p>
                <p className="mt-2 text-sm leading-6 text-fg-muted">{signal.description}</p>
              </li>
            ))}
          </ul>
        </OrbitHero>

        <ManagedServiceFlow />

        <GeometricSectionDivider />

        <OrbitServiceExplorer />

        <ServiceUseCases />

        <ServiceOutputSamples />

        <ServiceAssurance />

        <GeometricSectionDivider flip />

        <ServiceProcessStepper />

        <PublicFaqAndFinalCta />
      </main>

      <footer className="border-t border-border bg-surface py-6 text-center text-xs text-fg-subtle">
        <div className="mb-4"><BrandMark language="en" caption={false} /></div>
        © نیازت با ما — سامانه خدمات مدیریت‌شده
      </footer>
    </div>
  );
}
