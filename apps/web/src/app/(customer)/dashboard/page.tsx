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
import { formatDate, formatNumber } from '@/lib/format';
import { OrbitCustomerSurface } from '@/components/orbit-customer-surface';
import styles from '@/components/orbit-customer-surface.module.css';
import { isCustomerOrderActionable, isCustomerOrderOpen } from '@/lib/customer-order-view';

export default function CustomerDashboardPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<OrderSummary[]>('/customer/orders')
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);

  const actionable = orders?.filter((o) => isCustomerOrderActionable(o.status)) ?? [];
  const active = orders?.filter((o) => isCustomerOrderOpen(o.status)) ?? [];

  return (
    <OrbitCustomerSurface>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>فضای کاری شما</p>
          <SectionTitle subtitle="از اقدام بعدی تا تحویل، سفارش‌هایت را اینجا دنبال کن.">میز کار</SectionTitle>
        </div>
        <LinkButton href="/orders/new" className={styles.headingAction}>ثبت درخواست جدید</LinkButton>
      </div>

      {error && <ErrorBanner message={error} />}
      {!orders && !error && <PageLoading />}

      {orders && (
        <>
          <section className={styles.metrics} aria-label="خلاصه سفارش‌ها">
            <Card className={styles.metric}>
              <p className="text-xs text-fg-subtle">نیازمند اقدام</p>
              <p className={styles.metricValue}>
                {formatNumber(actionable.length)}
              </p>
            </Card>
            <Card className={styles.metric}>
              <p className="text-xs text-fg-subtle">در جریان</p>
              <p className={styles.metricValue}>{formatNumber(active.length)}</p>
            </Card>
            <Card className={styles.metric}>
              <p className="text-xs text-fg-subtle">کل سفارش‌ها</p>
              <p className={styles.metricValue}>{formatNumber(orders.length)}</p>
            </Card>
          </section>

          {orders.length === 0 ? (
            <EmptyState
              title="هنوز سفارشی ثبت نکرده‌اید"
              description="اولین درخواستت را ثبت کن تا تیم اجرا بررسی کند."
              action={
                <LinkButton href="/orders/new">
                  اولین درخواستت را ثبت کن
                </LinkButton>
              }
            />
          ) : (
            <section aria-labelledby="recent-orders-title">
              <div className={styles.sectionHeading}>
                <h2 id="recent-orders-title">سفارش‌های اخیر</h2>
                <Link href="/orders" className={styles.sectionLink}>مشاهدهٔ همهٔ سفارش‌ها</Link>
              </div>
              <Card className={styles.recentCard}>
              <div className="divide-y divide-border">
                {orders.slice(0, 6).map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className={`${styles.recentLink} text-sm hover:bg-bg-subtle`}
                  >
                    <div>
                      <p className="font-bold text-fg">{order.title}</p>
                      <p className="text-xs text-fg-subtle">
                        {order.code} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </Link>
                ))}
              </div>
              </Card>
            </section>
          )}
        </>
      )}
    </OrbitCustomerSurface>
  );
}
