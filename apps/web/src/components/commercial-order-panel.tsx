'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, inputClass } from './ui';
import { ConfirmationModal } from './confirmation-modal';
import { WalletOrderPayment } from './wallet-actions';
import { formatDate, formatNumber, formatToman } from '@/lib/format';
import type { OrderDetail } from '@/lib/types';
import { commercialId, commercialOfferRequest, readCommercialRevision, readCommercialState, readGatewayPayment, type CommercialAccess, type CommercialPriority, type CommercialState } from './commercial-order-contract';

const priorities = { normal: 'عادی', urgent: 'فوری', same_day: 'همان‌روز' };
const errorText = (cause: unknown) => cause instanceof Error || cause instanceof ApiError ? cause.message : 'انجام عملیات ممکن نشد؛ دوباره تلاش کنید.';
type Decision = { kind: 'accept' | 'pay'; revisionId: string; fingerprint: string; amount: number; deadline: string } | { kind: 'refund' } | null;

export function CommercialOrderPanel({ order, onChanged, onAccess, returnedPaymentId }: {
  order: OrderDetail; onChanged: () => Promise<unknown>; onAccess: (access: CommercialAccess) => void; returnedPaymentId: string | null;
}) {
  const path = `/customer/orders/${encodeURIComponent(order.id)}/commercial`;
  const [current, setCurrent] = useState<CommercialState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [priority, setPriority] = useState<CommercialPriority>('normal');
  const [decision, setDecision] = useState<Decision>(null);
  const [busy, setBusy] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const lock = useRef(false), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const keys = useRef(new Map<string, string>());
  const early = ['draft', 'submitted', 'pending_triage'].includes(order.status);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const run = ++generation.current;
    try {
      const data = readCommercialState(await apiFetch<unknown>(path, { signal: abort.signal, dedupe: false, retry: 0 }));
      if (run === generation.current && !abort.signal.aborted) {
        setCurrent(data); setLoaded(true); setLoadError(''); onAccess(data ? 'managed' : 'legacy');
      }
      return data;
    } catch (cause) {
      if (run === generation.current && !abort.signal.aborted) { setLoadError(errorText(cause)); onAccess('blocked'); }
      throw cause;
    }
  }, [path, onAccess]);
  useEffect(() => {
    if (early) { onAccess('legacy'); return; }
    onAccess('checking');
    const read = () => { if (!lock.current && document.visibilityState === 'visible') void refresh().catch(() => {}); };
    read();
    const timer = window.setInterval(read, 15_000);
    window.addEventListener('focus', read); document.addEventListener('visibilitychange', read);
    return () => { controller.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', read); document.removeEventListener('visibilitychange', read); };
  }, [early, refresh, onAccess]);

  async function run(scope: string, request: unknown, action: (key: string) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setActionError(''); setNotice('');
    const operation = JSON.stringify([scope, request]);
    if (!keys.current.has(operation)) keys.current.set(operation, crypto.randomUUID());
    try { await action(keys.current.get(operation)!); keys.current.delete(operation); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function changed() { await onChanged(); await refresh(); }
  async function assertPayable(expected = current) {
    const fresh = await refresh();
    if (!expected || !fresh || fresh.id !== expected.id || fresh.fingerprint !== expected.fingerprint || !fresh.paymentAllowed || fresh.financialReviewRequired || fresh.final_price !== order.finalPrice || order.status !== 'pending_payment') throw new Error('قیمت یا مجوز پرداخت تغییر کرده است؛ آخرین وضعیت قرارداد را بررسی کنید.');
    return fresh;
  }
  async function offer() {
    let body;
    try { body = commercialOfferRequest(order, priority); }
    catch (cause) { setActionError(errorText(cause)); return; }
    await run('offer', body, async key => {
      readCommercialRevision(await apiFetch(path + '/offers', { method: 'POST', body, idempotencyKey: key, retry: 0 }));
      await changed(); setNotice('پیشنهاد دریافت شد؛ مبلغ و مهلت را پیش از پذیرش بررسی کنید. هنوز پرداخت یا رزرو قطعی انجام نشده است.');
    });
  }
  async function confirm(note: string) {
    const selected = decision;
    if (!selected) return;
    await run(selected.kind, { selected, paymentId, note }, async key => {
      if (selected.kind === 'refund') {
        if (note.trim().length < 3 || note.trim().length > 500) throw new Error('علت درخواست باید بین ۳ و ۵۰۰ نویسه باشد.');
        const data = await apiFetch<{ requested?: unknown; automaticRefund?: unknown }>(`${path}/payments/${encodeURIComponent(commercialId(paymentId))}/refund-request`, { method: 'POST', body: { reason: note.trim() }, idempotencyKey: key, retry: 0 });
        if (data.requested !== true || data.automaticRefund !== false) throw new Error('نتیجه درخواست روشن نیست؛ آخرین وضعیت را بازخوانی کنید.');
        setDecision(null); await changed(); setNotice('درخواست شما برای بررسی مالی ثبت شد؛ بازپرداخت خودکار انجام نشده است.'); return;
      }
      const fresh = await refresh();
      if (!fresh || fresh.id !== selected.revisionId || fresh.fingerprint !== selected.fingerprint || fresh.final_price !== selected.amount || fresh.invalidatedAt) throw new Error('پیشنهاد تغییر کرده است؛ این پنجره را ببندید و نسخه جدید را بررسی کنید.');
      if (selected.kind === 'accept') {
        readCommercialRevision(await apiFetch(`${path}/offers/${encodeURIComponent(fresh.id)}/accept`, { method: 'POST', body: { fingerprint: fresh.fingerprint }, idempotencyKey: key, retry: 0 }));
        setDecision(null); await changed(); setNotice('پذیرش قیمت و مهلت ثبت شد. مجوز پرداخت و رزرو از وضعیت سرور خوانده می‌شود.');
      } else {
        await assertPayable(fresh);
        const payment = readGatewayPayment(await apiFetch(`/customer/orders/${encodeURIComponent(order.id)}/pay`, { method: 'POST', idempotencyKey: key, retry: 0 }));
        if (payment.gateway !== 'mock') { window.location.assign(payment.redirectUrl!); return; }
        await apiFetch(`/customer/orders/${encodeURIComponent(order.id)}/payments/${encodeURIComponent(payment.id)}/verify`, { method: 'POST', idempotencyKey: key + '-verify', retry: 0 });
        setDecision(null); await changed(); setNotice('نتیجه پرداخت بررسی شد؛ وضعیت سفارش و رسیدگی مالی را از اطلاعات به‌روز صفحه ببینید.');
      }
    });
  }
  async function verifyReturn() {
    await run('verify-return', returnedPaymentId, async key => {
      const id = commercialId(returnedPaymentId);
      await apiFetch(`/customer/orders/${encodeURIComponent(order.id)}/payments/${encodeURIComponent(id)}/verify`, { method: 'POST', idempotencyKey: key, retry: 0 });
      await changed(); setNotice('نتیجه از سرور بررسی شد؛ پارامتر برگشت بانک به‌تنهایی نشان‌دهنده پرداخت موفق نیست.');
    });
  }
  const hasPaymentInFlight = (order.payments ?? []).some(p => ['pending', 'verifying', 'succeeded'].includes(p.status));
  const canOffer = ['triaging', 'quoted', 'pending_payment'].includes(order.status) && !current?.financialReviewRequired && (!current?.acceptedAt || (!current.paymentAllowed && !hasPaymentInFlight));
  if (early || (loaded && !current && !canOffer && !loadError)) return null;
  if (!loaded && !loadError) return <p role="status" className="text-sm text-fg-muted">در حال بررسی قرارداد قیمت و مهلت…</p>;
  const payable = !!current && current.paymentAllowed && !loadError && current.final_price === order.finalPrice && order.status === 'pending_payment';
  const open = (kind: 'accept' | 'pay') => { if (!current) return; setActionError(''); setDecision({ kind, revisionId: current.id, fingerprint: current.fingerprint, amount: current.final_price, deadline: current.proposedDeadlineAt }); };
  return <Card data-commercial-order className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-extrabold text-fg">قیمت قطعی و مهلت سفارش</h2><Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh().catch(() => {})}>بازخوانی قرارداد</Button></div>
    {loadError && <ErrorBanner message={loadError} />}
    {actionError && !decision && <ErrorBanner message={actionError} />}
    {notice && <p role="status" className="text-sm leading-7 text-success">{notice}</p>}
    {current && <>
      <p className="text-sm text-fg-muted">نسخه پیشنهاد {formatNumber(current.sequence)} · {priorities[current.priority]} · تومان</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-fg-muted">قیمت پایه</dt><dd className="mt-1 font-bold">{formatToman(current.base_price)}</dd></div><div><dt className="text-fg-muted">اضافه‌بار {formatNumber(current.surcharge_pct)}٪</dt><dd className="mt-1 font-bold">{formatToman(current.surcharge_amount)}</dd></div><div><dt className="text-fg-muted">مبلغ نهایی</dt><dd className="mt-1 font-extrabold text-accent">{formatToman(current.final_price)}</dd></div></dl>
      <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2"><div><dt className="text-fg-muted">مهلت تحویل پیشنهادی — تهران</dt><dd className="mt-1 font-bold">{formatDate(current.proposedDeadlineAt)}</dd></div><div><dt className="text-fg-muted">اعتبار پیشنهاد — تهران</dt><dd className="mt-1 font-bold">{formatDate(current.expiresAt)}</dd></div>{current.payableUntil && <div><dt className="text-fg-muted">آخرین زمان مجاز پرداخت — تهران</dt><dd className="mt-1 font-bold">{formatDate(current.payableUntil)}</dd></div>}</dl>
      <p className="text-sm leading-7 text-fg-muted">{current.durationMode === 'elapsed_minutes' ? 'مدت عادی/فوری بر مبنای دقیقهٔ سپری‌شده است، نه ساعت کاری. مهلت بالا با پذیرش دیرتر جابه‌جا نمی‌شود.' : 'همان‌روز فقط در روز کاری، پیش از ۱۴ تهران و با ظرفیت معتبر است؛ تحویل تا ۲۱ و تعهد فقط پس از پرداخت موفق در رزرو معتبر ایجاد می‌شود.'}</p>
      {current.reservation && <p role="status" className="text-sm text-fg-muted">وضعیت رزرو: {{ held: 'موقت', committed: 'تثبیت‌شده', released: 'آزادشده', expired: 'منقضی‌شده' }[current.reservation.status]} · اعتبار تا {formatDate(current.reservation.expiresAt)} تهران</p>}
      {current.invalidatedAt && <p className="text-sm text-warning">این نسخه دیگر معتبر نیست؛ پیشنهاد تازه باید جداگانه بررسی و پذیرفته شود.</p>}
      {!current.acceptedAt && !current.invalidatedAt && ['quoted', 'pending_payment'].includes(order.status) && <Button type="button" disabled={busy || !!loadError} onClick={() => open('accept')}>بررسی و پذیرش این قیمت و مهلت</Button>}
      {current.acceptedAt && !current.paymentAllowed && order.status === 'pending_payment' && !current.financialReviewRequired && <p className="text-sm leading-7 text-warning">مجوز پرداخت فعال نیست یا مهلت رزرو پایان یافته است. مبلغی پرداخت نکنید؛ وضعیت را بازخوانی یا از پشتیبانی پیگیری کنید. هیچ اولویتی خودکار جایگزین نمی‌شود.</p>}
      {payable && <Button type="button" disabled={busy} onClick={() => open('pay')}>پرداخت این قرارداد از درگاه</Button>}
      {current.acceptedAt && order.status === 'pending_payment' && !current.invalidatedAt && <WalletOrderPayment key={current.fingerprint} orderId={order.id} amount={current.final_price} milestones={order.milestones} disabled={!payable || busy} beforePay={async () => { await assertPayable(); }} onPaid={changed} />}
      {returnedPaymentId && <Button type="button" variant="secondary" disabled={busy} onClick={() => void verifyReturn()}>بررسی نتیجه پرداخت این قرارداد</Button>}
      {current.financialReviewRequired && <div className="space-y-3 rounded-control border border-warning-border bg-warning-subtle p-4"><p className="text-sm leading-7 text-warning">این پرداخت نیازمند رسیدگی مالی است؛ پرداخت دیررس به معنی رزرو یا تعهد تحویل تازه نیست و بازپرداخت خودکار ندارد.</p><Field label="پرداخت برای درخواست رسیدگی"><select className={inputClass} value={paymentId} onChange={event => setPaymentId(event.target.value)}><option value="">انتخاب پرداخت</option>{(order.payments ?? []).filter(p => p.status === 'verifying').map(p => <option key={p.id} value={p.id}>{formatToman(p.amount)} — {formatDate(p.createdAt)}</option>)}</select></Field><Button type="button" variant="secondary" disabled={busy || !paymentId} onClick={() => { setActionError(''); setDecision({ kind: 'refund' }); }}>درخواست بررسی و بازپرداخت به کیف پول</Button></div>}
    </>}
    {canOffer && <details><summary className="cursor-pointer text-sm font-bold text-accent">انتخاب اولویت و دریافت پیشنهاد قطعی</summary><div className="mt-4 space-y-3"><p className="text-sm leading-7 text-fg-muted">قیمت از سرور دریافت می‌شود؛ دریافت پیشنهاد به‌تنهایی رزرو یا پرداخت نیست. در صورت نبود ظرفیت، عادی یا فوری را فقط با انتخاب خودتان امتحان کنید. خدمت توافقی منتظر اعلام قیمت عملیات می‌ماند.</p><Field label="اولویت پیشنهادی"><select className={inputClass} value={priority} disabled={busy} onChange={event => { setPriority(event.target.value as CommercialPriority); setActionError(''); }}><option value="normal">عادی</option><option value="urgent">فوری</option><option value="same_day">همان‌روز — مشروط به ظرفیت</option></select></Field><Button type="button" disabled={busy || !!loadError} onClick={() => void offer()}>دریافت پیشنهاد قیمت و مهلت</Button></div></details>}
    {decision && decision.kind !== 'refund' && <ConfirmationModal open title={decision.kind === 'accept' ? 'پذیرش قیمت و مهلت' : 'پرداخت قرارداد سفارش'} description={`مبلغ ${formatToman(decision.amount)} · تحویل پیشنهادی ${formatDate(decision.deadline)} تهران`} impacts={decision.kind === 'accept' ? ['نسخه و مهلت دوباره در سرور کنترل می‌شوند؛ ظرفیت همان‌روز ممکن است دیگر در دسترس نباشد.', 'پذیرش به‌تنهایی پرداخت یا تضمین رزرو پرداخت‌شده نیست.'] : ['وجه وارد حساب امانی می‌شود، نه حساب مجری.', 'سرور اعتبار قرارداد، مبلغ و رزرو را دوباره بررسی می‌کند.']} confirmLabel={decision.kind === 'accept' ? 'پذیرش همین نسخه' : 'تأیید و رفتن به پرداخت'} tone="primary" showNote={false} requireNote={false} errorMessage={actionError || loadError} onCancel={() => setDecision(null)} onConfirm={confirm} />}
    {decision?.kind === 'refund' && <ConfirmationModal open title="درخواست رسیدگی مالی" description="درخواست بررسی و بازپرداخت این پرداخت به کیف پول خودتان؛ تصمیم و اجرای مالی جداگانه انجام می‌شود." impacts={['این فرمان به‌تنهایی وجهی جابه‌جا نمی‌کند.', 'بدون تصمیم مالی، تعهد تحویل تازه یا بازپرداخت خودکار ایجاد نمی‌شود.']} confirmLabel="ثبت درخواست رسیدگی" noteLabel="علت درخواست" tone="primary" errorMessage={actionError || loadError} onCancel={() => setDecision(null)} onConfirm={confirm} />}
  </Card>;
}
