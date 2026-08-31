'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { ORDER_STATUS_LABELS_FA, type OrderStatus } from '@/lib/types';

interface DashboardData {
  byStatus: Partial<Record<OrderStatus, number>>;
  activeExecutionCount: number;
  activeComplaints: number;
}

export default function AdminOpsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DashboardData>('/admin/orders/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div>
      <SectionTitle>داشبورد عملیات</SectionTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-fg-subtle">سفارش‌های در اجرا/ارجاع‌شده</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.activeExecutionCount}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">شکایت‌های فعال</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.activeComplaints}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 font-bold text-fg">
          سفارش‌ها بر اساس وضعیت
        </h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Object.entries(data.byStatus).map(([status, count]) => (
            <div
              key={status}
              className="flex items-center justify-between rounded-card bg-bg-subtle px-3 py-2 text-sm"
            >
              <span className="text-fg-muted">
                {ORDER_STATUS_LABELS_FA[status as OrderStatus] ?? status}
              </span>
              <span className="font-bold text-fg">{count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
