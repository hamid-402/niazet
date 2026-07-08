'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, inputClass, PageLoading, SectionTitle } from '@/components/ui';

interface ChecklistItem {
  id: string;
  label: string;
}

interface QcReviewDetail {
  id: string;
  comment: string | null;
  order: {
    code: string;
    title: string;
    briefDescription: string;
    files: { id: string; originalName: string }[];
    serviceLine: { qcChecklistTemplates: { items: ChecklistItem[] }[] };
  };
}

export default function AdminQcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [review, setReview] = useState<QcReviewDetail | null>(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<QcReviewDetail>(`/admin/qc/${id}`).then(setReview).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!review) return error ? <ErrorBanner message={error} /> : <PageLoading />;

  const checklistItems = review.order.serviceLine.qcChecklistTemplates.flatMap((t) => t.items);

  async function submit(action: 'approve' | 'request-rework' | 'reject') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/qc/${id}/${action}`, {
        method: 'POST',
        body: {
          comment,
          items: checklistItems.map((item) => ({
            checklistItemId: item.id,
            passed: !!checked[item.id],
          })),
        },
      });
      router.push('/admin/qc');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ثبت نتیجه QC');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionTitle subtitle={review.order.code}>{review.order.title}</SectionTitle>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <Card className="mb-4">
        <h3 className="mb-2 font-bold text-slate-800">شرح سفارش</h3>
        <p className="text-sm text-slate-600">{review.order.briefDescription}</p>
      </Card>

      <Card className="mb-4">
        <h3 className="mb-2 font-bold text-slate-800">فایل‌های خروجی</h3>
        {review.order.files.length === 0 ? (
          <p className="text-sm text-slate-400">فایلی ثبت نشده است.</p>
        ) : (
          <ul className="list-inside list-disc text-sm text-slate-600">
            {review.order.files.map((f) => (
              <li key={f.id}>{f.originalName}</li>
            ))}
          </ul>
        )}
      </Card>

      {checklistItems.length > 0 && (
        <Card className="mb-4">
          <h3 className="mb-2 font-bold text-slate-800">چک‌لیست QC</h3>
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                />
                {item.label}
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <textarea
          className={`${inputClass} mb-3 min-h-20`}
          placeholder="یادداشت reviewer"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => submit('approve')}>
            تایید برای مشتری
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => submit('request-rework')}>
            درخواست اصلاح
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => submit('reject')}>
            رد
          </Button>
        </div>
      </Card>
    </div>
  );
}
