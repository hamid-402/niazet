'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Card,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { TicketStatusBadge } from '@/components/status-badge';
import type { Ticket } from '@/lib/types';
import { formatDate } from '@/lib/format';

export default function SupportTicketsQueuePage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Ticket[]>('/support/tickets')
      .then(setTickets)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <SectionTitle>صف تیکت‌ها</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!tickets && !error && <PageLoading />}
      {tickets && tickets.length === 0 && (
        <EmptyState title="تیکت بازی وجود ندارد." />
      )}

      {tickets && tickets.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">موضوع</th>
                <th className="px-4 py-3 font-medium">مشتری</th>
                <th className="px-4 py-3 font-medium">اولویت</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/support/tickets/${t.id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {t.subject}
                    </Link>
                    <p className="text-xs text-slate-400">{t.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.customer?.fullName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.priority}</td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatDate(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
