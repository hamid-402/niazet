'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button, Card, ErrorBanner, PageLoading } from './ui';
import { ConfirmationModal } from './confirmation-modal';
import { formatDate, formatFileSize } from '@/lib/format';
import { outputId, publicationDownloadPath, readLegacyInspection, readLegacyQueue, readPublicationBytes, type LegacyInspection, type LegacyOutput } from './output-publication-contract';

type Queue = ReturnType<typeof readLegacyQueue>;
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'انجام بررسی ممکن نشد؛ دوباره تلاش کنید.';
export function LegacyOutputReview() {
  const [queue, setQueue] = useState<Queue | null>(null), [cursor, setCursor] = useState<string | null>(null), [previous, setPrevious] = useState<Array<string | null>>([]);
  const [inspection, setInspection] = useState<LegacyInspection | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false);
  const [checksum, setChecksum] = useState(''), [reviewed, setReviewed] = useState(false), [checked, setChecked] = useState<Record<string, boolean>>({});
  const [nextReview, setNextReview] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null), downloadRequest = useRef<AbortController | null>(null), lock = useRef(false);
  const keys = useRef(new Map<string, string>()), downloads = useRef(new Map<string, number>());
  const reset = () => { setInspection(null); setChecksum(''); setReviewed(false); setChecked({}); setConfirming(false); };
  const load = useCallback((next: string | null) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    return apiFetch<unknown>('/admin/output-publications' + (next ? '?cursor=' + encodeURIComponent(outputId(next)) : ''), { signal: controller.signal, retry: 0, dedupe: false }).then(readLegacyQueue).then(data => {
      if (controller.signal.aborted) return false;
      setQueue(data); setCursor(next); setInspection(null); setChecksum(''); setReviewed(false); setChecked({}); setConfirming(false); return true;
    }).catch(cause => { if (!controller.signal.aborted) { setQueue(null); setError(errorText(cause)); } return false; }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, []);
  async function reload(next: string | null) { setLoading(true); setError(''); return load(next); }
  useEffect(() => {
    void load(null);
    const activeDownloads = downloads.current;
    return () => { pending.current?.abort(); downloadRequest.current?.abort(); for (const [url, timer] of activeDownloads) { window.clearTimeout(timer); URL.revokeObjectURL(url); } activeDownloads.clear(); };
  }, [load]);
  async function select(file: LegacyOutput) {
    if (lock.current || loading || busy) return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    reset(); setLoading(true); setError(''); setNotice(''); setNextReview(null);
    try {
      const order = await apiFetch<Record<string, unknown>>(`/admin/orders/${encodeURIComponent(file.orderId)}`, { signal: controller.signal, retry: 0, dedupe: false });
      const serviceId = outputId(order.serviceId);
      const service = await apiFetch<unknown>(`/admin/services/${encodeURIComponent(serviceId)}`, { signal: controller.signal, retry: 0, dedupe: false });
      const detail = readLegacyInspection(order, service, file);
      if (!controller.signal.aborted) setInspection(detail);
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function inspectBytes() {
    if (!inspection || lock.current || busy) return;
    const current = inspection;
    setBusy(true); setError(''); setChecksum(''); setReviewed(false);
    const controller = new AbortController(); downloadRequest.current = controller;
    try {
      const grant = await apiFetch<unknown>(`/files/${encodeURIComponent(current.file.id)}/signed-url`, { signal: controller.signal, retry: 0 });
      const response = await fetch(publicationDownloadPath(grant), { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      const bytes = await readPublicationBytes(response, current.file.sizeBytes);
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      if (current.file.checksum !== null && current.file.checksum !== actual) throw new Error('بایت فایل با checksum ثبت‌شده یکسان نیست؛ تأیید مجاز نیست.');
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = url; link.download = current.file.originalName; document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      downloads.current.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000));
      setChecksum(actual);
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const ready = !!inspection && !!checksum && reviewed && (inspection.reviewId !== null || inspection.items.every(item => checked[item.id] === true));
  async function confirm(reason: string) {
    if (!inspection || !ready || lock.current) return;
    if (reason.trim().length < 3 || reason.trim().length > 500) { setError('علت واقعی باید بین ۳ و ۵۰۰ نویسه باشد.'); return; }
    lock.current = true; setBusy(true); setError('');
    const current = inspection;
    const body = { expectedChecksum: checksum, reason: reason.trim(), ...(current.reviewId ? { qcReviewId: current.reviewId } : {}), items: current.reviewId ? [] : current.items.map(item => ({ checklistItemId: item.id, passed: true })) };
    const intent = JSON.stringify([current.file.id, body]);
    if (!keys.current.has(intent)) keys.current.set(intent, crypto.randomUUID());
    try {
      const result = await apiFetch<{ id: string; fileId: string; released: boolean; requiresQcDecision: boolean }>(`/admin/output-publications/${encodeURIComponent(current.file.id)}/review`, { method: 'POST', body, idempotencyKey: keys.current.get(intent), retry: 0 });
      if (result.fileId !== current.file.id || result.released !== !current.reviewId || result.requiresQcDecision !== !!current.reviewId) throw new Error('نتیجهٔ فرمان روشن نیست؛ وضعیت را بازخوانی کنید و حدسی تأیید نکنید.');
      outputId(result.id); keys.current.delete(intent); setConfirming(false);
      setNotice(current.reviewId ? 'نسخه فقط به پروندهٔ QC متصل شد؛ هنوز برای مشتری منتشر نشده و تصمیم QC انسانی جدا لازم است.' : 'همین نسخه پس از بررسی انسانی منتشر شد؛ وضعیت سفارش و وجه تغییر نکرد.');
      setNextReview(current.reviewId); await reload(cursor);
    } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div data-legacy-output-review className="space-y-5">
    <Card className="space-y-3">
      <p className="text-sm leading-7 text-fg-muted">این صف فقط نسخه‌های قدیمیِ بدون مدرک انتشار را نشان می‌دهد. نبود چک‌لیست یا قبولی سفارش دیگر مجوز انتشار نیست. محتوا را واقعاً بازبینی کنید؛ checksum فقط هویت بایت‌ها را کنترل می‌کند.</p>
      <Button variant="secondary" disabled={loading || busy || confirming} onClick={() => void reload(cursor)}>بازخوانی صف نسخه‌های قدیمی</Button>
      {error && !confirming && <ErrorBanner message={error} />}
      {notice && <p role="status" className="text-sm leading-7 text-success">{notice}</p>}
      {nextReview && <Link className="inline-block text-sm font-bold text-accent underline" href={`/admin/qc/${encodeURIComponent(nextReview)}`}>ادامهٔ بررسی در پروندهٔ QC</Link>}
    </Card>
    {loading && <PageLoading />}
    {queue && <Card>
      <h2 className="mb-4 font-bold text-fg">فایل‌های نیازمند بررسی</h2>
      {queue.files.length === 0 ? <p className="text-sm text-fg-muted">نسخهٔ قدیمیِ منتشرنشده‌ای در این صفحه نیست.</p> : <ul className="divide-y divide-border">{queue.files.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all text-sm font-bold text-fg">{file.originalName}</p><p className="break-all text-xs leading-6 text-fg-muted">شناسه سفارش: <bdi>{file.orderId}</bdi> · {formatDate(file.createdAt)}</p></div><Button variant="secondary" disabled={loading || busy || confirming} aria-pressed={inspection?.file.id === file.id} onClick={() => void select(file)}>بررسی {file.originalName}</Button></li>)}</ul>}
      <div className="mt-4 flex flex-wrap gap-3"><Button variant="ghost" disabled={!previous.length || loading || busy || confirming} onClick={async () => { const prior = previous.at(-1) ?? null; if (await reload(prior)) setPrevious(value => value.slice(0, -1)); }}>صفحهٔ قبل</Button><Button variant="ghost" disabled={!queue.nextCursor || loading || busy || confirming} onClick={async () => { const old = cursor; if (await reload(queue.nextCursor)) setPrevious(value => [...value, old]); }}>صفحهٔ بعد</Button></div>
    </Card>}
    {inspection && <Card className="space-y-4" data-legacy-inspection>
      <h2 className="font-bold text-fg">بررسی نسخهٔ {inspection.file.originalName}</h2>
      <p className="text-sm leading-7 text-fg-muted">{inspection.orderTitle} · <bdi>{inspection.orderCode}</bdi> · {formatFileSize(inspection.file.sizeBytes)}</p>
      <Link href={`/admin/orders/${encodeURIComponent(inspection.file.orderId)}`} className="inline-block text-sm font-bold text-accent underline">مشاهده سفارش مرتبط</Link>
      <p className="text-sm leading-7 text-warning">{inspection.reviewId ? 'این نسخه فقط به پروندهٔ فعال متصل می‌شود؛ دکمهٔ زیر نتیجهٔ QC یا مجوز دانلود مشتری ایجاد نمی‌کند.' : 'این اقدام انتشار همان فایل پس از بازبینی انسانی است؛ وضعیت سفارش، مبلغ و موجودی را تغییر نمی‌دهد.'}</p>
      <Button variant="secondary" disabled={busy || loading || confirming} onClick={() => void inspectBytes()}>دریافت نسخه برای بازبینی و محاسبهٔ checksum</Button>
      {checksum && <p className="text-xs leading-6 text-fg-muted">checksum دریافت‌شده: <bdi className="block break-all" dir="ltr">{checksum}</bdi></p>}
      <label className="flex items-start gap-3 text-sm leading-7 text-fg"><input type="checkbox" className="mt-2" disabled={!checksum || busy || confirming} checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>محتوای همین نسخهٔ دریافت‌شده را واقعاً بازبینی کردم؛ تطبیق checksum به‌تنهایی ارزیابی کیفیت نیست.</span></label>
      {!inspection.reviewId && inspection.items.length > 0 && <fieldset className="space-y-3"><legend className="mb-2 font-bold text-fg">چک‌لیست کیفیت همین خدمت</legend>{inspection.items.map(item => <label key={item.id} className="flex items-start gap-3 text-sm leading-7 text-fg"><input type="checkbox" className="mt-2" disabled={busy || confirming} checked={!!checked[item.id]} onChange={e => setChecked(values => ({ ...values, [item.id]: e.target.checked }))} /><span>{item.label}</span></label>)}</fieldset>}
      <Button disabled={!ready || busy || loading} onClick={() => { setError(''); setConfirming(true); }}>{inspection.reviewId ? 'بررسی و اتصال نسخه به پروندهٔ QC' : 'بررسی و انتشار همین نسخه'}</Button>
      <ConfirmationModal open={confirming} title={inspection.reviewId ? 'اتصال مدرک نسخه به QC' : 'انتشار انسانی نسخهٔ قدیمی'} description={`${inspection.file.originalName} — ${inspection.orderCode}`} impacts={[inspection.reviewId ? 'اتصال به‌تنهایی مجوز دانلود مشتری ایجاد نمی‌کند.' : 'این نسخه برای دریافت مشتری مجاز می‌شود؛ نسخه‌های دیگر خودکار مجاز نمی‌شوند.', 'علت واقعی در Audit ثبت می‌شود؛ وضعیت سفارش و پول تغییر نمی‌کند.']} confirmLabel={inspection.reviewId ? 'ثبت اتصال؛ بدون انتشار' : 'تأیید انتشار همین نسخه'} tone="primary" noteLabel="علت و مستند بررسی همین نسخه" errorMessage={error} onCancel={() => { if (!lock.current) setConfirming(false); }} onConfirm={confirm} />
    </Card>}
  </div>;
}
