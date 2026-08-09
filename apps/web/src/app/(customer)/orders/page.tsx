'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate, formatToman } from '@/lib/format';

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<OrderSummary[]>('/customer/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle>سفارش‌های من</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}

      {orders && orders.length === 0 && (
        <EmptyState
          title="سفارشی ثبت نکرده‌اید"
          action={<LinkButton href="/orders/new">ثبت درخواست جدید</LinkButton>}
        />
      )}

      {orders && orders.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
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
              {orders.map((order) => (
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
          </table>
        </Card>
      )}
    </div>
  );
}
