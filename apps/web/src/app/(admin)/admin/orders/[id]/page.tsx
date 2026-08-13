"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { OrderStatusBadge } from "@/components/status-badge";
import type { ExecutorProfile, OrderDetail } from "@/lib/types";
import type { OrderFile } from "@/lib/types";
import { formatDate, formatToman } from "@/lib/format";
import { OrderTimeline } from "@/components/order-timeline";
import { SecureFileUpload } from "@/components/secure-file";

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [managementSummary, setManagementSummary] = useState("");
  const [managementVisible, setManagementVisible] = useState(false);
  const [managementFile, setManagementFile] = useState<OrderFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [quotePrice, setQuotePrice] = useState("");
  const [triageNote, setTriageNote] = useState("");
  const [staff, setStaff] = useState<ExecutorProfile[]>([]);
  const [selectedExecutor, setSelectedExecutor] = useState("");
  const [reassignExecutor, setReassignExecutor] = useState("");
  const [reassignNote, setReassignNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [disputeAmount, setDisputeAmount] = useState("");

  const load = useCallback(() => {
    apiFetch<OrderDetail>(`/admin/orders/${id}`)
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    apiFetch<ExecutorProfile[]>("/admin/staff")
      .then(setStaff)
      .catch(() => undefined);
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

  if (!order) return error ? <ErrorBanner message={error} /> : <PageLoading />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">{order.code}</p>
          <h1 className="text-xl font-extrabold text-slate-900">
            {order.title}
          </h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-400">مشتری</p>
          <p className="mt-1 font-bold text-slate-800">
            {(order as unknown as { customer?: { fullName: string } }).customer
              ?.fullName ?? "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">مبلغ نهایی</p>
          <p className="mt-1 font-bold text-slate-800">
            {formatToman(order.finalPrice)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">فوریت</p>
          <p className="mt-1 font-bold text-slate-800">{order.urgency}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">تاریخ ثبت</p>
          <p className="mt-1 font-bold text-slate-800">
            {formatDate(order.createdAt)}
          </p>
        </Card>
      </div>

      <Card className="mb-4">
        <h3 className="mb-2 font-bold text-slate-800">شرح نیاز مشتری</h3>
        <p className="text-sm leading-7 text-slate-600">
          {order.briefDescription}
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle>اقدامات عملیاتی</SectionTitle>

        {order.status === "pending_triage" || order.status === "triaging" ? (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="یادداشت تریاژ (اختیاری)">
              <input
                className={inputClass}
                value={triageNote}
                onChange={(e) => setTriageNote(e.target.value)}
              />
            </Field>
            <Button
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/triage`, {
                    method: "POST",
                    body: { decision: "send_to_quote", note: triageNote },
                  }),
                )
              }
            >
              ارسال به قیمت‌گذاری
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/triage`, {
                    method: "POST",
                    body: {
                      decision: "need_more_info",
                      note: triageNote || "لطفاً اطلاعات بیشتری ارسال کنید.",
                    },
                  }),
                )
              }
            >
              درخواست اطلاعات بیشتر
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/triage`, {
                    method: "POST",
                    body: {
                      decision: "reject",
                      note: triageNote || "رد شده در تریاژ",
                    },
                  }),
                )
              }
            >
              رد سفارش
            </Button>
          </div>
        ) : null}

        {order.status === "pending_quote" && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="مبلغ نهایی (تومان)">
              <input
                className={inputClass}
                type="number"
                dir="ltr"
                value={quotePrice}
                onChange={(e) => setQuotePrice(e.target.value)}
              />
            </Field>
            <Button
              disabled={busy || !quotePrice}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/quote`, {
                    method: "POST",
                    body: { finalPrice: Number(quotePrice) },
                  }),
                )
              }
            >
              ثبت قیمت
            </Button>
          </div>
        )}

        {order.status === "paid" && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="تخصیص به کارمند/مجری">
              <select
                className={inputClass}
                value={selectedExecutor}
                onChange={(e) => setSelectedExecutor(e.target.value)}
              >
                <option value="">انتخاب کنید</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayAlias} ({s.publicHandlerCode}) — QC:{" "}
                    {Number(s.qcPassRate).toFixed(0)}٪
                  </option>
                ))}
              </select>
            </Field>
            <Button
              disabled={busy || !selectedExecutor}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/assign`, {
                    method: "POST",
                    body: { executorProfileId: selectedExecutor },
                  }),
                )
              }
            >
              تخصیص
            </Button>
          </div>
        )}

        {["assigned", "in_progress", "qc_rejected"].includes(order.status) && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">
              مسئول فعلی:{" "}
              {(() => {
                const active = order.assignments?.find((a) => !a.unassignedAt);
                return active
                  ? `${active.executorProfile.displayAlias} (${active.executorProfile.publicHandlerCode})`
                  : "نامشخص";
              })()}
            </p>
            <p className="text-xs text-slate-500">
              اگر لازم است کار از این مجری گرفته شود و به مجری دیگری برای ادامه
              یا شروع مجدد سپرده شود، از این بخش استفاده کنید. گزارش‌ها و
              پیام‌های قبلی برای مجری جدید قابل مشاهده می‌ماند.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="تغییر مسئول اجرا به">
                <select
                  className={inputClass}
                  value={reassignExecutor}
                  onChange={(e) => setReassignExecutor(e.target.value)}
                >
                  <option value="">انتخاب مجری جدید</option>
                  {staff
                    .filter(
                      (s) =>
                        s.id !==
                        order.assignments?.find((a) => !a.unassignedAt)
                          ?.executorProfile.id,
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayAlias} ({s.publicHandlerCode}) — ظرفیت:{" "}
                        {s.capacityPercent}٪
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="یادداشت (اختیاری)">
                <input
                  className={inputClass}
                  value={reassignNote}
                  onChange={(e) => setReassignNote(e.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={busy || !reassignExecutor}
                onClick={() =>
                  runAction(async () => {
                    await apiFetch(`/admin/orders/${id}/reassign`, {
                      method: "POST",
                      body: {
                        executorProfileId: reassignExecutor,
                        note: reassignNote || undefined,
                      },
                    });
                    setReassignExecutor("");
                    setReassignNote("");
                  })
                }
              >
                سلب کار و ارجاع به مجری جدید
              </Button>
            </div>
          </div>
        )}

        {order.status === "disputed" && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">
              این سفارش در وضعیت اختلاف (dispute) است.
            </p>
            <Field label="یادداشت تصمیم (اجباری)">
              <input
                className={inputClass}
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
              />
            </Field>
            <Field label="مبلغ برای رفاند جزئی (فقط برای گزینه مربوطه)">
              <input
                className={inputClass}
                type="number"
                dir="ltr"
                value={disputeAmount}
                onChange={(e) => setDisputeAmount(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy || !disputeNote}
                onClick={() =>
                  runAction(() =>
                    apiFetch(`/admin/orders/${id}/resolve-dispute`, {
                      method: "POST",
                      body: { resolutionType: "rework", note: disputeNote },
                    }),
                  )
                }
              >
                بازگشت برای اصلاح مجدد
              </Button>
              <Button
                variant="danger"
                disabled={busy || !disputeNote}
                onClick={() =>
                  runAction(() =>
                    apiFetch(`/admin/orders/${id}/resolve-dispute`, {
                      method: "POST",
                      body: {
                        resolutionType: "refund_full",
                        note: disputeNote,
                      },
                    }),
                  )
                }
              >
                رفاند کامل
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !disputeNote || !disputeAmount}
                onClick={() =>
                  runAction(() =>
                    apiFetch(`/admin/orders/${id}/resolve-dispute`, {
                      method: "POST",
                      body: {
                        resolutionType: "refund_partial",
                        note: disputeNote,
                        amount: Number(disputeAmount),
                      },
                    }),
                  )
                }
              >
                رفاند جزئی
              </Button>
              <Button
                disabled={busy || !disputeNote}
                onClick={() =>
                  runAction(() =>
                    apiFetch(`/admin/orders/${id}/resolve-dispute`, {
                      method: "POST",
                      body: {
                        resolutionType: "release_to_executor",
                        note: disputeNote,
                      },
                    }),
                  )
                }
              >
                آزادسازی به مجری
              </Button>
            </div>
          </div>
        )}

        {!["cancelled", "closed"].includes(order.status) && (
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <Field label="دلیل لغو">
              <input
                className={inputClass}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </Field>
            <Button
              variant="danger"
              disabled={busy || !cancelReason}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/admin/orders/${id}/cancel`, {
                    method: "POST",
                    body: { reason: cancelReason },
                  }),
                )
              }
            >
              لغو سفارش
            </Button>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <h3 className="mb-3 font-bold text-slate-800">
          گزارش مدیریتی نسخه‌دار
        </h3>
        <textarea
          className={`${inputClass} min-h-24`}
          value={managementSummary}
          onChange={(event) => setManagementSummary(event.target.value)}
          placeholder="خلاصه مدیریتی سفارش"
        />
        <label className="my-3 flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={managementVisible}
            onChange={(event) => setManagementVisible(event.target.checked)}
          />
          نمایش این گزارش به مشتری
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SecureFileUpload
            orderId={id}
            fileKind="report"
            label={managementFile ? "تغییر فایل گزارش" : "پیوست فایل گزارش"}
            disabled={busy}
            onUploaded={setManagementFile}
          />
          <Button
            disabled={busy || managementSummary.trim().length < 3}
            onClick={() =>
              runAction(async () => {
                await apiFetch(`/admin/orders/${id}/reports`, {
                  method: "POST",
                  body: {
                    summary: managementSummary,
                    visibleToCustomer: managementVisible,
                    fileId: managementFile?.id,
                  },
                });
                setManagementSummary("");
                setManagementVisible(false);
                setManagementFile(null);
              })
            }
          >
            ثبت گزارش
          </Button>
        </div>
        {managementFile && (
          <p className="mt-2 text-xs text-emerald-700">
            فایل آماده: {managementFile.originalName}
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-bold text-slate-800">
          Timeline سفارش، مراحل و گزارش‌ها
        </h3>
        <OrderTimeline order={order} />
      </Card>
    </div>
  );
}
