import { notFound } from 'next/navigation';
import { PublicNav } from '@/components/public-nav';
import { ServiceOrderCta } from '@/components/service-order-cta';
import { Card } from '@/components/ui';
import { formatToman } from '@/lib/format';
import { publicApiFetch } from '@/lib/server-api';
import type { ServiceLine } from '@/lib/types';

export const revalidate = 300;

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let service: ServiceLine;
  try { service = await publicApiFetch<ServiceLine>(`/services/${encodeURIComponent(slug)}`); } catch { notFound(); }
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 md:px-8">
        <p className="mb-1 text-xs font-medium text-fg-subtle">{service.category}</p>
        <h1 className="mb-3 text-2xl font-extrabold text-fg">{service.title}</h1>
        <p className="mb-6 text-fg-muted">{service.description}</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2">
            {service.packages.length > 0 && <Card>
              <h2 className="mb-3 font-bold text-fg">پکیج‌ها</h2>
              <div className="space-y-3">{service.packages.map((pkg) => <div key={pkg.id} className="rounded-card border border-border p-3">
                <div className="flex items-center justify-between"><span className="font-medium text-fg">{pkg.name}</span><span className="text-sm text-fg-muted">{formatToman(pkg.price)}</span></div>
                {pkg.description && <p className="mt-1 text-sm text-fg-muted">{pkg.description}</p>}
              </div>)}</div>
            </Card>}
            {(service.acceptanceCriteria?.length ?? 0) > 0 && <Card>
              <h2 className="mb-3 font-bold text-fg">معیار پذیرش</h2>
              <ul className="list-inside list-disc space-y-1 text-sm text-fg-muted">{service.acceptanceCriteria?.map((item) => <li key={item.id}>{item.description}</li>)}</ul>
            </Card>}
            {service.deliverables && <Card><h2 className="mb-2 font-bold text-fg">خروجی قابل تحویل</h2><p className="text-sm text-fg-muted">{service.deliverables}</p></Card>}
          </div>
          <div><Card>
            <dl className="space-y-2 text-sm">
              {service.slaHours && <div className="flex justify-between"><dt className="text-fg-muted">زمان تقریبی</dt><dd className="font-medium text-fg">{service.slaHours} ساعت</dd></div>}
              {service.revisionPolicy && <div className="flex justify-between"><dt className="text-fg-muted">سیاست اصلاح</dt><dd className="font-medium text-fg">{service.revisionPolicy}</dd></div>}
            </dl>
            <ServiceOrderCta serviceId={service.id} />
          </Card></div>
        </div>
      </main>
    </div>
  );
}
