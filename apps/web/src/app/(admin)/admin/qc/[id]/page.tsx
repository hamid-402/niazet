"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  inputClass,
  PageLoading,
  SectionTitle,
} from "@/components/ui";
import { SecureFileLink } from "@/components/secure-file";
import type { OrderFile } from "@/lib/types";

interface ChecklistItem {
  id: string;
  label: string;
}

interface QcReviewDetail {
  id: string;
  comment: string | null;
  publicationManifest?: { fingerprint: string; requiresManualBinding: boolean; versions: { fileId: string; deliveryVersion: number | null }[] };
  order: {
    code: string;
    title: string;
    briefDescription: string;
    files: OrderFile[];
    serviceLine: { qcChecklistTemplates: { items: ChecklistItem[] }[] };
  };
}

export default function AdminQcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [review, setReview] = useState<QcReviewDetail | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [humanReviewed, setHumanReviewed] = useState(false);
  const lastReview = useRef<string | null>(null);

  const load = useCallback(() => {
    apiFetch<QcReviewDetail>(`/admin/qc/${id}`)
      .then((data) => {
        if (lastReview.current !== data.id) { setHumanReviewed(false); setChecked({}); setComment(""); lastReview.current = data.id; }
        setReview(data);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!review || review.id !== id) return error ? <ErrorBanner message={error} /> : <PageLoading />;

  const checklistItems = review.order.serviceLine.qcChecklistTemplates.flatMap(
    (t) => t.items,
  );
  const needsHumanConfirmation = checklistItems.length === 0;
  const invalidHumanConfirmation = needsHumanConfirmation && (!humanReviewed || comment.trim().length < 3 || comment.trim().length > 500);

  async function submit(action: "approve" | "request-rework" | "reject") {
    if (!review || review.id !== id || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/admin/qc/${id}/${action}`, {
        method: "POST",
        body: {
          comment,
          ...(review.publicationManifest ? { manifestFingerprint: review.publicationManifest.fingerprint } : {}),
          ...(needsHumanConfirmation ? { outputReviewed: humanReviewed } : {}),
          items: checklistItems.map((item) => ({
            checklistItemId: item.id,
            passed: !!checked[item.id],
          })),
        },
      });
      router.push("/admin/qc");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ثبت نتیجه QC");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionTitle subtitle={review.order.code}>
        {review.order.title}
      </SectionTitle>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <Card className="mb-4">
        <h2 className="mb-2 font-bold text-fg">شرح سفارش</h2>
        <p className="text-sm text-fg-muted">
          {review.order.briefDescription}
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-bold text-fg">فایل‌های خروجی</h2>
        {review.publicationManifest?.requiresManualBinding && <p className="mb-3 text-sm leading-7 text-warning">این پرونده قدیمی مدرک نسخه ندارد؛ ابتدا نسخهٔ فایل باید با بررسی انسانی به پرونده متصل شود. قبولی سفارش یا فایل دیگر، مجوز این نسخه نیست.</p>}
        {review.publicationManifest?.requiresManualBinding && <Link href="/admin/qc/legacy" className="mb-3 inline-block text-sm font-bold text-accent underline">رفتن به بررسی انسانی نسخه‌های قدیمی</Link>}
        {review.order.files.length === 0 ? (
          <p className="text-sm text-fg-subtle">فایلی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2 text-sm text-fg-muted">
            {review.order.files.map((f) => (
              <li key={f.id}>
                <SecureFileLink file={f} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {checklistItems.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-bold text-fg">چک‌لیست QC</h2>
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 text-sm text-fg"
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={(e) =>
                    setChecked((prev) => ({
                      ...prev,
                      [item.id]: e.target.checked,
                    }))
                  }
                />
                {item.label}
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card>
        {needsHumanConfirmation && <label className="mb-4 flex items-start gap-3 text-sm leading-7 text-fg"><input type="checkbox" checked={humanReviewed} disabled={busy} onChange={(event) => setHumanReviewed(event.target.checked)} className="mt-2" /><span>خروجی‌های همین پرونده را بازبینی کردم؛ نبود چک‌لیست به معنی معافیت از QC نیست. علت نتیجه را در یادداشت بنویسید.</span></label>}
        <textarea
          aria-label="یادداشت کنترل کیفیت"
          className={`${inputClass} mb-3 min-h-20`}
          placeholder="یادداشت reviewer"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || invalidHumanConfirmation || !!review.publicationManifest?.requiresManualBinding} onClick={() => submit("approve")}>
            تایید برای مشتری
          </Button>
          <Button
            variant="secondary"
            disabled={busy || invalidHumanConfirmation}
            onClick={() => submit("request-rework")}
          >
            درخواست اصلاح
          </Button>
          <Button
            variant="danger"
            disabled={busy || invalidHumanConfirmation}
            onClick={() => submit("reject")}
          >
            رد
          </Button>
        </div>
      </Card>
    </div>
  );
}
