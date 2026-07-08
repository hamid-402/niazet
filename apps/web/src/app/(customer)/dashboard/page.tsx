'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, ErrorBanner, LinkButton, PageLoading, SectionTitle } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { OrderSummary } from '@/lib/types';
import { formatDate } from '@/lib/format';

const ACTIONABLE_STATUSES = new Set([
  'quoted',
  'pending_payment',
  'delivered',
  'revision_requested',
  'qc_rejected',
]);

export default function CustomerDashboardPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<OrderSummary[]>('/customer/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);

  const actionable = orders?.filter((o) => ACTIONABLE_STATUSES.has(o.status)) ?? [];
  const active = orders?.filter((o) => !['closed', 'cancelled'].includes(o.status)) ?? [];

  return (
    <div>
      <SectionTitle subtitle="خلاصه وضعیت حساب شما">میز کار</SectionTitle>

      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}

      {orders && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card>
              <p className="text-xs text-slate-400">نیازمند اقدام</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{actionable.length}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-400">در حال اجرا</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{active.length}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-400">کل سفارش‌ها</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{orders.length}</p>
            </Card>
            <Card>
              <LinkButton href="/orders/new" className="w-full">
                ثبت درخواست جدید
              </LinkButton>
            </Card>
          </div>

          {orders.length === 0 ? (
            <EmptyState
              title="هنوز سفارشی ثبت نکرده‌اید"
              description="اولین درخواستت را ثبت کن تا تیم اجرا بررسی کند."
              action={<LinkButton href="/orders/new">اولین درخواستت را ثبت کن</LinkButton>}
            />
          ) : (
            <Card>
              <h3 className="mb-3 font-bold text-slate-800">سفارش‌های اخیر</h3>
              <div className="divide-y divide-slate-100">
                {orders.slice(0, 6).map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between py-3 text-sm hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{order.title}</p>
                      <p className="text-xs text-slate-400">
                        {order.code} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
