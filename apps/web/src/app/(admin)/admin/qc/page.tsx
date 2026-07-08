'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';

interface QcQueueItem {
  id: string;
  order: { code: string; title: string; status: string; serviceLine: { title: string } };
}

export default function AdminQcQueuePage() {
  const [items, setItems] = useState<QcQueueItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<QcQueueItem[]>('/admin/qc/queue').then(setItems).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle>صف کنترل کیفیت (QC)</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!items && !error && <PageLoading />}
      {items && items.length === 0 && <EmptyState title="خروجی‌ای در صف QC نیست." />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items?.map((item) => (
          <Link key={item.id} href={`/admin/qc/${item.id}`}>
            <Card className="transition hover:border-slate-400">
              <p className="text-xs text-slate-400">{item.order.serviceLine.title}</p>
              <h3 className="font-bold text-slate-900">{item.order.title}</h3>
              <p className="text-xs text-slate-400">{item.order.code}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
