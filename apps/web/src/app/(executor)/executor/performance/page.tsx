'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { OrbitStaffSurface } from '@/components/orbit-staff-surface';
import styles from '@/components/orbit-staff-surface.module.css';

interface Performance {
  qcPassRate: number;
  onTimeDeliveryRate: number;
  customerRatingAvg: number;
  complaintCount: number;
  complimentCount: number;
}

export default function ExecutorPerformancePage() {
  const [perf, setPerf] = useState<Performance | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Performance>('/executor/performance')
      .then(setPerf)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!perf) return <PageLoading />;

  return (
    <OrbitStaffSurface>
      <div className={styles.heading}><div><p className={styles.eyebrow}>کیفیت اجرا</p>
      <SectionTitle subtitle="خلاصه محدود و غیرحساس عملکرد شما">
        عملکرد من
      </SectionTitle>
      </div></div>
      <div className={styles.metrics}>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">نرخ قبولی QC</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.qcPassRate).toFixed(0)}٪
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.onTimeDeliveryRate).toFixed(0)}٪
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">میانگین امتیاز مشتری</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.customerRatingAvg).toFixed(1)}
          </p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-subtle">تشکر / شکایت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {perf.complimentCount} / {perf.complaintCount}
          </p>
        </Card>
      </div>
    </OrbitStaffSurface>
  );
}
