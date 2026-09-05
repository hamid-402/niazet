"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageLoading,
  SectionTitle,
  inputClass,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";

interface FeedbackItem {
  id: string;
  code: string;
  targetType: "order" | "team" | "executor" | "support" | "qc";
  feedbackType: "rating" | "complaint" | "compliment";
  rating: number | null;
  satisfactionPercent: number | null;
  comment: string | null;
  status: "submitted" | "in_review" | "resolved" | "closed";
  resolutionNote: string | null;
  createdAt: string;
  order: { id: string; code: string; title: string };
  customer: { fullName: string; phone: string };
}

const FEEDBACK_LABELS = {
  rating: "امتیاز",
  complaint: "شکایت",
  compliment: "تشکر",
};
const TARGET_LABELS = {
  order: "سفارش",
  team: "تیم اجرا",
  executor: "مجری",
  support: "پشتیبانی",
  qc: "کنترل کیفیت",
};
const STATUS_LABELS = {
  submitted: "ثبت‌شده",
  in_review: "در حال بررسی",
  resolved: "رسیدگی‌شده",
  closed: "بسته‌شده",
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [code, setCode] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [status, setStatus] = useState("");
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (code.trim()) params.set("code", code.trim());
    if (feedbackType) params.set("feedbackType", feedbackType);
    if (status) params.set("status", status);
    try {
      setItems(
        await apiFetch<FeedbackItem[]>(
          `/admin/feedback${params.size ? `?${params}` : ""}`,
          { dedupe: false },
        ),
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت بازخوردها ممکن نشد.");
    }
  }, [code, feedbackType, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateStatus(
    item: FeedbackItem,
    nextStatus: "in_review" | "resolved" | "closed",
  ) {
    setBusyId(item.id);
    setError("");
    try {
      await apiFetch(`/admin/feedback/${item.id}/status`, {
        method: "PATCH",
        body: {
          status: nextStatus,
          resolutionNote: noteById[item.id]?.trim() || undefined,
        },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تغییر وضعیت ممکن نشد.");
    } finally {
      setBusyId("");
    }
  }

  const complaintCount = items?.filter((item) => item.feedbackType === "complaint").length ?? 0;
  const openCount = items?.filter((item) => ["submitted", "in_review"].includes(item.status)).length ?? 0;

  return (
    <div>
      <SectionTitle subtitle="جست‌وجو با کد پیگیری، صف رسیدگی و اعلام نتیجه به مشتری">
        بازخورد و شکایت‌ها
      </SectionTitle>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Card><p className="text-xs text-fg-subtle">نیازمند پیگیری</p><p className="mt-1 text-2xl font-extrabold text-warning">{formatNumber(openCount)}</p></Card>
        <Card><p className="text-xs text-fg-subtle">شکایت در نتیجه فعلی</p><p className="mt-1 text-2xl font-extrabold text-danger">{formatNumber(complaintCount)}</p></Card>
      </div>

      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <Field label="کد پیگیری">
            <input className={inputClass} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="FBK-..." dir="ltr" />
          </Field>
          <Field label="نوع">
            <select className={inputClass} value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}><option value="">همه</option><option value="complaint">شکایت</option><option value="compliment">تشکر</option><option value="rating">امتیاز</option></select>
          </Field>
          <Field label="وضعیت">
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">همه</option><option value="submitted">ثبت‌شده</option><option value="in_review">در حال بررسی</option><option value="resolved">رسیدگی‌شده</option><option value="closed">بسته‌شده</option></select>
          </Field>
          <Button type="button" onClick={() => void load()}>اعمال فیلتر</Button>
        </div>
      </Card>

      {!items ? <PageLoading /> : items.length === 0 ? <EmptyState title="بازخوردی با این فیلتر یافت نشد." /> : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className={item.feedbackType === "complaint" ? "border-danger-border" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge color={item.feedbackType === "complaint" ? "red" : item.feedbackType === "compliment" ? "green" : "blue"}>{FEEDBACK_LABELS[item.feedbackType]}</Badge><Badge>{TARGET_LABELS[item.targetType]}</Badge><b dir="ltr" className="text-sm text-fg">{item.code}</b></div>
                  <Link href={`/admin/orders/${item.order.id}`} className="mt-2 block font-bold text-fg hover:text-accent">{item.order.title} · {item.order.code}</Link>
                  <p className="mt-1 text-xs text-fg-muted">مشتری: {item.customer.fullName} · <span dir="ltr">{item.customer.phone}</span> · {formatDate(item.createdAt)}</p>
                </div>
                <Badge color={item.status === "resolved" || item.status === "closed" ? "green" : item.status === "in_review" ? "yellow" : "blue"}>{STATUS_LABELS[item.status]}</Badge>
              </div>
              {item.rating && <p className="mt-3 text-warning" aria-label={`${formatNumber(item.rating)} از ۵ ستاره`}>{"★".repeat(item.rating)}<span className="text-fg-subtle" aria-hidden="true">{"★".repeat(5 - item.rating)}</span> {item.satisfactionPercent != null && `· رضایت ${formatNumber(item.satisfactionPercent)}٪`}</p>}
              {item.comment && <p className="mt-3 rounded-control bg-bg-subtle px-3 py-3 text-sm leading-7 text-fg-muted">{item.comment}</p>}
              {item.resolutionNote ? <p className="mt-3 rounded-control bg-success-subtle px-3 py-3 text-sm text-success">نتیجه: {item.resolutionNote}</p> : (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <Field label="یادداشت نتیجه رسیدگی">
                    <textarea className={`${inputClass} min-h-20`} value={noteById[item.id] ?? ""} onChange={(event) => setNoteById((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {item.status === "submitted" && <Button type="button" variant="secondary" disabled={busyId === item.id} onClick={() => void updateStatus(item, "in_review")}>شروع بررسی</Button>}
                    <Button type="button" disabled={busyId === item.id || (noteById[item.id]?.trim().length ?? 0) < 5} onClick={() => void updateStatus(item, "resolved")}>ثبت نتیجه</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
