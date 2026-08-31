"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorBanner, inputClass, PageLoading, SectionTitle } from "@/components/ui";
import { TicketStatusBadge } from "@/components/status-badge";
import type { Ticket } from "@/lib/types";
import { formatDate } from "@/lib/format";

function slaState(dueAt: string | null) {
  if (!dueAt) return { label: "بدون SLA", className: "text-fg-subtle" };
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff <= 0) return { label: "عبور از SLA", className: "text-danger" };
  const hours = Math.ceil(diff / 3_600_000);
  if (hours <= 1) return { label: "کمتر از یک ساعت", className: "text-warning" };
  return { label: `${hours} ساعت مانده`, className: "text-success" };
}

function SupportTicketsQueueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "mine" ? "mine" : "queue";
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ view });
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    apiFetch<Ticket[]>(`/support/tickets?${query.toString()}`)
      .then((result) => {
        if (!cancelled) setTickets(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [priority, status, view]);

  async function claim(ticketId: string) {
    setBusyId(ticketId);
    setError("");
    try {
      await apiFetch(`/support/tickets/${ticketId}/claim`, { method: "POST" });
      router.replace("/support/tickets?view=mine");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در برداشتن تیکت");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>{view === "mine" ? "تیکت‌های من" : "صف تیکت‌ها"}</SectionTitle>
        <div className="flex rounded-card border border-border p-1 text-sm">
          <button className={`rounded-control px-3 py-2 ${view === "queue" ? "bg-accent text-fg-on-accent" : "text-fg-muted"}`} onClick={() => router.replace("/support/tickets")}>کل صف</button>
          <button className={`rounded-control px-3 py-2 ${view === "mine" ? "bg-accent text-fg-on-accent" : "text-fg-muted"}`} onClick={() => router.replace("/support/tickets?view=mine")}>تیکت‌های من</button>
        </div>
      </div>

      <Card className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-fg-muted">وضعیت
          <select className={`${inputClass} mt-1`} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">همه وضعیت‌ها</option><option value="open">باز</option><option value="assigned">تخصیص‌یافته</option><option value="waiting_internal">منتظر اقدام داخلی</option><option value="waiting_customer">منتظر مشتری</option><option value="escalated">ارجاع ویژه</option><option value="resolved">حل‌شده</option><option value="closed">بسته‌شده</option>
          </select>
        </label>
        <label className="text-xs text-fg-muted">اولویت
          <select className={`${inputClass} mt-1`} value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">همه اولویت‌ها</option><option value="low">کم</option><option value="normal">عادی</option><option value="high">زیاد</option><option value="urgent">فوری</option>
          </select>
        </label>
      </Card>

      {error && <ErrorBanner message={error} />}
      {!tickets && !error && <PageLoading />}
      {tickets?.length === 0 && <EmptyState title="تیکتی با این فیلتر یافت نشد." />}

      {tickets && tickets.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-sm">
            <thead><tr className="border-b border-border text-right text-xs text-fg-subtle"><th className="px-4 py-3 font-medium">موضوع</th><th className="px-4 py-3 font-medium">مشتری</th><th className="px-4 py-3 font-medium">اولویت</th><th className="px-4 py-3 font-medium">وضعیت</th><th className="px-4 py-3 font-medium">SLA</th><th className="px-4 py-3 font-medium">ایجاد</th><th className="px-4 py-3 font-medium">اقدام</th></tr></thead>
            <tbody>{tickets.map((ticket) => {
              const sla = slaState(ticket.slaDueAt);
              return <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-bg-subtle">
                <td className="px-4 py-3"><Link href={`/support/tickets/${ticket.id}`} className="font-medium text-fg hover:underline">{ticket.subject}</Link><p className="text-xs text-fg-subtle">{ticket.code}</p></td>
                <td className="px-4 py-3 text-fg-muted">{ticket.customer?.fullName ?? "—"}</td><td className="px-4 py-3 text-fg-muted">{ticket.priority}</td><td className="px-4 py-3"><TicketStatusBadge status={ticket.status} /></td><td className={`px-4 py-3 text-xs font-medium ${sla.className}`}>{sla.label}</td><td className="px-4 py-3 text-fg-subtle">{formatDate(ticket.createdAt)}</td>
                <td className="px-4 py-3">{!ticket.assignedToUserId ? <Button variant="secondary" disabled={busyId === ticket.id} onClick={() => claim(ticket.id)}>برداشتن تیکت</Button> : <Link href={`/support/tickets/${ticket.id}`} className="text-success">مشاهده</Link>}</td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default function SupportTicketsQueuePage() {
  return <Suspense fallback={<PageLoading />}><SupportTicketsQueueContent /></Suspense>;
}
