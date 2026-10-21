'use client';
import { useEffect, useState } from 'react';
import { RequireRole } from '@/components/require-role';
import { Badge, Button, Card, ErrorBanner, Field, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import { ConfirmationModal } from '@/components/confirmation-modal';
import type { OrganizationPlan } from '@/components/organization-workspace';
import { apiFetch } from '@/lib/api';
import { formatDate, formatNumber, formatToman } from '@/lib/format';

type Subscription = { planName: string; active: boolean; endsAt: string; version: number; feeToman: number; contractReference: string };
type Organization = { id: string; name: string; requestedPlan: OrganizationPlan | null; subscription: Subscription | null; _count: { members: number; orders: number } };
type Pending = { path: string; body: Record<string, unknown>; method: 'POST' | 'PATCH'; title: string; description: string; note: boolean };
function load(page: number, signal?: AbortSignal) {
  return Promise.all([apiFetch<{ items: Organization[]; total: number }>(`/admin/organizations?page=${page}`, { signal, dedupe: false }), apiFetch<OrganizationPlan[]>('/admin/organizations/plans', { signal, dedupe: false })]);
}
export default function Page() { return <RequireRole roles={['admin']} adminScopes={['finance_admin']}><FinanceOrganizations /></RequireRole>; }
function FinanceOrganizations() {
  const [data, setData] = useState<Awaited<ReturnType<typeof load>> | null>(null);
  const [page, setPage] = useState(1); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState(''); const [seats, setSeats] = useState(''); const [orders, setOrders] = useState(''); const [fee, setFee] = useState(''); const [days, setDays] = useState('');
  useEffect(() => { const controller = new AbortController(); load(page, controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت اطلاعات ناموفق بود.'); }); return () => controller.abort(); }, [page]);
  async function confirm(note: string) {
    if (!pending) return;
    setBusy(true); setError(''); setMessage('');
    try { await apiFetch(pending.path, { method: pending.method, body: { ...pending.body, ...(pending.note ? { note } : {}) } }); setData(await load(page)); setMessage('تصمیم مالی ثبت شد.'); setPending(null); }
    catch(e) { setError(e instanceof Error ? e.message : 'ثبت تغییر ناموفق بود.'); setPending(null); }
    finally { setBusy(false); }
  }
  if (!data) return <>{error ? <ErrorBanner message={error} /> : <PageLoading />}</>;
  const [organizations, plans] = data;
  return <div className="space-y-5"><SectionTitle subtitle="قرارداد، سهمیه و دسترسی سازمانی با تأیید انسانی">سازمان‌ها و اشتراک‌ها</SectionTitle>
    {error && <ErrorBanner message={error} />}{message && <p role="status" className="text-sm text-success">{message}</p>}
    <Card><h2 className="font-bold">روال فعال‌سازی</h2><p className="mt-3 text-sm leading-8 text-fg-muted">ابتدا قرارداد و وضعیت پرداخت را خارج از این فرم بررسی کنید. این بخش فقط دسترسی و سهمیه را فعال می‌کند و هیچ برداشت وجه، فاکتور یا تمدید خودکاری ایجاد نمی‌کند. مبلغ و سهمیه هر اشتراک هنگام فعال‌سازی ثابت می‌ماند؛ تغییر پلن‌های بعدی روی قرارداد جاری اثر ندارد.</p></Card>
    <Card><h2 className="mb-4 font-bold">تعریف پلن جدید</h2><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); setPending({ path: '/admin/organizations/plans', method: 'POST', body: { name: name.trim(), seats: Number(seats), ordersPerPeriod: Number(orders), feeToman: Number(fee), durationDays: Number(days) }, note: false, title: 'ثبت پلن سازمانی', description: `${name} با هزینه ${formatToman(Number(fee))}، ${formatNumber(Number(seats))} عضو، ${formatNumber(Number(orders))} سفارش و مدت ${formatNumber(Number(days))} روز منتشر می‌شود. مقادیر پلن بعد از ثبت قابل ویرایش نیست؛ می‌توانید عرضه آن را متوقف کنید.` }); }}>
      <Field label="نام پلن"><input required minLength={2} maxLength={100} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
      <NumberField label="حداکثر اعضا" value={seats} set={setSeats} min={1} max={10000} />
      <NumberField label="سفارش در هر دوره" value={orders} set={setOrders} min={1} max={1000000} />
      <NumberField label="هزینه قرارداد (تومان)" value={fee} set={setFee} min={0} max={2000000000} />
      <NumberField label="مدت دوره (روز)" value={days} set={setDays} min={1} max={366} />
      <div className="flex items-end"><Button disabled={busy}>بررسی و ثبت پلن</Button></div>
    </form></Card>
    <Card><h2 className="mb-4 font-bold">فهرست پلن‌ها</h2>{!plans.length && <p className="text-sm text-fg-muted">هنوز پلنی تعریف نشده است.</p>}<div className="grid gap-3 lg:grid-cols-2">{plans.map(plan => <div key={plan.id} className="rounded-control border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{plan.name}</h3><Badge color={plan.active ? 'green' : 'gray'}>{plan.active ? 'قابل درخواست' : 'عرضه متوقف'}</Badge></div><p className="my-3 text-sm leading-7 text-fg-muted">{formatToman(plan.feeToman)} · {formatNumber(plan.seats)} عضو · {formatNumber(plan.ordersPerPeriod)} سفارش · {formatNumber(plan.durationDays)} روز</p><Button variant="secondary" disabled={busy} onClick={() => setPending({ path: `/admin/organizations/plans/${plan.id}`, method: 'PATCH', body: { active: !plan.active }, note: false, title: plan.active ? 'توقف عرضه پلن' : 'ازسرگیری عرضه پلن', description: 'این تصمیم فقط امکان درخواست و فعال‌سازی جدید را تغییر می‌دهد و اشتراک‌های جاری را لغو نمی‌کند.' })}>{plan.active ? 'توقف عرضه' : 'ازسرگیری عرضه'}</Button></div>)}</div></Card>
    <div className="space-y-4"><h2 className="text-lg font-bold">سازمان‌ها و درخواست‌های قرارداد</h2>{!organizations.items.length && <Card>هنوز سازمانی ایجاد نشده است.</Card>}{organizations.items.map(org => <OrganizationCard key={org.id + ':' + (org.subscription?.version ?? 0)} org={org} plans={plans} busy={busy} request={setPending} />)}</div>
    <div className="flex items-center gap-3"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button><span className="text-sm">صفحه {formatNumber(page)}</span><Button variant="secondary" disabled={busy || page * 20 >= organizations.total} onClick={() => setPage(page + 1)}>بعدی</Button></div>
    <ConfirmationModal key={pending?.path ?? 'closed'} open={!!pending} title={pending?.title ?? ''} description={pending?.description ?? ''} impacts={['تصمیم در سابقه حسابرسی ثبت می‌شود.', 'هیچ تراکنش مالی خودکاری انجام نمی‌شود.']} requireNote={pending?.note ?? false} confirmLabel="تأیید و ثبت" onCancel={() => setPending(null)} onConfirm={confirm} />
  </div>;
}
function NumberField({ label, value, set, min, max }: { label: string; value: string; set: (v: string) => void; min: number; max: number }) {
  return <Field label={label}><input type="number" inputMode="numeric" required min={min} max={max} step={1} className={inputClass} value={value} onChange={e => set(e.target.value)} /></Field>;
}
function OrganizationCard({ org, plans, busy, request }: { org: Organization; plans: OrganizationPlan[]; busy: boolean; request: (pending: Pending) => void }) {
  const [planId, setPlanId] = useState(org.requestedPlan?.id ?? ''); const [reference, setReference] = useState('');
  const active = org.subscription?.active ?? false;
  return <Card><div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-bold">{org.name}</h3><Badge color={active ? 'green' : 'yellow'}>{active ? 'اشتراک فعال' : 'بدون اشتراک فعال'}</Badge></div>
    <p className="my-3 text-sm text-fg-muted">{formatNumber(org._count.members)} سابقه عضویت · {formatNumber(org._count.orders)} سفارش متصل</p>
    {org.requestedPlan && <p className="mb-3 text-sm font-bold">درخواست مشتری: {org.requestedPlan.name}</p>}
    {org.subscription && <div className="mb-4 space-y-2 text-sm text-fg-muted"><p>{org.subscription.planName} · {formatToman(org.subscription.feeToman)} · تا {formatDate(org.subscription.endsAt)}</p><p>مرجع قرارداد: <bdi>{org.subscription.contractReference}</bdi></p></div>}
    <form className="grid items-end gap-3 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); const plan = plans.find(p => p.id === planId); if (plan) request({ path: `/admin/organizations/${org.id}/subscription`, method: 'POST', body: { planId, version: org.subscription?.version ?? 0, contractReference: reference.trim() }, note: true, title: 'فعال‌سازی قرارداد سازمان', description: `برای «${org.name}»، پلن ${plan.name} با ${formatNumber(plan.seats)} عضو و ${formatNumber(plan.ordersPerPeriod)} سفارش، از اکنون به مدت ${formatNumber(plan.durationDays)} روز فعال می‌شود. هزینه قراردادی: ${formatToman(plan.feeToman)}. مرجع: ${reference}. دریافت وجه باید جداگانه بررسی شده باشد.` }); }}>
      <Field label={`پلن قرارداد ${org.name}`}><select required className={inputClass} value={planId} onChange={e => setPlanId(e.target.value)}><option value="">انتخاب پلن</option>{plans.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label={`مرجع قرارداد ${org.name}`}><input dir="ltr" required minLength={3} maxLength={120} pattern="[a-zA-Z0-9_\/\-]+" placeholder="CONTRACT-2026-001" className={inputClass} value={reference} onChange={e => setReference(e.target.value)} /></Field>
      <Button disabled={busy || active || !planId}>بررسی و فعال‌سازی</Button>
    </form>
    {active && <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="danger" disabled={busy} onClick={() => request({ path: `/admin/organizations/${org.id}/subscription/cancel`, method: 'POST', body: { version: org.subscription!.version }, note: true, title: 'لغو اشتراک سازمان', description: 'افزودن اعضا، تیم و سفارش جدید متوقف می‌شود؛ سوابق باقی می‌ماند. لغو اشتراک به معنی بازپرداخت وجه نیست و بازپرداخت احتمالی باید جداگانه بررسی شود.' })}>بررسی لغو اشتراک</Button><p className="text-xs text-fg-muted">اشتراک فعال را نمی‌توان با قرارداد جدید بازنویسی کرد.</p></div>}
  </Card>;
}
