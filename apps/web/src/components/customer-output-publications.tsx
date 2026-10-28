'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from './ui';
import { SecureFileLink } from './secure-file';
import type { OrderFile } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/format';
import { outputId, readCustomerPublications, type CustomerPublication } from './output-publication-contract';

type PublicationState = { orderId: string; files: CustomerPublication[] | null; error: string; refresh: () => void };
const PublicationContext = createContext<PublicationState | null>(null);
export function CustomerOutputPublications({ orderId, enabled = true, children }: { orderId: string; enabled?: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ orderId: string; files: CustomerPublication[] | null; error: string }>({ orderId, files: null, error: '' });
  const request = useRef<AbortController | null>(null);
  const read = useCallback(() => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    apiFetch<unknown>(`/customer/orders/${encodeURIComponent(outputId(orderId))}/output-publications`, { signal: controller.signal, dedupe: false, retry: 0 })
      .then(readCustomerPublications)
      .then(files => { if (!controller.signal.aborted) setState({ orderId, files, error: '' }); })
      .catch(cause => { if (!controller.signal.aborted) setState({ orderId, files: null, error: cause instanceof Error ? cause.message : 'دریافت وضعیت انتشار ممکن نشد.' }); });
  }, [orderId]);
  const refresh = useCallback(() => { if (enabled) { setState({ orderId, files: null, error: '' }); read(); } }, [enabled, orderId, read]);
  useEffect(() => {
    if (!enabled) return;
    read();
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { request.current?.abort(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [read, refresh, enabled]);
  const current = !enabled ? { orderId, files: [], error: '' } : state.orderId === orderId ? state : { orderId, files: null, error: '' };
  return <PublicationContext.Provider value={{ ...current, refresh }}>{children}</PublicationContext.Provider>;
}
export function CustomerOutputFileLink({ file, label }: { file: OrderFile; label?: string }) {
  const state = useContext(PublicationContext);
  if (!['output', 'revision'].includes(file.fileKind)) return <SecureFileLink file={file} label={label} />;
  const proof = state?.orderId === file.orderId ? state.files?.find(item => item.id === file.id) : null;
  const released = proof?.availability === 'released' && file.scanStatus === 'clean';
  return <div data-output-publication={file.id} className="min-w-0 space-y-1">
    {released ? <SecureFileLink file={file} label={label} /> : <p className="break-words text-sm font-bold text-fg">{label ?? file.originalName} <span className="font-normal text-fg-muted">({formatFileSize(file.sizeBytes)})</span></p>}
    <p className="text-xs leading-6 text-fg-muted">{state?.error ? 'وضعیت انتشار قابل دریافت نیست؛ دریافت فایل تا بررسی مجدد در دسترس نیست.' : !state?.files ? 'در حال بررسی مجوز انتشار همین نسخه…' : released ? `این نسخه پس از کنترل کیفیت منتشر شده است · ${formatDate(proof.approvedAt!)}` : proof?.availability === 'manual_review_required' ? 'نسخهٔ قدیمی نیازمند بررسی انسانی است؛ فایل حذف نشده و به‌صورت خودکار تأیید نمی‌شود.' : proof?.availability === 'awaiting_qc' ? 'این نسخه در انتظار کنترل کیفیت است؛ تأیید فایل دیگر شامل آن نمی‌شود.' : 'این نسخه برای دریافت در دسترس نیست؛ از پشتیبانی پیگیری کنید.'}</p>
    {!released && state && <Button type="button" variant="ghost" onClick={state.refresh}>بازخوانی وضعیت این نسخه</Button>}
  </div>;
}
