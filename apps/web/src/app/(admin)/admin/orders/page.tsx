'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ResponsiveTable,
  Card,
  EmptyState,
  ErrorBanner,
  inputClass,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate, formatToman } from '@/lib/format';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    apiFetch<OrderSummary[]>(`/admin/orders${query}`)
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, [search]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionTitle>مدیریت سفارش‌ها</SectionTitle>
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="جستجو با کد یا عنوان..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}
      {orders && orders.length === 0 && <EmptyState title="سفارشی یافت نشد." />}

      {orders && orders.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <ResponsiveTable className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">کد و عنوان</th>
                <th className="px-4 py-3 font-medium">مشتری</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0 hover:bg-bg-subtle"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {order.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">{order.code}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {(order as unknown as { customer?: { fullName: string } })
                      .customer?.fullName ?? '—'}
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
        </Card>
      )}
    </div>
  );
}
