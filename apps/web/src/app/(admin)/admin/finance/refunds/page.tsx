'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBanner, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatToman } from '@/lib/format';

type Refund = {
  id: string;
  amount: number;
  reason: string;
  note: string;
  status: string;
  createdAt: string;
  order: { code: string; title: string };
  decidedBy: { fullName: string };
};

const STATUS_LABELS: Record<string, string> = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده', processed: 'پردازش‌شده' };

export default function AdminRefundsPage() {
  const [items, setItems] = useState<Refund[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const query = status ? `?status=${status}` : '';
    apiFetch<Refund[]>(`/admin/finance/refunds${query}`)
      .then((result) => { if (!cancelled) setItems(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [status]);

  return <div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <SectionTitle subtitle="سوابق بازگشت وجه از حساب امانی به کیف پول مشتری">بازپرداخت‌ها</SectionTitle>
      <select className={`${inputClass} w-48`} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">همه وضعیت‌ها</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    {error && <ErrorBanner message={error} />}
    {!items && !error && <PageLoading />}
    {items?.length === 0 && <EmptyState title="بازپرداختی ثبت نشده است." />}
    <div className="space-y-3">{items?.map((refund) => <Card key={refund.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-bold text-fg">{refund.order.title}</p><p className="mt-1 text-xs text-fg-subtle" dir="ltr">{refund.order.code}</p></div>
        <div className="text-left"><Badge color={refund.status === 'processed' ? 'green' : refund.status === 'rejected' ? 'red' : 'yellow'}>{STATUS_LABELS[refund.status] ?? refund.status}</Badge><p className="mt-2 font-bold text-fg">{formatToman(refund.amount)}</p></div>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-fg-muted md:grid-cols-2">
        <p>علت: {refund.reason}</p><p>تصمیم‌گیرنده: {refund.decidedBy.fullName}</p>
        <p className="md:col-span-2">یادداشت: {refund.note}</p>
        <p className="text-xs text-fg-subtle">{formatDate(refund.createdAt)}</p>
      </div>
    </Card>)}</div>
  </div>;
}
