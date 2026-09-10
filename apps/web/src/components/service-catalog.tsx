'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button, Card, EmptyState, inputClass } from '@/components/ui';
import { formatNumber, formatToman } from '@/lib/format';
import type { ServiceLine } from '@/lib/types';

const PRICING_LABEL: Record<ServiceLine['pricingModel'], string> = {
  fixed: 'قیمت ثابت',
  formula: 'قیمت فرمولی',
  manual_quote: 'قیمت‌گذاری پس از بررسی',
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('fa-IR').replaceAll('ي', 'ی').replaceAll('ك', 'ک');
}

function startingPrice(service: ServiceLine) {
  const prices = [service.basePrice, ...service.packages.map((item) => item.price)]
    .filter((value): value is number => value != null && value >= 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function targetHours(service: ServiceLine) {
  const hours = [service.slaHours, ...service.packages.map((item) => item.slaHours)]
    .filter((value): value is number => value != null && value > 0);
  return hours.length > 0 ? Math.min(...hours) : null;
}

export function ServiceCatalog({ services }: { services: ServiceLine[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [pricingModel, setPricingModel] = useState('all');
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(
    () => [...new Set(services.map((service) => service.category))].sort((a, b) => a.localeCompare(b, 'fa')),
    [services],
  );

  const visibleServices = useMemo(() => {
    const needle = normalizeSearch(deferredQuery);
    return services.filter((service) => {
      const searchable = normalizeSearch([
        service.title,
        service.category,
        service.description,
        service.deliverables ?? '',
        ...service.packages.flatMap((item) => [item.name, item.description ?? '', item.deliverables ?? '']),
      ].join(' '));
      return (!needle || searchable.includes(needle))
        && (category === 'all' || service.category === category)
        && (pricingModel === 'all' || service.pricingModel === pricingModel);
    });
  }, [category, deferredQuery, pricingModel, services]);

  const hasFilters = Boolean(query) || category !== 'all' || pricingModel !== 'all';
  const resetFilters = () => {
    setQuery('');
    setCategory('all');
    setPricingModel('all');
  };

  return (
    <>
      <form role="search" onSubmit={(event) => event.preventDefault()} className="mb-6 rounded-card border border-border bg-surface p-4 shadow-elevation-1">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-bold text-fg">جست‌وجوی خدمات</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام خدمت، خروجی یا پکیج…" className={inputClass} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-bold text-fg">دسته</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
              <option value="all">همه دسته‌ها</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-bold text-fg">روش قیمت‌گذاری</span>
            <select value={pricingModel} onChange={(event) => setPricingModel(event.target.value)} className={inputClass}>
              <option value="all">همه روش‌ها</option>
              {Object.entries(PRICING_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Button type="button" variant="secondary" disabled={!hasFilters} onClick={resetFilters}>پاک‌کردن</Button>
        </div>
        <p role="status" aria-live="polite" className="mt-3 text-xs font-medium text-fg-muted">
          {formatNumber(visibleServices.length)} خدمت از {formatNumber(services.length)} خدمت نمایش داده می‌شود.
        </p>
      </form>

      {visibleServices.length === 0 ? (
        <EmptyState title="خدمتی با این مشخصات پیدا نشد" description="عبارت جست‌وجو یا فیلترها را تغییر دهید." action={<Button type="button" variant="secondary" onClick={resetFilters}>نمایش همه خدمات</Button>} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleServices.map((service) => {
            const price = startingPrice(service);
            const sla = targetHours(service);
            return (
              <li key={service.id} className="min-w-0">
                <Link href={`/services/${service.slug}`} className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
                  <Card className="flex h-full flex-col hover:border-border-strong">
                    <p className="mb-1 text-xs font-bold text-accent">{service.category}</p>
                    <h2 className="mb-2 text-base font-extrabold text-fg">{service.title}</h2>
                    <p className="mb-4 line-clamp-3 text-sm leading-6 text-fg-muted">{service.description}</p>
                    <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-control bg-bg-subtle p-2.5">
                        <dt className="text-fg-subtle">پکیج</dt>
                        <dd className="mt-1 font-bold text-fg">{service.packages.length > 0 ? `${formatNumber(service.packages.length)} انتخاب` : 'سفارشی'}</dd>
                      </div>
                      <div className="rounded-control bg-bg-subtle p-2.5">
                        <dt className="text-fg-subtle">زمان هدف</dt>
                        <dd className="mt-1 font-bold text-fg">{sla ? `${formatNumber(sla)} ساعت` : 'پس از بررسی'}</dd>
                      </div>
                      <div className="rounded-control bg-bg-subtle p-2.5">
                        <dt className="text-fg-subtle">خروجی</dt>
                        <dd className="mt-1 font-bold text-fg">{service.deliverables ? 'مشخص شده' : 'در پیشنهاد نهایی'}</dd>
                      </div>
                      <div className="rounded-control bg-bg-subtle p-2.5">
                        <dt className="text-fg-subtle">معیار پذیرش</dt>
                        <dd className="mt-1 font-bold text-fg">{service.acceptanceCriteria?.length ? `${formatNumber(service.acceptanceCriteria.length)} معیار` : 'هنگام بررسی'}</dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3 text-xs">
                      <span className="text-fg-subtle">{PRICING_LABEL[service.pricingModel]}</span>
                      <span className="font-extrabold text-fg">{price != null ? `از ${formatToman(price)}` : 'نیازمند بررسی'}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
