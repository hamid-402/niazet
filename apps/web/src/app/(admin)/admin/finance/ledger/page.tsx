'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, EmptyState, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatToman } from '@/lib/format';

interface LedgerEntry {
  id: string;
  amount: number;
  referenceType: string;
  createdAt: string;
  debitAccount: { accountType: string };
  creditAccount: { accountType: string };
}

const ACCOUNT_LABELS: Record<string, string> = {
  customer_wallet: 'کیف پول مشتری',
  executor_wallet: 'کیف پول مجری',
  platform_commission: 'کارمزد پلتفرم',
  platform_escrow: 'امانت پلتفرم',
  payment_gateway_clearing: 'درگاه پرداخت',
};

export default function AdminLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<LedgerEntry[]>('/admin/finance/ledger').then(setEntries).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle subtitle="فقط نمایش؛ بدون امکان ویرایش مستقیم">Ledger</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!entries && !error && <PageLoading />}
      {entries && entries.length === 0 && <EmptyState title="تراکنشی ثبت نشده است." />}

      {entries && entries.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">بدهکار</th>
                <th className="px-4 py-3 font-medium">بستانکار</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">نوع</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{ACCOUNT_LABELS[e.debitAccount.accountType]}</td>
                  <td className="px-4 py-3 text-slate-500">{ACCOUNT_LABELS[e.creditAccount.accountType]}</td>
                  <td className="px-4 py-3 text-slate-700">{formatToman(e.amount)}</td>
                  <td className="px-4 py-3 text-slate-500">{e.referenceType}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
