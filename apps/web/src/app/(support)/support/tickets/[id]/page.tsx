"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, ErrorBanner, inputClass, PageLoading } from "@/components/ui";
import { TicketStatusBadge } from "@/components/status-badge";
import type { OrderFile, Ticket, TicketMessage } from "@/lib/types";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import { formatDate } from "@/lib/format";

type CannedReply = { id: string; title: string; category: string; body: string };
type SupportTicket = Ticket & { messages: TicketMessage[] };

function slaLabel(dueAt: string | null) {
  if (!dueAt) return "بدون SLA";
  const minutes = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return `SLA عبور کرده · ${formatDate(dueAt)}`;
  if (minutes < 60) return `${minutes} دقیقه تا پایان SLA`;
  return `${Math.ceil(minutes / 60)} ساعت تا پایان SLA`;
}

export default function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [attachment, setAttachment] = useState<OrderFile | null>(null);

  const load = useCallback(() => {
    apiFetch<SupportTicket>(`/support/tickets/${id}`).then(setTicket).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
    apiFetch<CannedReply[]>("/support/tickets/canned-replies").then(setCannedReplies).catch(() => undefined);
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setError(""); setBusy(true);
    try { await fn(); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "خطا در انجام عملیات"); }
    finally { setBusy(false); }
  }

  if (!ticket) return error ? <ErrorBanner message={error} /> : <PageLoading />;

  const canAct = user?.role === "admin" || ticket.assignedToUserId === user?.id;
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-fg-subtle">{ticket.code}</p><h1 className="text-xl font-extrabold text-fg">{ticket.subject}</h1></div>
        <TicketStatusBadge status={ticket.status} />
      </div>
      {error && <ErrorBanner message={error} />}

      <Card className="grid gap-3 text-sm sm:grid-cols-2">
        <div><p className="text-xs text-fg-subtle">مشتری</p><p className="mt-1 text-fg">{ticket.customer?.fullName ?? "—"}</p></div>
        <div><p className="text-xs text-fg-subtle">مسئول</p><p className="mt-1 text-fg">{ticket.assignedTo?.fullName ?? "بدون مسئول"}</p></div>
        <div><p className="text-xs text-fg-subtle">اولویت</p><p className="mt-1 text-fg">{ticket.priority}</p></div>
        <div><p className="text-xs text-fg-subtle">زمان پاسخ SLA</p><p className={`mt-1 font-medium ${ticket.slaDueAt && new Date(ticket.slaDueAt) < new Date() ? "text-danger" : "text-success"}`}>{slaLabel(ticket.slaDueAt)}</p></div>
      </Card>

      {!ticket.assignedToUserId && user?.role === "support" && (
        <Card className="border-info-border bg-info-subtle">
          <p className="mb-3 text-sm text-info">برای پاسخ یا تغییر وضعیت، ابتدا مسئولیت این تیکت را بردارید.</p>
          <Button disabled={busy} onClick={() => runAction(() => apiFetch(`/support/tickets/${id}/claim`, { method: "POST" }))}>برداشتن تیکت</Button>
        </Card>
      )}
      {ticket.assignedToUserId && !canAct && (
        <Card className="border-warning-border bg-warning-subtle text-sm text-warning">این تیکت به پشتیبان دیگری تخصیص دارد و برای شما فقط خواندنی است.</Card>
      )}

      <Card>
        <h2 className="mb-4 font-bold text-fg">گفت‌وگو و یادداشت‌ها</h2>
        <div className="mb-5 space-y-3">
          {ticket.messages.map((message) => (
            <div key={message.id} className={`rounded-card p-3 text-sm ${message.visibility === "internal_only" ? "border border-warning-border bg-warning-subtle" : "bg-bg-subtle"}`}>
              {message.visibility === "internal_only" && <p className="mb-1 text-xs font-bold text-warning">یادداشت داخلی · فقط تیم پشتیبانی</p>}
              <p className="whitespace-pre-wrap text-fg">{message.body}</p>
              <p className="mt-1 text-xs text-fg-subtle">{formatDate(message.createdAt)}</p>
              {message.attachment && <div className="mt-2"><SecureFileLink file={message.attachment} label={`پیوست: ${message.attachment.originalName}`} /></div>}
            </div>
          ))}
        </div>

        {!closed && canAct && (
          <div className="space-y-3 border-t border-border pt-4">
            <label className="block text-xs text-fg-muted">پاسخ آماده
              <select className={`${inputClass} mt-1`} value="" onChange={(event) => {
                const selected = cannedReplies.find((reply) => reply.id === event.target.value);
                if (selected) setBody(selected.body);
              }}>
                <option value="">انتخاب پاسخ آماده…</option>
                {cannedReplies.map((reply) => <option key={reply.id} value={reply.id}>{reply.title}</option>)}
              </select>
            </label>
            <textarea className={`${inputClass} min-h-28`} value={body} onChange={(event) => setBody(event.target.value)} placeholder={internal ? "یادداشت داخلی را بنویسید…" : "پاسخ مشتری را بنویسید…"} />
            <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />یادداشت داخلی؛ مشتری آن را نمی‌بیند</label>
            {ticket.orderId && <SecureFileUpload orderId={ticket.orderId} fileKind="ticket_attachment" label={attachment ? "تغییر پیوست" : "افزودن پیوست پاسخ"} disabled={busy} onUploaded={setAttachment} />}
            {attachment && <p className="text-xs text-success">پیوست آماده ارسال: {attachment.originalName}</p>}
            <Button disabled={busy || body.trim().length < 2} onClick={() => runAction(async () => {
              await apiFetch(`/support/tickets/${id}/reply`, { method: "POST", body: { body: body.trim(), visibility: internal ? "internal_only" : "customer_visible", attachmentFileId: attachment?.id } });
              setBody(""); setAttachment(null); setInternal(false);
            })}>{internal ? "ثبت یادداشت داخلی" : "ارسال پاسخ به مشتری"}</Button>
          </div>
        )}
      </Card>

      {canAct && !closed && (
        <Card>
          <h2 className="mb-3 font-bold text-fg">عملیات تیکت</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row"><input className={inputClass} placeholder="دلیل ارجاع ویژه" value={escalateReason} onChange={(event) => setEscalateReason(event.target.value)} /><Button variant="secondary" disabled={busy || escalateReason.trim().length < 3} onClick={() => runAction(() => apiFetch(`/support/tickets/${id}/escalate`, { method: "POST", body: { reason: escalateReason.trim() } }))}>ارجاع ویژه</Button></div>
            <div className="flex flex-wrap gap-2">
              {ticket.status !== "resolved" && <Button variant="secondary" disabled={busy} onClick={() => runAction(() => apiFetch(`/support/tickets/${id}/resolve`, { method: "POST" }))}>علامت‌گذاری به‌عنوان حل‌شده</Button>}
              {ticket.status === "resolved" && <Button variant="danger" disabled={busy} onClick={() => runAction(() => apiFetch(`/support/tickets/${id}/close`, { method: "POST" }))}>بستن تیکت حل‌شده</Button>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
