"use client";

import { use, useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { OrderStatusBadge } from "@/components/status-badge";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import type { OrderDetail, OrderFile } from "@/lib/types";
import { formatDate, formatToman } from "@/lib/format";
import { customerNextAction, OrderTimeline } from "@/components/order-timeline";

const TABS = [
  "خلاصه",
  "مراحل",
  "گزارش‌ها",
  "فایل‌ها",
  "پیام‌ها",
  "پرداخت‌ها",
  "تیکت‌ها",
] as const;

export default function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("خلاصه");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageAttachment, setMessageAttachment] = useState<OrderFile | null>(
    null,
  );

  const load = useCallback(() => {
    apiFetch<OrderDetail>(`/customer/orders/${id}`)
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setActionError("");
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "خطا در انجام عملیات",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBanner message={error} />;
  if (!order) return <PageLoading />;

  const handler = order.publicHandlers?.[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{order.code}</p>
          <h1 className="text-xl font-extrabold text-slate-900">
            {order.title}
          </h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-400">مبلغ سفارش</p>
          <p className="mt-1 font-bold text-slate-800">
            {formatToman(order.finalPrice)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">مسئول پیگیری</p>
          <p className="mt-1 font-bold text-slate-800">
            {handler
              ? `${handler.displayAlias} (${handler.publicHandlerCode})`
              : "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">اصلاحات</p>
          <p className="mt-1 font-bold text-slate-800">
            {order.revisionsUsed} از {order.revisionsAllowed}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">تاریخ ثبت</p>
          <p className="mt-1 font-bold text-slate-800">
            {formatDate(order.createdAt)}
          </p>
        </Card>
      </div>

      {/* اقدام‌های وابسته به وضعیت */}
      <Card className="mb-4">
        <h3 className="mb-3 font-bold text-slate-800">اقدام بعدی</h3>
        <p className="mb-3 text-sm leading-7 text-fg-muted">
          {customerNextAction(order.status)}
        </p>
        <div className="flex flex-wrap gap-2">
          {order.status === "quoted" && (
            <Button
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/customer/orders/${id}/accept-quote`, {
                    method: "POST",
                  }),
                )
              }
            >
              تایید قیمت و ادامه به پرداخت
            </Button>
          )}
          {order.status === "pending_payment" && (
            <Button
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const pay = await apiFetch<{ payment: { id: string } }>(
                    `/customer/orders/${id}/pay`,
                    {
                      method: "POST",
                    },
                  );
                  await apiFetch(
                    `/customer/orders/${id}/payments/${pay.payment.id}/verify`,
                    {
                      method: "POST",
                    },
                  );
                })
              }
            >
              پرداخت (شبیه‌سازی درگاه)
            </Button>
          )}
          {order.status === "delivered" && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  runAction(() =>
                    apiFetch(`/customer/orders/${id}/confirm`, {
                      method: "POST",
                    }),
                  )
                }
              >
                تایید تحویل
              </Button>
              <details className="w-full">
                <summary className="cursor-pointer text-sm text-slate-600">
                  درخواست اصلاح
                </summary>
                <div className="mt-2 flex gap-2">
                  <input
                    className={inputClass}
                    placeholder="دلیل درخواست اصلاح"
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !revisionReason}
                    onClick={() =>
                      runAction(() =>
                        apiFetch(`/customer/orders/${id}/revision`, {
                          method: "POST",
                          body: { reason: revisionReason },
                        }),
                      )
                    }
                  >
                    ثبت درخواست اصلاح
                  </Button>
                </div>
              </details>
            </>
          )}
          {[
            "draft",
            "submitted",
            "pending_triage",
            "triaging",
            "pending_quote",
            "quoted",
            "pending_payment",
          ].includes(order.status) && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/customer/orders/${id}/cancel`, {
                    method: "POST",
                    body: { reason: "انصراف مشتری" },
                  }),
                )
              }
            >
              لغو سفارش
            </Button>
          )}
          {![
            "draft",
            "submitted",
            "pending_triage",
            "triaging",
            "pending_quote",
            "quoted",
            "pending_payment",
            "quoted",
            "closed",
            "cancelled",
          ].includes(order.status) && (
            <span className="text-sm text-slate-400">
              برای این وضعیت اقدامی نیاز نیست یا از طریق تیکت پیگیری کنید.
            </span>
          )}
        </div>
      </Card>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "خلاصه" && (
        <Card>
          <p className="text-sm leading-7 text-slate-600">
            {order.briefDescription}
          </p>
          {order.acceptanceCriteria && order.acceptanceCriteria.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-bold text-slate-700">
                معیار پذیرش
              </h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                {order.acceptanceCriteria.map((c) => (
                  <li key={c.id}>{c.description}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {tab === "مراحل" && (
        <Card>
          <OrderTimeline order={order} />
        </Card>
      )}

      {tab === "گزارش‌ها" && (
        <Card>
          {order.reports && order.reports.length > 0 ? (
            <div className="space-y-3">
              {order.reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge color="blue">
                      {r.reportType} · نسخه {r.version}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{r.summary}</p>
                  {r.file && (
                    <div className="mt-2">
                      <SecureFileLink
                        file={r.file}
                        label={`فایل گزارش: ${r.file.originalName}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">هنوز گزارشی ثبت نشده است.</p>
          )}
        </Card>
      )}

      {tab === "فایل‌ها" && (
        <Card>
          <div className="mb-4">
            <SecureFileUpload
              orderId={id}
              fileKind="input"
              label="افزودن فایل ورودی"
              onUploaded={(file) =>
                setOrder((current) =>
                  current
                    ? { ...current, files: [...(current.files ?? []), file] }
                    : current,
                )
              }
            />
          </div>
          {order.files && order.files.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {order.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between py-2"
                >
                  <SecureFileLink file={f} />
                  <span className="text-xs text-slate-400">{f.fileKind}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">فایلی ثبت نشده است.</p>
          )}
        </Card>
      )}

      {tab === "پیام‌ها" && (
        <Card>
          <div className="mb-4 space-y-3">
            {order.messages && order.messages.length > 0 ? (
              order.messages.map((m) => (
                <div key={m.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="text-slate-700">{m.body}</p>
                  {m.attachment && (
                    <div className="mt-2">
                      <SecureFileLink
                        file={m.attachment}
                        label={`پیوست: ${m.attachment.originalName}`}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(m.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">پیامی وجود ندارد.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="پیام خود را بنویسید..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
              />
              <Button
                disabled={busy || !messageBody}
                onClick={() =>
                  runAction(async () => {
                    await apiFetch(`/customer/orders/${id}/messages`, {
                      method: "POST",
                      body: {
                        body: messageBody,
                        attachmentFileId: messageAttachment?.id,
                      },
                    });
                    setMessageBody("");
                    setMessageAttachment(null);
                  })
                }
              >
                ارسال
              </Button>
            </div>
            <SecureFileUpload
              orderId={id}
              fileKind="message_attachment"
              label={messageAttachment ? "تغییر پیوست" : "افزودن پیوست"}
              disabled={busy}
              onUploaded={setMessageAttachment}
            />
            {messageAttachment && (
              <p className="text-xs text-success">
                پیوست آماده ارسال: {messageAttachment.originalName}
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === "پرداخت‌ها" && (
        <Card>
          {order.payments && order.payments.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {order.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <span>{formatToman(p.amount)}</span>
                  <Badge color={p.status === "succeeded" ? "green" : "yellow"}>
                    {p.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">پرداختی ثبت نشده است.</p>
          )}
          {order.escrowHolds && order.escrowHolds.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h4 className="mb-2 text-sm font-bold text-slate-700">
                وضعیت امانت (escrow)
              </h4>
              {order.escrowHolds.map((e) => (
                <div key={e.id} className="flex justify-between text-sm">
                  <span>{formatToman(e.amount)}</span>
                  <Badge color="purple">{e.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "تیکت‌ها" && (
        <Card>
          {order.tickets && order.tickets.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {order.tickets.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-2"
                >
                  <span>{t.subject}</span>
                  <Badge>{t.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">تیکتی ثبت نشده است.</p>
          )}
        </Card>
      )}

      {["delivered", "confirmed", "closed"].includes(order.status) && (
        <FeedbackForm
          orderId={id}
          handlers={order.publicHandlers ?? []}
        />
      )}
    </div>
  );
}

function FeedbackForm({
  orderId,
  handlers,
}: {
  orderId: string;
  handlers: Array<{
    publicHandlerCode: string;
    displayAlias: string;
  }>;
}) {
  type FeedbackTarget = "order" | "team" | "executor" | "support" | "qc";
  interface FeedbackRecord {
    id: string;
    code: string;
    targetType: FeedbackTarget;
    publicHandlerCode: string | null;
    rating: number | null;
    satisfactionPercent: number | null;
    feedbackType: "rating" | "complaint" | "compliment";
    comment: string | null;
    status: "submitted" | "in_review" | "resolved" | "closed";
    resolutionNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }

  const [targetType, setTargetType] = useState<FeedbackTarget>("order");
  const [handlerCode, setHandlerCode] = useState(
    handlers[0]?.publicHandlerCode ?? "",
  );
  const [feedbackType, setFeedbackType] = useState<
    "rating" | "complaint" | "compliment"
  >("rating");
  const [rating, setRating] = useState(5);
  const [satisfactionPercent, setSatisfactionPercent] = useState(100);
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [lastCode, setLastCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadFeedback = useCallback(() => {
    apiFetch<FeedbackRecord[]>(`/customer/orders/${orderId}/feedback`, {
      dedupe: false,
    })
      .then(setItems)
      .catch(() => undefined);
  }, [orderId]);

  useEffect(() => {
    const timer = window.setTimeout(loadFeedback, 0);
    return () => window.clearTimeout(timer);
  }, [loadFeedback]);

  const needsHandler = targetType === "executor" || targetType === "team";
  const commentRequired = feedbackType !== "rating";
  const targetLabels: Record<FeedbackTarget, string> = {
    order: "کل سفارش و تجربه دریافت خدمت",
    team: "تیم اجرا",
    executor: "مسئول یا مجری",
    support: "پشتیبانی مرتبط با سفارش",
    qc: "کنترل کیفیت (QC)",
  };
  const feedbackLabels = {
    rating: "امتیاز",
    compliment: "تشکر",
    complaint: "شکایت",
  } as const;
  const statusLabels = {
    submitted: "ثبت‌شده",
    in_review: "در حال بررسی",
    resolved: "رسیدگی‌شده",
    closed: "بسته‌شده",
  } as const;

  return (
    <div className="mt-5 space-y-4">
      <Card>
        <SectionTitle subtitle="برای هر بازخورد یک کد پیگیری مستقل دریافت می‌کنید.">
          ثبت امتیاز، تشکر یا شکایت
        </SectionTitle>
        {lastCode && (
          <p role="status" className="mb-4 rounded-control border border-success-border bg-success-subtle px-4 py-3 text-sm text-success">
            بازخورد ثبت شد. کد پیگیری: <b dir="ltr">{lastCode}</b>
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="نوع بازخورد">
            <select className={inputClass} value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as typeof feedbackType)}>
              <option value="rating">امتیاز</option>
              <option value="compliment">تشکر</option>
              <option value="complaint">شکایت</option>
            </select>
          </Field>
          <Field label="بازخورد درباره">
            <select className={inputClass} value={targetType} onChange={(event) => setTargetType(event.target.value as FeedbackTarget)}>
              {Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          {needsHandler && (
            <Field label="مسئول مرتبط" hint={handlers.length ? "فقط مسئولان قابل نمایش همین سفارش" : "مسئولی برای انتخاب ثبت نشده است."}>
              <select className={inputClass} value={handlerCode} onChange={(event) => setHandlerCode(event.target.value)} required>
                <option value="">انتخاب مسئول</option>
                {handlers.map((item) => <option key={item.publicHandlerCode} value={item.publicHandlerCode}>{item.displayAlias} ({item.publicHandlerCode})</option>)}
              </select>
            </Field>
          )}
          <Field label={`امتیاز: ${rating.toLocaleString("fa-IR")} از ۵`}>
            <div className="flex gap-1" role="radiogroup" aria-label="امتیاز ستاره‌ای">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} ستاره`} onClick={() => setRating(value)} className={`rounded-control px-3 py-2 text-xl ${value <= rating ? "bg-warning-subtle text-warning" : "bg-bg-subtle text-fg-subtle"}`}>★</button>
              ))}
            </div>
          </Field>
          <Field label={`رضایت کلی: ${satisfactionPercent.toLocaleString("fa-IR")}٪`}>
            <input type="range" min={0} max={100} step={5} value={satisfactionPercent} onChange={(event) => setSatisfactionPercent(Number(event.target.value))} className="w-full accent-accent" />
          </Field>
          <div className="md:col-span-2">
            <Field label={commentRequired ? "توضیح (الزامی)" : "توضیح تکمیلی (اختیاری)"} hint={feedbackType === "complaint" ? "شرح دقیق‌تر، رسیدگی را سریع‌تر می‌کند." : undefined}>
              <textarea className={`${inputClass} min-h-28`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} required={commentRequired} />
            </Field>
          </div>
        </div>
        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
        <div className="mt-4 flex justify-end">
          <Button
            disabled={busy || (needsHandler && !handlerCode) || (commentRequired && comment.trim().length < 5)}
            onClick={async () => {
              setBusy(true);
              setError("");
              setLastCode("");
              try {
                const result = await apiFetch<{ code: string }>(`/customer/orders/${orderId}/feedback`, {
                  method: "POST",
                  body: {
                    targetType,
                    publicHandlerCode: needsHandler ? handlerCode : undefined,
                    feedbackType,
                    rating,
                    satisfactionPercent,
                    comment: comment.trim() || undefined,
                  },
                });
                setLastCode(result.code);
                setComment("");
                loadFeedback();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "خطا در ثبت بازخورد");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "در حال ثبت..." : "ثبت و دریافت کد پیگیری"}
          </Button>
        </div>
      </Card>

      {items.length > 0 && (
        <Card>
          <h3 className="mb-3 font-extrabold text-fg">سوابق بازخورد این سفارش</h3>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-control border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-bold text-fg">{feedbackLabels[item.feedbackType]} درباره {targetLabels[item.targetType]}</p><p className="mt-1 text-xs text-fg-subtle">{formatDate(item.createdAt)} · کد <b dir="ltr">{item.code}</b></p></div>
                  <Badge color={item.status === "resolved" || item.status === "closed" ? "green" : item.status === "in_review" ? "yellow" : "blue"}>{statusLabels[item.status]}</Badge>
                </div>
                {item.rating && <p className="mt-2 text-sm text-warning">{"★".repeat(item.rating)}<span className="text-fg-subtle">{"★".repeat(5 - item.rating)}</span></p>}
                {item.comment && <p className="mt-2 text-sm leading-7 text-fg-muted">{item.comment}</p>}
                {item.resolutionNote && <p className="mt-3 rounded-control bg-success-subtle px-3 py-2 text-sm text-success">نتیجه رسیدگی: {item.resolutionNote}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
