"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  inputClass,
  PageLoading,
} from "@/components/ui";
import { TicketStatusBadge } from "@/components/status-badge";
import type { OrderFile, Ticket, TicketMessage } from "@/lib/types";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import { formatDate } from "@/lib/format";

export default function SupportTicketDetailPage({
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
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [attachment, setAttachment] = useState<OrderFile | null>(null);

  const load = useCallback(() => {
    apiFetch<Ticket & { messages: TicketMessage[] }>(`/support/tickets/${id}`)
      .then(setTicket)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در انجام عملیات");
    } finally {
      setBusy(false);
    }
  }

  if (!ticket) return error ? <ErrorBanner message={error} /> : <PageLoading />;

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

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-4 space-y-3">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl p-3 text-sm ${m.visibility === "internal_only" ? "bg-amber-50" : "bg-slate-50"}`}
            >
              {m.visibility === "internal_only" && (
                <p className="mb-1 text-xs font-bold text-amber-700">
                  یادداشت داخلی
                </p>
              )}
              <p className="text-slate-700">{m.body}</p>
              <p className="mt-1 text-xs text-slate-400">
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
        <div className="flex flex-col gap-2">
          <textarea
            className={`${inputClass} min-h-20`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="پاسخ خود را بنویسید..."
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
              />
              یادداشت داخلی (فقط برای تیم)
            </label>
            <Button
              disabled={busy || !body}
              onClick={() =>
                runAction(async () => {
                  await apiFetch(`/support/tickets/${id}/reply`, {
                    method: "POST",
                    body: {
                      body,
                      visibility: internal
                        ? "internal_only"
                        : "customer_visible",
                      attachmentFileId: attachment?.id,
                    },
                  });
                  setBody("");
                  setAttachment(null);
                })
              }
            >
              ارسال
            </Button>
          </div>
          {ticket.orderId ? (
            <>
              <SecureFileUpload
                orderId={ticket.orderId}
                fileKind="ticket_attachment"
                label={attachment ? "تغییر پیوست" : "افزودن پیوست پاسخ"}
                disabled={busy}
                onUploaded={setAttachment}
              />
              {attachment && (
                <p className="text-xs text-emerald-700">
                  پیوست آماده ارسال: {attachment.originalName}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-fg-muted">
              پیوست فقط برای تیکت مرتبط با سفارش فعال است.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-bold text-slate-800">عملیات تیکت</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={inputClass}
            placeholder="دلیل ارجاع (escalation)"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy || !escalateReason}
            onClick={() =>
              runAction(() =>
                apiFetch(`/support/tickets/${id}/escalate`, {
                  method: "POST",
                  body: { reason: escalateReason },
                }),
              )
            }
          >
            ارجاع (Escalate)
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              runAction(() =>
                apiFetch(`/support/tickets/${id}/resolve`, { method: "POST" }),
              )
            }
          >
            علامت‌گذاری به‌عنوان حل‌شده
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              runAction(() =>
                apiFetch(`/support/tickets/${id}/close`, { method: "POST" }),
              )
            }
          >
            بستن تیکت
          </Button>
        </div>
      </Card>
    </div>
  );
}
