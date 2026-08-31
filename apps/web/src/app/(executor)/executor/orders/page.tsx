'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ResponsiveTable,
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate } from '@/lib/format';

export default function ExecutorOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<OrderSummary[]>('/executor/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle>سفارش‌های ارجاع‌شده</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}
      {orders && orders.length === 0 && (
        <EmptyState title="کاری به شما ارجاع نشده است." />
      )}

      {orders && orders.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <ResponsiveTable className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">عنوان</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
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
                      href={`/executor/orders/${order.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {order.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">{order.code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
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
