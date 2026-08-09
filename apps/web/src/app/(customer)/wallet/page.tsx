'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import type { WalletSummary } from '@/lib/types';
import { formatDate, formatToman } from '@/lib/format';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  issuedAt: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<WalletSummary>('/customer/wallet')
      .then(setWallet)
      .catch((e) => setError(e.message));
    apiFetch<Invoice[]>('/customer/invoices')
      .then(setInvoices)
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <SectionTitle>کیف پول و فاکتورها</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!wallet && !error && <PageLoading />}

      {wallet && (
        <>
          <Card className="mb-4">
            <p className="text-xs text-slate-400">موجودی کیف پول</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatToman(wallet.balance)}
            </p>
          </Card>

          <Card className="mb-4">
            <h3 className="mb-3 font-bold text-slate-800">تراکنش‌ها</h3>
            {wallet.transactions.length === 0 ? (
              <EmptyState title="هنوز تراکنشی ثبت نشده است." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {wallet.transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span
                      className={
                        t.direction === 'credit'
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }
                    >
                      {t.direction === 'credit' ? '+' : '-'}
                      {formatToman(t.amount)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(t.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-bold text-slate-800">فاکتورها</h3>
            {!invoices || invoices.length === 0 ? (
              <EmptyState title="فاکتوری صادر نشده است." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span>{inv.invoiceNumber}</span>
                    <span>{formatToman(inv.amount)}</span>
                    <span className="text-xs text-slate-400">
                      {formatDate(inv.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
