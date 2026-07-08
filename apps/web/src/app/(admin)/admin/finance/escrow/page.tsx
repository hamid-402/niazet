'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import { formatToman } from '@/lib/format';

interface Escrow {
  id: string;
  amount: number;
  status: string;
  orderId: string;
  order: { code: string; title: string; status: string };
}

export default function AdminEscrowPage() {
  const [items, setItems] = useState<Escrow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});

  function load() {
    apiFetch<Escrow[]>('/admin/finance/escrow').then(setItems).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function act(orderId: string, action: 'release' | 'refund') {
    setBusy(true);
    setError('');
    try {
      const body =
        action === 'release'
          ? { note: note[orderId] || 'آزادسازی توسط ادمین مالی' }
          : { note: note[orderId] || 'رفاند توسط ادمین مالی', reason: 'admin_decision' };
      await apiFetch(`/admin/finance/escrow/${orderId}/${action}`, { method: 'POST', body });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در انجام عملیات');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle>Escrow</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!items && !error && <PageLoading />}
      {items && items.length === 0 && <EmptyState title="مبلغ در امانتی وجود ندارد." />}

      <div className="space-y-3">
        {items?.map((e) => (
          <Card key={e.id}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{e.order.title}</p>
                <p className="text-xs text-slate-400">{e.order.code}</p>
              </div>
              <Badge color={e.status === 'held' ? 'yellow' : 'green'}>{e.status}</Badge>
            </div>
            <p className="mb-3 text-sm text-slate-600">مبلغ: {formatToman(e.amount)}</p>
            {(e.status === 'held' || e.status === 'partially_released') && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="یادداشت (اجباری)">
                  <input
                    className={inputClass}
                    value={note[e.orderId] ?? ''}
                    onChange={(ev) => setNote((prev) => ({ ...prev, [e.orderId]: ev.target.value }))}
                  />
                </Field>
                <Button disabled={busy} onClick={() => act(e.orderId, 'release')}>
                  آزادسازی
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => act(e.orderId, 'refund')}>
                  رفاند
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
