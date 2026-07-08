'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatToman } from '@/lib/format';

interface FinanceDashboard {
  pendingRefunds: number;
  activeEscrowAmount: number;
  activeEscrowCount: number;
  pendingWithdrawals: number;
  failedPayments: number;
  monthRevenue: number;
}

export default function AdminFinanceDashboardPage() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<FinanceDashboard>('/admin/finance/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div>
      <SectionTitle>داشبورد مالی</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-400">گردش این ماه</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatToman(data.monthRevenue)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">escrow فعال</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatToman(data.activeEscrowAmount)}</p>
          <p className="text-xs text-slate-400">{data.activeEscrowCount} مورد</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">refund در انتظار</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{data.pendingRefunds}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">withdrawal در انتظار</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{data.pendingWithdrawals}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">پرداخت ناموفق</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{data.failedPayments}</p>
        </Card>
      </div>
    </div>
  );
}
