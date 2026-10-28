export type CommercialPriority = 'normal' | 'urgent' | 'same_day';
export type CommercialAccess = 'checking' | 'legacy' | 'managed' | 'blocked';
export interface CommercialRevision {
  id: string; sequence: number; fingerprint: string; priority: CommercialPriority;
  currency: 'IRT'; base_price: number; surcharge_pct: number; surcharge_amount: number; final_price: number;
  issuedAt: string; expiresAt: string; proposedDeadlineAt: string;
  deadlineNormal: string | null; durationMode: 'elapsed_minutes' | 'tehran_same_day_cutoff';
  acceptedAt: string | null; deadlineAt: string | null; payableUntil: string | null; invalidatedAt: string | null;
}
export interface CommercialState extends CommercialRevision {
  paymentAllowed: boolean; financialReviewRequired: boolean;
  reservation: { status: 'held' | 'committed' | 'released' | 'expired'; expiresAt: string } | null;
}
const invalid = () => { throw new Error('اطلاعات قرارداد قیمت معتبر نیست؛ صفحه را بازخوانی کنید.'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (!Object.hasOwn(descriptor, 'value')) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = 2_000_000_000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
function date(value: unknown, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
export function commercialId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return invalid();
  return value;
}
export function readCommercialRevision(value: unknown): CommercialRevision {
  const raw = record(value), priority = raw.priority;
  if (priority !== 'normal' && priority !== 'urgent' && priority !== 'same_day') return invalid();
  if (raw.currency !== 'IRT' || typeof raw.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(raw.fingerprint)) return invalid();
  const base = integer(raw.base_price), rate = priority === 'normal' ? 0 : priority === 'urgent' ? 30 : 80;
  const extra = Number(BigInt(base) * BigInt(rate) / BigInt(100));
  if (raw.surcharge_pct !== rate || integer(raw.surcharge_amount) !== extra || integer(raw.final_price, 1) !== base + extra) return invalid();
  const issuedAt = date(raw.issuedAt)!, expiresAt = date(raw.expiresAt)!, proposedDeadlineAt = date(raw.proposedDeadlineAt)!;
  const acceptedAt = date(raw.acceptedAt, true), deadlineAt = date(raw.deadlineAt, true), payableUntil = date(raw.payableUntil, true), invalidatedAt = date(raw.invalidatedAt, true);
  if (expiresAt <= issuedAt || proposedDeadlineAt <= issuedAt || expiresAt > proposedDeadlineAt) return invalid();
  if (!!acceptedAt !== !!deadlineAt || !!acceptedAt !== !!payableUntil) return invalid();
  if (acceptedAt && (acceptedAt < issuedAt || acceptedAt >= expiresAt || deadlineAt !== proposedDeadlineAt || payableUntil! <= acceptedAt || payableUntil! > expiresAt)) return invalid();
  const durationMode = priority === 'same_day' ? 'tehran_same_day_cutoff' : 'elapsed_minutes';
  if (raw.durationMode !== durationMode) return invalid();
  return { id: commercialId(raw.id), sequence: integer(raw.sequence, 1), fingerprint: raw.fingerprint, priority, currency: 'IRT', base_price: base, surcharge_pct: rate, surcharge_amount: extra, final_price: base + extra, issuedAt, expiresAt, proposedDeadlineAt, acceptedAt, deadlineAt, payableUntil, invalidatedAt, durationMode, deadlineNormal: date(raw.deadlineNormal, true) };
}
export function readCommercialState(value: unknown): CommercialState | null {
  if (value === null) return null;
  const raw = record(value), revision = readCommercialRevision(raw);
  if (typeof raw.paymentAllowed !== 'boolean' || typeof raw.financialReviewRequired !== 'boolean') return invalid();
  let reservation: CommercialState['reservation'] = null;
  if (raw.reservation !== null) {
    const hold = record(raw.reservation);
    if (!['held', 'committed', 'released', 'expired'].includes(String(hold.status))) return invalid();
    reservation = { status: hold.status as NonNullable<CommercialState['reservation']>['status'], expiresAt: date(hold.expiresAt)! };
  }
  if (raw.paymentAllowed && (!revision.acceptedAt || revision.invalidatedAt || raw.financialReviewRequired || (revision.priority === 'same_day' && reservation?.status !== 'held'))) return invalid();
  if (revision.priority !== 'same_day' && reservation) return invalid();
  if (reservation && (!revision.acceptedAt || reservation.expiresAt !== revision.payableUntil)) return invalid();
  return { ...revision, paymentAllowed: raw.paymentAllowed, financialReviewRequired: raw.financialReviewRequired, reservation };
}
export function commercialOfferRequest(order: unknown, priority: CommercialPriority) {
  if (!['normal', 'urgent', 'same_day'].includes(priority)) return invalid();
  const raw = record(order), service = record(raw.serviceLine);
  if (service.pricingModel === 'manual_quote') throw new Error('قیمت توافقی باید ابتدا توسط تیم عملیات اعلام شود.');
  if (service.pricingModel === 'fixed') return { priority };
  if (service.pricingModel !== 'formula') throw new Error('مدل قیمت این خدمت مشخص نیست؛ از پشتیبانی پیگیری کنید.');
  const snapshot = record(raw.formResponses), inputs: Record<string, number> = Object.create(null);
  if (!Array.isArray(snapshot.fields) || snapshot.fields.length > 100) return invalid();
  for (const value of snapshot.fields) {
    const field = record(value);
    if (field.type !== 'number' || field.answer === null) continue;
    if (typeof field.key !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(field.key) || Object.hasOwn(Object.prototype, field.key) || field.key === 'prototype' || Object.hasOwn(inputs, field.key)) return invalid();
    inputs[field.key] = integer(field.answer, 0, 1_000_000);
  }
  if (Object.keys(inputs).length > 32) return invalid();
  return { priority, inputs };
}
export function readGatewayPayment(value: unknown) {
  const raw = record(value), payment = record(raw.payment), id = commercialId(payment.id);
  if (payment.gateway === 'mock') return { id, gateway: 'mock' as const, redirectUrl: null };
  if (payment.gateway !== 'zarinpal' || typeof raw.redirectUrl !== 'string') throw new Error('درگاه پرداخت شناخته‌شده نیست.');
  const url = new URL(raw.redirectUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'www.zarinpal.com' || url.port || url.username || url.password || !/^\/pg\/StartPay\/[A-Za-z0-9-]+\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('نشانی درگاه معتبر نیست.');
  return { id, gateway: 'zarinpal' as const, redirectUrl: url.href };
}
