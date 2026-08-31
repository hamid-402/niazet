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
import { OrderStatusBadge } from "@/components/status-badge";
import { SecureFileLink, SecureFileUpload } from "@/components/secure-file";
import type { OrderDetail, OrderFile } from "@/lib/types";
import { OrderTimeline } from "@/components/order-timeline";

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join("، ");
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ExecutorOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressSummary, setProgressSummary] = useState("");
  const [progressPercent, setProgressPercent] = useState(25);
  const [deliverSummary, setDeliverSummary] = useState("");
  const [progressFile, setProgressFile] = useState<OrderFile | null>(null);
  const [outputFiles, setOutputFiles] = useState<OrderFile[]>([]);

  const load = useCallback(() => {
    apiFetch<OrderDetail>(`/executor/orders/${id}`)
      .then(setOrder)
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
      setError(
        err instanceof ApiError ? err.message : "خطا در انجام عملیات",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <ErrorBanner message={error} /> : <PageLoading />;

  const formEntries =
    order.formResponses && typeof order.formResponses === "object"
      ? Object.entries(order.formResponses as Record<string, unknown>)
      : [];

  const assignment = order.assignments?.[0];
  const checklist = assignment?.executionChecklistItems ?? [];
  const completedChecklist = checklist.filter((item) => item.isCompleted).length;
  const checklistReady = checklist.length === completedChecklist;
  const inputFiles = (order.files ?? []).filter(
    (file) => file.fileKind === "input",
  );
  const latestQc = order.qcReviews?.[0];
  const needsRework = latestQc?.result === "needs_rework";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{order.code}</p>
          <h1 className="text-xl font-extrabold text-slate-900">
            {order.title}
          </h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {error && <ErrorBanner message={error} />}

      {needsRework && (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="font-bold text-amber-900">اصلاحات درخواستی QC</h2>
          <p className="mt-2 text-sm leading-7 text-amber-800">
            {latestQc.comment || "خروجی را مطابق موارد ردشده اصلاح و دوباره ارسال کنید."}
          </p>
          {latestQc.items.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {latestQc.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className={item.passed ? "text-emerald-600" : "text-rose-600"}>
                    {item.passed ? "✓" : "×"}
                  </span>
                  <span>
                    {item.checklistItem.label}
                    {item.note ? ` — ${item.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-slate-800">شرح و ورودی‌های کار</h2>
          <p className="text-sm leading-7 text-slate-600">
            {order.briefDescription}
          </p>
          {formEntries.length > 0 && (
            <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 px-3">
              {formEntries.map(([key, value]) => (
                <div key={key} className="grid gap-1 py-2 text-sm sm:grid-cols-3">
                  <dt className="font-medium text-slate-500">{key}</dt>
                  <dd className="break-words text-slate-700 sm:col-span-2">
                    {displayValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-slate-700">فایل‌های ورودی امن</h3>
            {inputFiles.length ? (
              <div className="space-y-2">
                {inputFiles.map((file) => (
                  <SecureFileLink key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">فایل ورودی جداگانه‌ای ثبت نشده است.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-800">معیار پذیرش و چک‌لیست اجرا</h2>
            {assignment?.acceptedAt && (
              <span className="text-xs text-emerald-700">پذیرش ثبت شده</span>
            )}
          </div>
          {order.acceptanceCriteria?.length ? (
            <ul className="space-y-2 text-sm text-slate-600">
              {order.acceptanceCriteria.map((criterion) => {
                const item = checklist.find(
                  (checklistItem) => checklistItem.label === criterion.description,
                );
                return (
                  <li key={criterion.id} className="rounded-xl border border-slate-100 p-3">
                    {item ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-emerald-600"
                          checked={item.isCompleted}
                          disabled={busy || !assignment?.acceptedAt}
                          onChange={(event) =>
                            runAction(() =>
                              apiFetch(`/executor/orders/${id}/checklist/${item.id}`, {
                                method: "PATCH",
                                body: { completed: event.target.checked },
                              }),
                            )
                          }
                        />
                        <span>{criterion.description}</span>
                      </label>
                    ) : (
                      <span>{criterion.description}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">معیار جداگانه‌ای تعریف نشده است.</p>
          )}
          {assignment?.acceptedAt && checklist.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>پیشرفت چک‌لیست</span>
                <span>{completedChecklist} از {checklist.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(completedChecklist / checklist.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-bold text-slate-800">اقدام بعدی</h2>
        {order.status === "assigned" && !assignment?.acceptedAt && (
          <div>
            <p className="mb-3 text-sm leading-7 text-slate-600">
              با پذیرش، تأیید می‌کنید شرح کار، ورودی‌ها و معیارهای تحویل را بررسی کرده‌اید.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                runAction(() =>
                  apiFetch(`/executor/orders/${id}/accept`, { method: "POST" }),
                )
              }
            >
              پذیرش مسئولیت سفارش
            </Button>
          </div>
        )}

        {order.status === "assigned" && assignment?.acceptedAt && (
          <Button
            disabled={busy}
            onClick={() =>
              runAction(() =>
                apiFetch(`/executor/orders/${id}/start`, { method: "POST" }),
              )
            }
          >
            شروع اجرای کار
          </Button>
        )}

        {order.status === "in_progress" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700">گزارش پیشرفت</h3>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="کارهای انجام‌شده و اقدام بعدی را بنویسید"
                value={progressSummary}
                onChange={(event) => setProgressSummary(event.target.value)}
              />
              <label className="block text-xs text-slate-500">
                درصد پیشرفت: {progressPercent}٪
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progressPercent}
                  onChange={(event) => setProgressPercent(Number(event.target.value))}
                  className="mt-2 w-full accent-emerald-600"
                />
              </label>
              <SecureFileUpload
                orderId={id}
                fileKind="report"
                label={progressFile ? "تغییر فایل گزارش" : "پیوست فایل گزارش"}
                disabled={busy}
                onUploaded={setProgressFile}
              />
              {progressFile && (
                <p className="text-xs text-emerald-700">
                  فایل آماده است: {progressFile.originalName}
                </p>
              )}
              <Button
                variant="secondary"
                disabled={busy || progressSummary.trim().length < 3}
                onClick={() =>
                  runAction(async () => {
                    await apiFetch(`/executor/orders/${id}/progress-report`, {
                      method: "POST",
                      body: {
                        summary: progressSummary,
                        progressPercent,
                        fileId: progressFile?.id,
                      },
                    });
                    setProgressSummary("");
                    setProgressFile(null);
                  })
                }
              >
                ثبت گزارش پیشرفت
              </Button>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-5 xl:border-r xl:border-t-0 xl:pr-6 xl:pt-0">
              <h3 className="text-sm font-bold text-slate-700">
                {needsRework ? "ارسال نسخه اصلاح‌شده" : "تحویل خروجی برای QC"}
              </h3>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="خلاصه خروجی و نکات لازم برای بازبین"
                value={deliverSummary}
                onChange={(event) => setDeliverSummary(event.target.value)}
              />
              <SecureFileUpload
                orderId={id}
                fileKind={needsRework ? "revision" : "output"}
                label="افزودن فایل خروجی"
                disabled={busy}
                onUploaded={(file) =>
                  setOutputFiles((current) => [...current, file])
                }
              />
              {outputFiles.map((file) => (
                <SecureFileLink key={file.id} file={file} />
              ))}
              {!checklistReady && (
                <p className="text-xs text-amber-700">
                  تحویل پس از تکمیل همه موارد چک‌لیست فعال می‌شود.
                </p>
              )}
              <Button
                disabled={
                  busy ||
                  deliverSummary.trim().length < 3 ||
                  outputFiles.length === 0 ||
                  !checklistReady
                }
                onClick={() =>
                  runAction(async () => {
                    await apiFetch(`/executor/orders/${id}/deliver`, {
                      method: "POST",
                      body: {
                        summary: deliverSummary,
                        fileIds: outputFiles.map((file) => file.id),
                      },
                    });
                    setDeliverSummary("");
                    setOutputFiles([]);
                  })
                }
              >
                {needsRework ? "ارسال مجدد برای QC" : "ارسال برای QC"}
              </Button>
            </section>
          </div>
        )}

        {!["assigned", "in_progress"].includes(order.status) && (
          <p className="text-sm text-slate-400">
            در این وضعیت اقدام اجرایی تازه‌ای از شما لازم نیست.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold text-slate-800">گزارش‌های ثبت‌شده</h2>
        {order.reports?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {order.reports.map((report) => (
              <li key={report.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-700">
                    {report.reportType} · نسخه {report.version}
                  </p>
                  {report.progressPercent != null && (
                    <span className="text-xs text-emerald-700">
                      پیشرفت {report.progressPercent}٪
                    </span>
                  )}
                </div>
                <p className="mt-1 text-slate-500">{report.summary}</p>
                {report.file && (
                  <div className="mt-2">
                    <SecureFileLink file={report.file} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">گزارشی ثبت نشده است.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold text-slate-800">خط زمانی سفارش و مراحل</h2>
        <OrderTimeline order={order} showFinancials={false} />
      </Card>
    </div>
  );
}
