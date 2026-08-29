'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { formatToman } from '@/lib/format';
import { ConfirmationModal } from '@/components/confirmation-modal';

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
  const [pending, setPending] = useState<{
    item: Escrow;
    action: 'release' | 'refund';
  } | null>(null);

  function load() {
    apiFetch<Escrow[]>('/admin/finance/escrow')
      .then(setItems)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function act(orderId: string, action: 'release' | 'refund', note: string) {
    setBusy(true);
    setError('');
    try {
      const body =
        action === 'release'
          ? { note }
          : {
              note,
              reason: 'admin_decision',
            };
      await apiFetch(`/admin/finance/escrow/${orderId}/${action}`, {
        method: 'POST',
        body,
      });
      load();
      setPending(null);
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
      {items && items.length === 0 && (
        <EmptyState title="مبلغ در امانتی وجود ندارد." />
      )}

      <div className="space-y-3">
        {items?.map((e) => (
          <Card key={e.id}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{e.order.title}</p>
                <p className="text-xs text-slate-400">{e.order.code}</p>
              </div>
              <Badge color={e.status === 'held' ? 'yellow' : 'green'}>
                {e.status}
              </Badge>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              مبلغ: {formatToman(e.amount)}
            </p>
            {(e.status === 'held' || e.status === 'partially_released') && (
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  disabled={busy}
                  onClick={() => setPending({ item: e, action: 'release' })}
                >
                  آزادسازی
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setPending({ item: e, action: 'refund' })}
                >
                  رفاند
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {pending && (
        <ConfirmationModal
          open
          title={pending.action === 'release' ? 'تأیید آزادسازی Escrow' : 'تأیید بازپرداخت Escrow'}
          description={`سفارش ${pending.item.order.code} — ${pending.item.order.title}`}
          impacts={pending.action === 'release'
            ? [`انتقال ${formatToman(pending.item.amount)} از حساب امانی`, 'ثبت سند Ledger و Audit غیرقابل‌ویرایش']
            : [`بازگشت ${formatToman(pending.item.amount)} به کیف پول مشتری`, 'ثبت Refund و سند Ledger غیرقابل‌ویرایش']}
          confirmLabel={pending.action === 'release' ? 'آزادسازی مبلغ' : 'ثبت بازپرداخت'}
          tone={pending.action === 'release' ? 'primary' : 'danger'}
          onCancel={() => setPending(null)}
          onConfirm={(note) => act(pending.item.orderId, pending.action, note)}
        />
      )}
    </div>
  );
}
