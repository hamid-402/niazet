'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBanner, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate } from '@/lib/format';

type Log = { id: string; action: string; entityType: string; entityId: string; actorRole: string | null; sensitivity: 'normal' | 'sensitive' | 'critical'; createdAt: string };
type Response = { items: Log[]; total: number };

export default function AuditPage() {
  const [data, setData] = useState<Response | null>(null);
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const query = entityType.trim() ? `?entityType=${encodeURIComponent(entityType.trim())}` : '';
    apiFetch<Response>(`/admin/audit-log${query}`).then((result) => { if (!cancelled) setData(result); }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [entityType]);
  return <div><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><SectionTitle subtitle="رویدادهای حساس غیرقابل‌ویرایش سامانه">گزارش Audit</SectionTitle><input className={`${inputClass} w-64`} value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="فیلتر نوع موجودیت" dir="ltr" /></div>{error && <ErrorBanner message={error} />}{!data && !error && <PageLoading />}{data?.items.length === 0 && <EmptyState title="رویدادی یافت نشد." />}<div className="space-y-2">{data?.items.map((log) => <Card key={log.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-fg" dir="ltr">{log.action}</p><p className="mt-1 text-xs text-fg-subtle" dir="ltr">{log.entityType} · {log.entityId}</p></div><div className="text-left"><Badge color={log.sensitivity === 'critical' ? 'red' : log.sensitivity === 'sensitive' ? 'yellow' : 'gray'}>{log.sensitivity}</Badge><p className="mt-1 text-xs text-fg-subtle">{formatDate(log.createdAt)}</p></div></div></Card>)}</div>{data && <p className="mt-3 text-xs text-fg-subtle">مجموع: {data.total.toLocaleString('fa-IR')}</p>}</div>;
}
