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

      <Card className="mb-4">
        <h3 className="mb-2 font-bold text-slate-800">شرح کار</h3>
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

      <Card className="mb-4">
        <h3 className="mb-3 font-bold text-slate-800">اقدام</h3>
        {order.status === "assigned" && (
          <Button
            disabled={busy}
            onClick={() =>
              runAction(() =>
                apiFetch(`/executor/orders/${id}/start`, { method: "POST" }),
              )
            }
          >
            شروع اجرا
          </Button>
        )}

        {order.status === "in_progress" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="خلاصه گزارش پیشرفت"
                  value={progressSummary}
                  onChange={(e) => setProgressSummary(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={busy || !progressSummary}
                  onClick={() =>
                    runAction(async () => {
                      await apiFetch(`/executor/orders/${id}/progress-report`, {
                        method: "POST",
                        body: {
                          summary: progressSummary,
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
              </div>
              <SecureFileUpload
                orderId={id}
                fileKind="report"
                label={progressFile ? "تغییر فایل گزارش" : "پیوست فایل گزارش"}
                disabled={busy}
                onUploaded={setProgressFile}
              />
              {progressFile && (
                <p className="text-xs text-emerald-700">
                  فایل گزارش آماده است: {progressFile.originalName}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">
                ارسال خروجی برای QC / تحویل
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    placeholder="توضیح خروجی"
                    value={deliverSummary}
                    onChange={(e) => setDeliverSummary(e.target.value)}
                  />
                  <Button
                    disabled={
                      busy || !deliverSummary || outputFiles.length === 0
                    }
                    onClick={() =>
                      runAction(() =>
                        apiFetch(`/executor/orders/${id}/deliver`, {
                          method: "POST",
                          body: {
                            summary: deliverSummary,
                            fileIds: outputFiles.map((file) => file.id),
                          },
                        }),
                      )
                    }
                  >
                    ارسال برای QC
                  </Button>
                </div>
                <SecureFileUpload
                  orderId={id}
                  fileKind="output"
                  label="افزودن فایل خروجی"
                  disabled={busy}
                  onUploaded={(file) =>
                    setOutputFiles((current) => [...current, file])
                  }
                />
                {outputFiles.length > 0 && (
                  <div className="space-y-1">
                    {outputFiles.map((file) => (
                      <SecureFileLink key={file.id} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {order.status === "qc_rejected" && (
          <p className="text-sm text-amber-700">
            خروجی نیاز به اصلاح دارد؛ پس از اصلاح دوباره از حالت «در حال اجرا»
            ارسال کنید.
          </p>
        )}

        {!["assigned", "in_progress", "qc_rejected"].includes(order.status) && (
          <p className="text-sm text-slate-400">
            در این وضعیت اقدامی برای شما نیاز نیست.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-bold text-slate-800">گزارش‌های ثبت‌شده</h3>
        {order.reports && order.reports.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {order.reports.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-medium text-slate-700">{r.reportType}</p>
                <p className="text-slate-500">{r.summary}</p>
                {r.file && (
                  <div className="mt-1">
                    <SecureFileLink file={r.file} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">گزارشی ثبت نشده است.</p>
        )}
      </Card>
    </div>
  );
}
