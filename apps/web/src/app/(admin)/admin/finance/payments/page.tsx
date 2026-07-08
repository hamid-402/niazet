'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatToman } from '@/lib/format';

interface Payment {
  id: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
  order: { code: string; title: string };
  customer: { fullName: string; phone: string };
}

const STATUS_COLOR: Record<string, 'gray' | 'green' | 'yellow' | 'red'> = {
  pending: 'yellow',
  verifying: 'yellow',
  succeeded: 'green',
  failed: 'red',
  refunded: 'gray',
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Payment[]>('/admin/finance/payments').then(setPayments).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle>پرداخت‌ها</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!payments && !error && <PageLoading />}
      {payments && payments.length === 0 && <EmptyState title="پرداختی ثبت نشده است." />}

      {payments && payments.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">سفارش</th>
                <th className="px-4 py-3 font-medium">مشتری</th>
                <th className="px-4 py-3 font-medium">مبلغ</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{p.order.code}</td>
                  <td className="px-4 py-3 text-slate-500">{p.customer.fullName}</td>
                  <td className="px-4 py-3 text-slate-700">{formatToman(p.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[p.status] ?? 'gray'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
