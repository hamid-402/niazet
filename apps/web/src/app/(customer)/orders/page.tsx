'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ResponsiveTable,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  PageLoading,
  SectionTitle,
  inputClass,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate, formatNumber, formatToman } from '@/lib/format';
import { OrbitCustomerSurface } from '@/components/orbit-customer-surface';
import styles from '@/components/orbit-customer-surface.module.css';
import { isCustomerOrderActionable, isCustomerOrderOpen } from '@/lib/customer-order-view';

type OrderView = 'all' | 'actionable' | 'open' | 'closed';

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('fa-IR').replaceAll('ي', 'ی').replaceAll('ك', 'ک');
}

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<OrderView>('all');

  useEffect(() => {
    apiFetch<OrderSummary[]>('/customer/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);

  const visibleOrders = useMemo(() => {
    if (!orders) return [];
    const search = normalizeSearch(query);
    return orders.filter((order) => {
      if (view === 'actionable' && !isCustomerOrderActionable(order.status)) return false;
      if (view === 'open' && !isCustomerOrderOpen(order.status)) return false;
      if (view === 'closed' && isCustomerOrderOpen(order.status)) return false;
      return !search || normalizeSearch(`${order.code} ${order.title} ${order.serviceLine?.title ?? ''}`).includes(search);
    });
  }, [orders, query, view]);

  return (
    <OrbitCustomerSurface>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>پیگیری شفاف</p>
          <SectionTitle subtitle="وضعیت، خدمت و مبلغ هر سفارش را در یک نگاه ببین.">سفارش‌های من</SectionTitle>
        </div>
        <LinkButton href="/orders/new" className={styles.headingAction}>ثبت درخواست جدید</LinkButton>
      </div>
      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}

      {orders && orders.length === 0 && (
        <EmptyState
          title="سفارشی ثبت نکرده‌اید"
          action={<LinkButton href="/orders/new">ثبت درخواست جدید</LinkButton>}
        />
      )}

      {orders && orders.length > 0 && <>
        <Card className={styles.filters}>
          <label className={styles.filterField}>
            <span>جست‌وجو در سفارش‌ها</span>
            <input type="search" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="عنوان، کد یا خدمت" />
          </label>
          <label className={styles.filterField}>
            <span>نمایش سفارش‌ها</span>
            <select className={inputClass} value={view} onChange={(event) => setView(event.target.value as OrderView)}>
              <option value="all">همهٔ وضعیت‌ها</option>
              <option value="actionable">نیازمند اقدام</option>
              <option value="open">در جریان</option>
              <option value="closed">بسته‌شده یا لغوشده</option>
            </select>
          </label>
        </Card>
        <p role="status" className={styles.resultCount}>{formatNumber(visibleOrders.length)} سفارش از {formatNumber(orders.length)} سفارش نمایش داده می‌شود.</p>
        {visibleOrders.length === 0 ? <EmptyState title="سفارشی با این معیارها پیدا نشد" description="جست‌وجو یا فیلتر را تغییر بده تا همهٔ سفارش‌ها دوباره دیده شوند." action={<Button variant="secondary" onClick={() => { setQuery(''); setView('all'); }}>نمایش همهٔ سفارش‌ها</Button>} /> : <Card className={`${styles.ordersTable} overflow-x-auto p-0`}>
          <ResponsiveTable className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">کد و عنوان</th>
                <th className="px-4 py-3 font-medium">خدمت</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-bg-subtle"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {order.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">{order.code}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {order.serviceLine?.title ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatToman(order.finalPrice)}
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {formatDate(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>}
      </>}
    </OrbitCustomerSurface>
  );
}
