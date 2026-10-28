"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  inputClass,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { TicketStatusBadge } from "@/components/status-badge";
import type { Ticket, TicketMessage } from "@/lib/types";
import type { OrderFile } from "@/lib/types";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import { formatDate } from "@/lib/format";

export default function CustomerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<
    (Ticket & { messages: TicketMessage[] }) | null
  >(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<OrderFile | null>(null);

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
          <p className="text-xs text-fg-subtle">{ticket.code}</p>
          <h1 className="text-xl font-extrabold text-fg">
            {ticket.subject}
          </h1>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>

      <Card>
        <SectionTitle as="h2">گفتگو</SectionTitle>
        <div className="mb-4 space-y-3">
          {ticket.messages.map((m) => (
            <div key={m.id} className="rounded-card bg-bg-subtle p-3 text-sm">
              <p className="text-fg">{m.body}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                {formatDate(m.createdAt)}
              </p>
              {m.attachment && (
                <div className="mt-2">
                  <SecureFileLink
                    file={m.attachment}
                    label={`پیوست: ${m.attachment.originalName}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
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
                    method: "POST",
                    body: { body, attachmentFileId: attachment?.id },
                  });
                  setBody("");
                  setAttachment(null);
                  load();
                } catch (err) {
                  setError(
                    err instanceof ApiError ? err.message : "خطا در ارسال پیام",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              ارسال
            </Button>
          </div>
          {ticket.orderId ? (
            <>
              <SecureFileUpload
                orderId={ticket.orderId}
                fileKind="ticket_attachment"
                label={attachment ? "تغییر پیوست" : "افزودن پیوست"}
                disabled={busy}
                onUploaded={setAttachment}
              />
              {attachment && (
                <p className="text-xs text-success">
                  پیوست آماده ارسال: {attachment.originalName}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-fg-muted">
              این تیکت سفارش مرتبط ندارد؛ پیوست فقط برای تیکت‌های مرتبط با سفارش
              فعال است.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
