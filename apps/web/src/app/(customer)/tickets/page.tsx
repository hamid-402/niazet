'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LinkButton,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { TicketStatusBadge } from '@/components/status-badge';
import type { Ticket } from '@/lib/types';
import { formatDate } from '@/lib/format';

export default function CustomerTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Ticket[]>('/customer/tickets')
      .then(setTickets)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>تیکت‌های من</SectionTitle>
        <LinkButton href="/tickets/new">ثبت تیکت جدید</LinkButton>
      </div>

      {error && <ErrorBanner message={error} />}
      {!tickets && !error && <PageLoading />}
      {tickets && tickets.length === 0 && (
        <EmptyState title="تیکتی ثبت نکرده‌اید." />
      )}

      {tickets && tickets.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">موضوع</th>
                <th className="px-4 py-3 font-medium">دسته</th>
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
                      href={`/tickets/${t.id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {t.subject}
                    </Link>
                    <p className="text-xs text-slate-400">{t.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.category}</td>
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
