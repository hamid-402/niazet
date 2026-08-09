'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Button,
  Card,
  ErrorBanner,
  inputClass,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { TicketStatusBadge } from '@/components/status-badge';
import type { Ticket, TicketMessage } from '@/lib/types';
import { formatDate } from '@/lib/format';

export default function CustomerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<
    (Ticket & { messages: TicketMessage[] }) | null
  >(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<Ticket & { messages: TicketMessage[] }>(`/customer/tickets/${id}`)
      .then(setTicket)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorBanner message={error} />;
  if (!ticket) return <PageLoading />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">{ticket.code}</p>
          <h1 className="text-xl font-extrabold text-slate-900">
            {ticket.subject}
          </h1>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>

      <Card>
        <SectionTitle>گفتگو</SectionTitle>
        <div className="mb-4 space-y-3">
          {ticket.messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="text-slate-700">{m.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {formatDate(m.createdAt)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="پیام خود را بنویسید..."
          />
          <Button
            disabled={busy || !body}
            onClick={async () => {
              setBusy(true);
              try {
                await apiFetch(`/customer/tickets/${id}/messages`, {
                  method: 'POST',
                  body: { body },
                });
                setBody('');
                load();
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : 'خطا در ارسال پیام',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            ارسال
          </Button>
        </div>
      </Card>
    </div>
  );
}
