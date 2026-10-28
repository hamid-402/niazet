'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status-badge';
import type { ExecutorProfile, OrderStatus } from '@/lib/types';
import { OrbitStaffSurface } from '@/components/orbit-staff-surface';
import styles from '@/components/orbit-staff-surface.module.css';

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
    <OrbitStaffSurface>
      <div className={styles.heading}><div><p className={styles.eyebrow}>میز کار مجری</p><SectionTitle subtitle={`مسئول پیگیری: ${data.profile.displayAlias} (${data.profile.publicHandlerCode})`}>کارهای من</SectionTitle></div></div>

      <div className={styles.metrics}>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">کارهای فعال</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.activeOrders}
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">نیازمند اصلاح پس از کنترل کیفیت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {data.needsRework}
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">نرخ تأیید کنترل کیفیت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(data.profile.qcPassRate).toFixed(0)}٪
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(data.profile.onTimeDeliveryRate).toFixed(0)}٪
          </p>
        </Card>
      </div>

      <Card className={styles.section}>
        <h2>کارهای در صف</h2>
        {data.dueSoon.length === 0 ? (
          <p className="text-sm text-fg-subtle">کاری در صف نیست.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.dueSoon.map((order) => (
              <Link
                key={order.id}
                href={`/executor/orders/${order.id}`}
                className={`${styles.queueLink} text-sm hover:bg-bg-subtle`}
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
    </OrbitStaffSurface>
  );
}
