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
  dueSoon: { id: string; code: string; title: string; status: OrderStatus; urgency: string }[];
  recentReports: { id: string; summary: string }[];
}

export default function ExecutorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DashboardData>('/executor/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div>
      <SectionTitle subtitle={`مسئول پیگیری: ${data.profile.displayAlias} (${data.profile.publicHandlerCode})`}>
        کارهای من
      </SectionTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-400">کارهای فعال</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.activeOrders}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">نیازمند اصلاح (QC)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.needsRework}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">نرخ قبولی QC</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Number(data.profile.qcPassRate).toFixed(0)}٪</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Number(data.profile.onTimeDeliveryRate).toFixed(0)}٪</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 font-bold text-slate-800">کارهای در صف</h3>
        {data.dueSoon.length === 0 ? (
          <p className="text-sm text-slate-400">کاری در صف نیست.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.dueSoon.map((order) => (
              <Link
                key={order.id}
                href={`/executor/orders/${order.id}`}
                className="flex items-center justify-between py-3 text-sm hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{order.title}</p>
                  <p className="text-xs text-slate-400">{order.code}</p>
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
