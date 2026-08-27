'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorBanner, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatToman } from '@/lib/format';

type Withdrawal = {
  id: string;
  amount: number;
  shabaNumber: string;
  shabaVerifiedAt: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  processedAt: string | null;
  executorProfile: { displayAlias: string; publicHandlerCode: string };
};

const STATUS_LABELS: Record<string, string> = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده', paid: 'پرداخت‌شده' };
const STATUS_COLORS: Record<string, 'gray' | 'yellow' | 'green' | 'red'> = { pending: 'yellow', approved: 'green', rejected: 'red', paid: 'green' };

export default function AdminWithdrawalsPage() {
  const [items, setItems] = useState<Withdrawal[] | null>(null);
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const query = status ? `?status=${status}` : '';
    const result = await apiFetch<Withdrawal[]>(`/admin/finance/withdrawals${query}`);
    setItems(result);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const query = status ? `?status=${status}` : '';
    apiFetch<Withdrawal[]>(`/admin/finance/withdrawals${query}`)
      .then((result) => { if (!cancelled) setItems(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [status]);

  async function decide(item: Withdrawal, action: 'approve' | 'reject') {
    const note = notes[item.id]?.trim();
    if (!note) { setError('برای تأیید یا رد برداشت، یادداشت الزامی است.'); return; }
    setBusy(item.id); setError('');
    try {
      await apiFetch(`/admin/finance/withdrawals/${item.id}/${action}`, { method: 'PATCH', body: { note } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تصمیم برداشت ثبت نشد.');
    } finally {
      setBusy('');
    }
  }

  function toggleShaba(id: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <SectionTitle subtitle="تأیید، رد و ثبت تسویه مجریان با ردپای مالی">درخواست‌های برداشت</SectionTitle>
      <select className={`${inputClass} w-48`} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">همه وضعیت‌ها</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    {error && <ErrorBanner message={error} />}
    {!items && !error && <PageLoading />}
    {items?.length === 0 && <EmptyState title="درخواستی در این وضعیت وجود ندارد." />}
    <div className="space-y-3">{items?.map((item) => {
      const isRevealed = revealed.has(item.id);
      const maskedShaba = `IR••••••••••••••••••••${item.shabaNumber.slice(-4)}`;
      return <Card key={item.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-bold text-fg">{item.executorProfile.displayAlias}</p><p className="mt-1 text-xs text-fg-subtle" dir="ltr">{item.executorProfile.publicHandlerCode}</p></div>
          <div className="text-left"><Badge color={STATUS_COLORS[item.status] ?? 'gray'}>{STATUS_LABELS[item.status] ?? item.status}</Badge><p className="mt-2 text-lg font-extrabold text-fg">{formatToman(item.amount)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-bg-subtle p-3 text-sm">
          <span className="text-fg-muted">شبای تأییدشده:</span><code dir="ltr" className="text-fg">{isRevealed ? item.shabaNumber : maskedShaba}</code><Button variant="ghost" onClick={() => toggleShaba(item.id)}>{isRevealed ? 'پنهان‌کردن' : 'نمایش شبا'}</Button>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">ثبت درخواست: {formatDate(item.createdAt)}{item.decidedAt ? ` · تصمیم: ${formatDate(item.decidedAt)}` : ''}</p>
        {item.status === 'pending' && <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="text-sm text-fg-muted">یادداشت تصمیم (اجباری)<input className={`${inputClass} mt-1`} value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="علت و مستند تصمیم" /></label>
          <Button disabled={busy === item.id || !notes[item.id]?.trim()} onClick={() => void decide(item, 'approve')}>تأیید و ثبت تسویه</Button>
          <Button variant="danger" disabled={busy === item.id || !notes[item.id]?.trim()} onClick={() => void decide(item, 'reject')}>رد درخواست</Button>
        </div>}
        {item.note && item.status !== 'pending' && <p className="mt-3 text-sm text-fg-muted">یادداشت: {item.note}</p>}
      </Card>;
    })}</div>
  </div>;
}
