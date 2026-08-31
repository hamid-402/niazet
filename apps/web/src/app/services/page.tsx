import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { Card, EmptyState, ErrorBanner } from '@/components/ui';
import { formatToman } from '@/lib/format';
import { publicApiFetch } from '@/lib/server-api';
import type { ServiceLine } from '@/lib/types';

export const revalidate = 300;

const PRICING_LABEL: Record<string, string> = {
  fixed: 'قیمت ثابت',
  formula: 'قیمت فرمولی',
  manual_quote: 'قیمت‌گذاری پس از بررسی',
};

export default async function ServicesPage() {
  let services: ServiceLine[] = [];
  let error = false;
  try { services = await publicApiFetch<ServiceLine[]>('/services'); } catch { error = true; }
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:px-8">
        <h1 className="mb-6 text-2xl font-extrabold text-fg">خدمات</h1>
        {error && <ErrorBanner message="دریافت خدمات ممکن نشد؛ کمی بعد دوباره تلاش کنید." />}
        {!error && services.length === 0 && <EmptyState title="در حال حاضر خدمتی ثبت نشده است." />}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Link key={service.id} href={`/services/${service.slug}`}>
              <Card className="h-full transition hover:border-border-strong">
                <p className="mb-1 text-xs font-medium text-fg-subtle">{service.category}</p>
                <h2 className="mb-2 text-base font-bold text-fg">{service.title}</h2>
                <p className="mb-4 line-clamp-2 text-sm text-fg-muted">{service.description}</p>
                <div className="flex items-center justify-between text-xs text-fg-subtle">
                  <span>{PRICING_LABEL[service.pricingModel]}</span>
                  <span>{service.basePrice ? formatToman(service.basePrice) : ''}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
