"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, invalidateApiCache } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, inputClass } from '@/components/ui';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { formatDate, formatToman } from '@/lib/format';
import { parseWalletAmount } from './wallet-contract';

type FundingIntent = { id: string; amount: number; status: string; createdAt: string };
const labels: Record<string, string> = { pending: 'در انتظار', verifying: 'آماده تأیید آزمایشی', succeeded: 'شارژ ثبت‌شده', failed: 'ناموفق', refunded: 'بازپرداخت‌شده' };
const errorText = (error: unknown) => error instanceof ApiError || error instanceof Error ? error.message : 'انجام عملیات ممکن نشد؛ دوباره تلاش کنید.';

export function WalletFundingPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [intents, setIntents] = useState<FundingIntent[] | null>(null);
  const [amount, setAmount] = useState('۱۰۰۰۰۰');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<FundingIntent | null>(null);
  const getKey = (operation: string) => { if (!keys.current.has(operation)) keys.current.set(operation, crypto.randomUUID()); return keys.current.get(operation)!; };
  const load = useCallback(async () => { setIntents(await apiFetch<FundingIntent[]>('/customer/wallet/top-ups', { dedupe: false })); }, []);
  useEffect(() => { let active = true; apiFetch<FundingIntent[]>('/customer/wallet/top-ups').then(value => { if (active) setIntents(value); }).catch(cause => { if (active) setError(cause instanceof ApiError && cause.status === 503 ? 'شارژ کیف پول هنوز در این محیط فعال نشده است؛ سایر خدمات مالی برقرارند.' : errorText(cause)); }); return () => { active = false; }; }, []);

  async function initiate() {
    const parsed = parseWalletAmount(amount);
    if (lock.current || parsed === null) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await apiFetch('/customer/wallet/top-ups', { method: 'POST', body: { amount: parsed }, idempotencyKey: getKey(`initiate:${parsed}`) });
      keys.current.delete(`initiate:${parsed}`);
      setNotice('درخواست ساخته شد؛ برای افزودن اعتبار آزمایشی، درخواست را بررسی و تأیید کنید.');
      await load();
    } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function verify() {
    if (!selected || lock.current) return;
    lock.current = true; setError('');
    try {
      await apiFetch(`/customer/wallet/top-ups/${encodeURIComponent(selected.id)}/verify`, { method: 'POST', idempotencyKey: getKey(`verify:${selected.id}`) });
      setSelected(null); setNotice('اعتبار آزمایشی با موفقیت در دفتر مالی ثبت شد. پول واقعی جابه‌جا نشده است.');
      invalidateApiCache('/customer/');
      try { await Promise.all([load(), onChanged()]); } catch { setError('شارژ ثبت شد؛ برای نمایش آخرین موجودی، صفحه را بازخوانی کنید.'); }
    } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; }
  }
  return <Card data-testid="zeus-wallet-funding">
    <h2 className="text-lg font-extrabold text-fg">شارژ آزمایشی کیف پول</h2>
    <p className="mt-2 text-sm leading-7 text-fg-muted">این محیط توسعه است؛ شارژ فقط اعتبار آزمایشی می‌سازد و هیچ برداشت بانکی یا انتقال پول واقعی انجام نمی‌دهد.</p>
    {error && !selected && <div className="mt-3"><ErrorBanner message={error} /></div>}
    {notice && <p role="status" className="mt-3 text-sm leading-7 text-success">{notice}</p>}
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void initiate(); }}>
      <Field label="مبلغ شارژ به تومان"><input className={inputClass} inputMode="numeric" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="wallet-amount-help" disabled={busy || !!selected} /></Field>
      <Button type="submit" disabled={busy || !!selected || intents === null || parseWalletAmount(amount) === null}>{busy ? 'در حال ساخت درخواست…' : 'ایجاد درخواست شارژ آزمایشی'}</Button>
    </form>
    <p id="wallet-amount-help" className="mt-2 text-xs text-fg-subtle">عدد صحیح از ۱ تا ۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان؛ ارقام فارسی و انگلیسی پذیرفته می‌شوند.</p>
    <Button type="button" variant="ghost" disabled={busy || !!selected} onClick={() => { setError(''); void load().catch(cause => setError(errorText(cause))); }}>بازخوانی درخواست‌های شارژ</Button>
    {intents && <div className="mt-5 space-y-3" aria-label="درخواست‌های شارژ کیف پول">{intents.length === 0 ? <p className="text-sm text-fg-muted">درخواست شارژی ثبت نشده است.</p> : intents.map(intent => <div key={intent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3"><div><p className="font-bold text-fg">{formatToman(intent.amount)}</p><p className="mt-1 text-xs text-fg-muted">{labels[intent.status] ?? intent.status} · {formatDate(intent.createdAt)}</p></div>{intent.status === 'verifying' && <Button variant="secondary" disabled={busy} onClick={() => { setError(''); setSelected(intent); }}>بررسی و تأیید شارژ</Button>}</div>)}</div>}
    <ConfirmationModal open={!!selected} title="تأیید شارژ آزمایشی" description={`افزودن ${formatToman(selected?.amount ?? 0)} اعتبار آزمایشی به کیف پول؟ مبلغ و وضعیت دوباره در سرور کنترل می‌شوند.`} impacts={['پول واقعی جابه‌جا نمی‌شود.', 'این اعتبار در دیتابیس محلی و دفتر مالی ثبت می‌شود.']} confirmLabel="ثبت اعتبار آزمایشی" tone="primary" showNote={false} requireNote={false} errorMessage={error} onCancel={() => { if (!lock.current) setSelected(null); }} onConfirm={verify} />
  </Card>;
}

type Milestone = { id: string; title: string; amount?: number; paymentStatus?: string };
export function WalletOrderPayment({ orderId, amount, milestones = [], onPaid, beforePay, disabled = false }: { orderId: string; amount?: number | null; milestones?: Milestone[]; onPaid: () => Promise<unknown>; beforePay?: () => Promise<void>; disabled?: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const keys = useRef(new Map<string, string>());
  const readBalance = useCallback(async () => {
    await apiFetch('/customer/wallet/top-ups'); // Requires enabled mock-only wallet.
    return (await apiFetch<{ balance: number }>('/customer/wallet', { dedupe: false })).balance;
  }, []);
  useEffect(() => { let active = true; readBalance().then(value => { if (active) setBalance(value); }).catch(() => { if (active) setBalance(null); }); return () => { active = false; }; }, [readBalance]);
  const unknownMilestone = milestones.some(m => !m.paymentStatus || !Number.isSafeInteger(m.amount) || (m.amount ?? 0) <= 0);
  const unpaid = milestones.filter(m => m.paymentStatus && m.paymentStatus !== 'succeeded');
  const milestone = unpaid.find(m => m.id === selectedId) ?? unpaid[0];
  const payable = milestones.length ? milestone?.amount : amount;
  async function pay() {
    setError('');
    const operation = milestone?.id ?? 'full';
    if (!keys.current.has(operation)) keys.current.set(operation, crypto.randomUUID());
    try {
      await beforePay?.();
      await apiFetch(`/customer/orders/${encodeURIComponent(orderId)}/pay-from-wallet`, { method: 'POST', body: milestone ? { milestoneId: milestone.id } : {}, idempotencyKey: keys.current.get(operation) });
      setOpen(false); setNotice('پرداخت از کیف پول ثبت و وجه وارد حساب امانی شد.'); invalidateApiCache('/customer/');
      try { await Promise.all([onPaid(), readBalance().then(setBalance)]); } catch { setError('پرداخت ثبت شد؛ برای آخرین وضعیت، صفحه را بازخوانی کنید.'); }
    } catch (cause) { setError(errorText(cause)); }
  }
  return <div data-testid="zeus-wallet-order-payment" className="w-full rounded-control border border-border bg-surface p-4">
    <h3 className="font-bold text-fg">پرداخت از کیف پول</h3>
    <p className="mt-2 text-sm text-fg-muted">{balance === null ? 'دریافت موجودی یا فعال‌بودن کیف پول ممکن نشد؛ مسیر پرداخت قبلی همچنان در دسترس است.' : `موجودی: ${formatToman(balance)}`}</p>
    <Button type="button" variant="ghost" disabled={open} onClick={() => { setError(''); void readBalance().then(setBalance).catch(cause => setError(errorText(cause))); }}>بازخوانی موجودی</Button>
    {milestones.length > 0 && <Field label="مرحله پرداخت از کیف پول"><select className={inputClass} value={milestone?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>{unpaid.map(m => <option key={m.id} value={m.id}>{m.title} — {formatToman(m.amount)}</option>)}</select></Field>}
    {balance !== null && !!payable && balance < payable && <p className="mt-2 text-sm text-warning">موجودی کافی نیست؛ از صفحهٔ امور مالی کیف پول را شارژ کنید.</p>}
    {unknownMilestone && <p className="mt-2 text-sm text-warning">اطلاعات مراحل پرداخت کامل نیست؛ صفحه را بازخوانی کنید.</p>}
    {notice && <p role="status" className="mt-2 text-sm text-success">{notice}</p>}
    {error && !open && <div className="mt-2"><ErrorBanner message={error} /></div>}
    <Button className="mt-3" variant="secondary" disabled={disabled || unknownMilestone || balance === null || !payable || payable <= 0 || balance < payable} onClick={() => { setError(''); setOpen(true); }}>پرداخت {formatToman(payable ?? 0)} از موجودی</Button>
    <ConfirmationModal open={open} title="تأیید پرداخت از کیف پول" description={`مبلغ ${formatToman(payable ?? 0)} از موجودی کسر و به حساب امانی این سفارش منتقل می‌شود؛ هنوز به مجری آزاد نمی‌شود.`} confirmLabel="تأیید و پرداخت از موجودی" tone="primary" showNote={false} requireNote={false} errorMessage={error} onCancel={() => setOpen(false)} onConfirm={pay} />
  </div>;
}
