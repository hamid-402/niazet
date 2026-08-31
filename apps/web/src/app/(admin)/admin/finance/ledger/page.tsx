'use client';

import { useEffect, useState } from 'react';
import { apiFetch, downloadAuthenticated } from '@/lib/api';
import { ResponsiveTable,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
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
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiFetch<LedgerEntry[]>('/admin/finance/ledger')
      .then(setEntries)
      .catch((e) => setError(e.message));
  }, []);

  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      await downloadAuthenticated(
        '/admin/finance/ledger/export',
        `niazat-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خروجی Ledger دریافت نشد.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle subtitle="فقط نمایش؛ بدون امکان ویرایش مستقیم">Ledger</SectionTitle>
        <Button variant="secondary" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? 'در حال تهیه...' : 'خروجی CSV'}</Button>
      </div>
      {error && <ErrorBanner message={error} />}
      {!entries && !error && <PageLoading />}
      {entries && entries.length === 0 && (
        <EmptyState title="تراکنشی ثبت نشده است." />
      )}

      {entries && entries.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <ResponsiveTable className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">بدهکار</th>
                <th className="px-4 py-3 font-medium">بستانکار</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">نوع</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 text-fg-muted">
                    {ACCOUNT_LABELS[e.debitAccount.accountType]}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {ACCOUNT_LABELS[e.creditAccount.accountType]}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {formatToman(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {e.referenceType}
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {formatDate(e.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>
      )}
    </div>
  );
}
