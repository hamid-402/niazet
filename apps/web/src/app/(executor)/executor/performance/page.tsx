'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';

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
    <div>
      <SectionTitle subtitle="خلاصه محدود و غیرحساس عملکرد شما">
        عملکرد من
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-fg-subtle">نرخ قبولی QC</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.qcPassRate).toFixed(0)}٪
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.onTimeDeliveryRate).toFixed(0)}٪
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">میانگین امتیاز مشتری</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {Number(perf.customerRatingAvg).toFixed(1)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">تشکر / شکایت</p>
          <p className="mt-1 text-2xl font-bold text-fg">
            {perf.complimentCount} / {perf.complaintCount}
          </p>
        </Card>
      </div>
    </div>
  );
}
