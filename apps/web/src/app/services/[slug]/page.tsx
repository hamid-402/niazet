import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicNav } from '@/components/public-nav';
import { ServiceOrderCta } from '@/components/service-order-cta';
import { Card } from '@/components/ui';
import { formatNumber, formatToman } from '@/lib/format';
import { publicApiFetch } from '@/lib/server-api';
import type { ServiceLine } from '@/lib/types';

export const revalidate = 300;

type ServicePageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const service = await publicApiFetch<ServiceLine>(`/services/${encodeURIComponent(slug)}`);
    return {
      title: service.title,
      description: service.description,
      alternates: { canonical: `/services/${service.slug}` },
      openGraph: { title: service.title, description: service.description, type: 'website', url: `/services/${service.slug}` },
    };
  } catch {
    return { title: 'خدمت پیدا نشد', robots: { index: false, follow: false } };
  }
}

export default async function ServiceDetailPage({ params }: ServicePageProps) {
  const { slug } = await params;
  let service: ServiceLine;
  try { service = await publicApiFetch<ServiceLine>(`/services/${encodeURIComponent(slug)}`); } catch { notFound(); }
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 md:px-8">
        <p className="mb-1 text-xs font-medium text-fg-subtle">{service.category}</p>
        <h1 className="mb-3 text-2xl font-extrabold text-fg">{service.title}</h1>
        <p className="mb-6 text-fg-muted">{service.description}</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2">
            {service.packages.length > 0 && <Card>
              <h2 className="mb-3 font-bold text-fg">پکیج‌ها</h2>
              <div className="space-y-3">{service.packages.map((pkg) => <div key={pkg.id} className="rounded-card border border-border bg-bg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-fg">{pkg.name}</span><span className="text-sm font-bold text-fg">{pkg.price != null ? formatToman(pkg.price) : 'قیمت پس از بررسی'}</span></div>
                {pkg.description && <p className="mt-2 text-sm leading-6 text-fg-muted">{pkg.description}</p>}
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-fg-subtle">SLA پکیج</dt><dd className="mt-1 font-bold text-fg">{pkg.slaHours ? `${formatNumber(pkg.slaHours)} ساعت` : 'پس از بررسی'}</dd></div>
                  <div><dt className="text-fg-subtle">خروجی پکیج</dt><dd className="mt-1 font-bold text-fg">{pkg.deliverables ?? service.deliverables ?? 'در پیشنهاد نهایی مشخص می‌شود'}</dd></div>
                </dl>
              </div>)}</div>
            </Card>}
            {(service.acceptanceCriteria?.length ?? 0) > 0 && <Card>
              <h2 className="mb-3 font-bold text-fg">معیار پذیرش</h2>
              <p className="mb-3 text-sm leading-6 text-fg-muted">کنترل کیفیت و تأیید تحویل بر اساس این موارد انجام می‌شود.</p>
              <ul className="space-y-2 text-sm text-fg-muted">{service.acceptanceCriteria?.map((item) => <li key={item.id} className="flex gap-2"><span aria-hidden="true" className="text-success">✓</span><span>{item.description}</span></li>)}</ul>
            </Card>}
            <Card><h2 className="mb-2 font-bold text-fg">خروجی قابل تحویل</h2><p className="text-sm leading-6 text-fg-muted">{service.deliverables ?? 'خروجی دقیق پس از بررسی درخواست، در پیشنهاد نهایی ثبت می‌شود.'}</p></Card>
            <Card>
              <h2 className="mb-3 font-bold text-fg">سوالات این خدمت</h2>
              <div className="space-y-2">
                <details className="rounded-control border border-border bg-bg p-3"><summary className="cursor-pointer font-bold text-fg">زمان تحویل چطور مشخص می‌شود؟</summary><p className="mt-2 text-sm leading-6 text-fg-muted">{service.slaHours ? `زمان هدف پایه ${formatNumber(service.slaHours)} ساعت است؛ SLA پکیج انتخابی در اولویت قرار می‌گیرد.` : 'زمان هدف پس از بررسی دامنه درخواست و پکیج انتخابی، پیش از پرداخت اعلام می‌شود.'}</p></details>
                <details className="rounded-control border border-border bg-bg p-3"><summary className="cursor-pointer font-bold text-fg">چه چیزی تحویل می‌گیرم؟</summary><p className="mt-2 text-sm leading-6 text-fg-muted">{service.deliverables ?? 'فهرست دقیق فایل‌ها و خروجی‌ها در پیشنهاد نهایی سفارش ثبت می‌شود.'}</p></details>
                <details className="rounded-control border border-border bg-bg p-3"><summary className="cursor-pointer font-bold text-fg">تأیید کیفیت بر چه اساسی است؟</summary><p className="mt-2 text-sm leading-6 text-fg-muted">{service.acceptanceCriteria?.length ? `${formatNumber(service.acceptanceCriteria.length)} معیار پذیرش ثبت‌شده مبنای کنترل کیفیت است و پیش از شروع قابل مشاهده است.` : 'معیارهای قابل سنجش هنگام بررسی درخواست با شما نهایی و داخل سفارش ثبت می‌شوند.'}</p></details>
                <details className="rounded-control border border-border bg-bg p-3"><summary className="cursor-pointer font-bold text-fg">امکان درخواست اصلاح وجود دارد؟</summary><p className="mt-2 text-sm leading-6 text-fg-muted">{service.revisionPolicy ?? 'سیاست و محدوده اصلاح در پیشنهاد نهایی مشخص می‌شود و پیش از پرداخت قابل بررسی است.'}</p></details>
              </div>
            </Card>
          </div>
          <div><Card>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">SLA پایه</dt><dd className="text-left font-medium text-fg">{service.slaHours ? `${formatNumber(service.slaHours)} ساعت` : 'پس از بررسی'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">سیاست اصلاح</dt><dd className="text-left font-medium text-fg">{service.revisionPolicy ?? 'در پیشنهاد نهایی'}</dd></div>
            </dl>
            <ServiceOrderCta serviceId={service.id} />
          </Card></div>
        </div>
      </main>
    </div>
  );
}
