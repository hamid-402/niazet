'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { ExecutorProfile, OrderStatus } from '@/lib/types';

interface DashboardData {
  profile: ExecutorProfile;
  activeOrders: number;
  needsRework: number;
  dueSoon: {
    id: string;
    code: string;
    title: string;
    status: OrderStatus;
    urgency: string;
  }[];
  recentReports: { id: string; summary: string }[];
}

export default function ExecutorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DashboardData>('/executor/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div>
      <SectionTitle
        subtitle={`مسئول پیگیری: ${data.profile.displayAlias} (${data.profile.publicHandlerCode})`}
      >
        کارهای من
      </SectionTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-fg-subtle">کارهای فعال</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.activeOrders}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">نیازمند اصلاح پس از کنترل کیفیت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.needsRework}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">نرخ تأیید کنترل کیفیت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(data.profile.qcPassRate).toFixed(0)}٪
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(data.profile.onTimeDeliveryRate).toFixed(0)}٪
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 font-bold text-fg">کارهای در صف</h3>
        {data.dueSoon.length === 0 ? (
          <p className="text-sm text-fg-subtle">کاری در صف نیست.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.dueSoon.map((order) => (
              <Link
                key={order.id}
                href={`/executor/orders/${order.id}`}
                className="flex items-center justify-between py-3 text-sm hover:bg-bg-subtle"
              >
                <div>
                  <p className="font-medium text-fg">{order.title}</p>
                  <p className="text-xs text-fg-subtle">{order.code}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
