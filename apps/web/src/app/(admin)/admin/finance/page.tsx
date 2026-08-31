'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatNumber, formatToman } from '@/lib/format';

interface FinanceDashboard {
  period: { timeZone: string; startUtc: string };
  gmv: number;
  revenue: number;
  commission: number;
  escrow: { held: number; total: number; count: number };
  walletLiability: { balance: number; count: number };
  refunds: number;
  pendingWithdrawals: number;
  failedPayments: number;
}

export default function AdminFinanceDashboardPage() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<FinanceDashboard>('/admin/finance/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div>
      <SectionTitle>داشبورد مالی</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs text-fg-subtle">GMV این ماه</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatToman(data.gmv)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">درآمد و کارمزد این ماه</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatToman(data.revenue)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">مانده Escrow</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatToman(data.escrow.held)}
          </p>
          <p className="text-xs text-fg-subtle">
            {formatNumber(data.escrow.count)} حساب امانی
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">بازپرداخت این ماه</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatToman(data.refunds)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">برداشت در انتظار</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatNumber(data.pendingWithdrawals)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">پرداخت ناموفق</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatNumber(data.failedPayments)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-fg-subtle">تعهد کیف پول‌ها</p>
          <p className="mt-1 text-xl font-bold text-fg">
            {formatToman(data.walletLiability.balance)}
          </p>
          <p className="text-xs text-fg-subtle">{formatNumber(data.walletLiability.count)} کیف پول</p>
        </Card>
      </div>
    </div>
  );
}
