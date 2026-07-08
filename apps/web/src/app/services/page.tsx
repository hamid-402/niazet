'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { Card, EmptyState, ErrorBanner, PageLoading } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatToman } from '@/lib/format';
import type { ServiceLine } from '@/lib/types';

const PRICING_LABEL: Record<string, string> = {
  fixed: 'قیمت ثابت',
  formula: 'قیمت فرمولی',
  manual_quote: 'قیمت‌گذاری پس از بررسی',
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceLine[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ServiceLine[]>('/services', { auth: false })
      .then(setServices)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:px-8">
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900">خدمات</h1>

        {error && <ErrorBanner message={error} />}
        {!services && !error && <PageLoading />}
        {services && services.length === 0 && (
          <EmptyState title="در حال حاضر خدمتی ثبت نشده است." />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services?.map((service) => (
            <Link key={service.id} href={`/services/${service.slug}`}>
              <Card className="h-full transition hover:border-slate-400">
                <p className="mb-1 text-xs font-medium text-slate-400">{service.category}</p>
                <h3 className="mb-2 text-base font-bold text-slate-900">{service.title}</h3>
                <p className="mb-4 line-clamp-2 text-sm text-slate-500">{service.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{PRICING_LABEL[service.pricingModel]}</span>
                  <span>{service.basePrice ? formatToman(service.basePrice) : ''}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
