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
          <ol className="relative border-r border-slate-200 pr-4">
            {order.statusHistory?.map((h) => (
              <li key={h.id} className="mb-4 last:mb-0">
                <span className="absolute -mr-[21px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
                <p className="text-sm font-medium text-slate-800">
                  <OrderStatusBadge status={h.toStatus} />
                </p>
                {h.note && (
                  <p className="mt-1 text-xs text-slate-500">{h.note}</p>
                )}
                <p className="text-xs text-slate-400">
                  {formatDate(h.createdAt)}
                </p>
              </li>
            ))}
          </ol>
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
                    <Badge color="blue">{r.reportType}</Badge>
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
        <FeedbackForm orderId={id} handlerCode={handler?.publicHandlerCode} />
      )}
    </div>
  );
}

function FeedbackForm({
  orderId,
  handlerCode,
}: {
  orderId: string;
  handlerCode?: string;
}) {
  const [feedbackType, setFeedbackType] = useState<
    "rating" | "complaint" | "compliment"
  >("rating");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-emerald-700">
          بازخورد شما ثبت شد. سپاس از وقتی که گذاشتید.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <SectionTitle>ثبت بازخورد، تشکر یا شکایت</SectionTitle>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="نوع بازخورد">
          <select
            className={inputClass}
            value={feedbackType}
            onChange={(e) =>
              setFeedbackType(e.target.value as typeof feedbackType)
            }
          >
            <option value="rating">امتیاز</option>
            <option value="compliment">تشکر</option>
            <option value="complaint">شکایت</option>
          </select>
        </Field>
        <Field label="امتیاز (۱ تا ۵)">
          <input
            type="number"
            min={1}
            max={5}
            className={inputClass}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
          />
        </Field>
        <Field label="توضیح">
          <input
            className={inputClass}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await apiFetch(`/customer/orders/${orderId}/feedback`, {
                method: "POST",
                body: {
                  targetType: handlerCode ? "executor" : "order",
                  publicHandlerCode: handlerCode,
                  feedbackType,
                  rating,
                  comment,
                },
              });
              setSent(true);
            } catch (err) {
              setError(
                err instanceof ApiError ? err.message : "خطا در ثبت بازخورد",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          ثبت
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}
    </Card>
  );
}
