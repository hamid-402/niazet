'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, downloadAuthenticated } from '@/lib/api';
import { ResponsiveTable, Button, Card, ErrorBanner, Field, PageLoading, SectionTitle, inputClass } from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/format';

interface OperationsReport {
  period: { fromUtc: string; toExclusiveUtc: string; timeZone: string; days: number };
  orders: { total: number; byStatus: Record<string, number> };
  funnel: Record<string, number>;
  serviceSales: Array<{ serviceId: string; title: string; orders: number; paid: number; closed: number; paidRate: number }>;
  quality: { reviews: number; passed: number; needsRework: number; rejected: number; passRate: number; firstPassRate: number };
  sla: { tickets: number; breachedTickets: number; breachRate: number };
  satisfaction: { responses: number; averageRating: number; averagePercent: number; complaints: number; compliments: number };
  delivery: { samples: number; averageHours: number; medianHours: number };
  teams: Array<{ teamId: string; name: string; members: number; activeOrders: number; averageCapacity: number; onTimeRate: number; qcPassRate: number; customerRating: number }>;
  staff: Array<{ profileId: string; displayAlias: string; publicHandlerCode: string; team: { id: string; name: string } | null; status: string; capacityPercent: number; activeOrders: number; onTimeRate: number; qcPassRate: number; customerRating: number; complaintCount: number; complimentCount: number; openRiskAlerts: number }>;
}

const nf = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
const pct = (value: number) => formatPercent(value);
const metric = (label: string, value: string | number) => (
  <Card key={label}><p className="text-xs text-fg-muted">{label}</p><p className="mt-1 text-xl font-bold text-fg">{typeof value === 'number' ? nf(value) : value}</p></Card>
);

export default function OperationsReportPage() {
  const [data, setData] = useState<OperationsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    try { setData(await apiFetch<OperationsReport>(`/admin/reports/operations?${query}`, { dedupe: false })); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت گزارش ممکن نشد.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => {
    let active = true;
    apiFetch<OperationsReport>('/admin/reports/operations')
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'دریافت گزارش ممکن نشد.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function exportCsv() {
    setExporting(true); setError('');
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    try { await downloadAuthenticated(`/admin/reports/operations/export?${query}`, `niazat-operations-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت خروجی ممکن نشد.'); }
    finally { setExporting(false); }
  }

  return <div>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><SectionTitle subtitle="آمار غیرمالی سفارش، کیفیت، SLA و عملکرد کارکنان؛ پیش‌فرض ۳۰ روز اخیر">گزارش یکپارچه عملیات</SectionTitle><Button variant="secondary" disabled={exporting || loading} onClick={() => void exportCsv()}>{exporting ? 'در حال تهیه...' : 'خروجی کنترل‌شده CSV'}</Button></div>
    <Card className="mb-4"><div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
      <Field label="از تاریخ"><input aria-label="از تاریخ گزارش عملیات" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="تا تاریخ"><input aria-label="تا تاریخ گزارش عملیات" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Button onClick={() => void load()} disabled={loading}>به‌روزرسانی گزارش</Button>
    </div></Card>
    {error && <ErrorBanner message={error} />}
    {loading && !data ? <PageLoading /> : data && <>
      <p className="mb-3 text-xs text-fg-muted">بازه {formatNumber(data.period.days)} روزه · منطقه زمانی <bdi dir="ltr">{data.period.timeZone}</bdi></p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metric('کل سفارش‌ها', data.orders.total)}{metric('تبدیل ثبت به پرداخت', pct(data.funnel.submittedToPaidRate))}{metric('تبدیل پرداخت به بستن', pct(data.funnel.paidToClosedRate))}{metric('میانه زمان تحویل', `${nf(data.delivery.medianHours)} ساعت`)}
        {metric('نرخ قبولی QC', pct(data.quality.passRate))}{metric('قبولی بار اول QC', pct(data.quality.firstPassRate))}{metric('نرخ نقض SLA', pct(data.sla.breachRate))}{metric('رضایت متوسط', pct(data.satisfaction.averagePercent))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><h3 className="mb-3 font-bold text-fg">قیف سفارش</h3><div className="grid grid-cols-3 gap-2 text-sm">{[['ایجاد',data.funnel.created],['ارسال',data.funnel.submitted],['قیمت‌گذاری',data.funnel.quoted],['پرداخت',data.funnel.paid],['ارجاع',data.funnel.assigned],['بسته‌شده',data.funnel.closed]].map(([label,value]) => <div key={label} className="rounded-control bg-bg-subtle p-3"><p className="text-fg-muted">{label}</p><b>{nf(value as number)}</b></div>)}</div></Card>
        <Card><h3 className="mb-3 font-bold text-fg">کیفیت، SLA و رضایت</h3><div className="grid grid-cols-2 gap-2 text-sm"><p>بازبینی QC: <b>{nf(data.quality.reviews)}</b></p><p>نیازمند اصلاح: <b>{nf(data.quality.needsRework)}</b></p><p>تیکت‌ها: <b>{nf(data.sla.tickets)}</b></p><p>نقض SLA: <b>{nf(data.sla.breachedTickets)}</b></p><p>امتیاز متوسط: <b>{nf(data.satisfaction.averageRating)}</b></p><p>شکایت / تشکر: <b>{nf(data.satisfaction.complaints)} / {nf(data.satisfaction.compliments)}</b></p><p>میانگین تحویل: <b>{nf(data.delivery.averageHours)} ساعت</b></p><p>نمونه تحویل: <b>{nf(data.delivery.samples)}</b></p></div></Card>
        <Card className="overflow-x-auto"><h3 className="mb-3 font-bold text-fg">فروش خدمات (تعداد)</h3><ResponsiveTable className="w-full min-w-[500px] text-sm"><thead><tr className="text-right text-fg-muted"><th className="pb-2">خدمت</th><th>سفارش</th><th>پرداخت</th><th>بسته</th><th>نرخ پرداخت</th></tr></thead><tbody>{data.serviceSales.map((item) => <tr key={item.serviceId} className="border-t border-border"><td className="py-2">{item.title}</td><td>{nf(item.orders)}</td><td>{nf(item.paid)}</td><td>{nf(item.closed)}</td><td>{pct(item.paidRate)}</td></tr>)}</tbody></ResponsiveTable></Card>
        <Card className="overflow-x-auto"><h3 className="mb-3 font-bold text-fg">تیم‌ها</h3><ResponsiveTable className="w-full min-w-[560px] text-sm"><thead><tr className="text-right text-fg-muted"><th className="pb-2">تیم</th><th>عضو</th><th>کار فعال</th><th>ظرفیت</th><th>تحویل به‌موقع</th><th>QC</th></tr></thead><tbody>{data.teams.map((item) => <tr key={item.teamId} className="border-t border-border"><td className="py-2">{item.name}</td><td>{nf(item.members)}</td><td>{nf(item.activeOrders)}</td><td>{pct(item.averageCapacity)}</td><td>{pct(item.onTimeRate)}</td><td>{pct(item.qcPassRate)}</td></tr>)}</tbody></ResponsiveTable></Card>
      </div>
      <Card className="mt-4 overflow-x-auto"><h3 className="mb-3 font-bold text-fg">کارکنان و مجریان</h3><ResponsiveTable className="w-full min-w-[850px] text-sm"><thead><tr className="text-right text-fg-muted"><th className="pb-2">نام نمایشی</th><th>کد عمومی</th><th>تیم</th><th>ظرفیت</th><th>کار فعال</th><th>به‌موقع</th><th>QC</th><th>امتیاز</th><th>هشدار باز</th></tr></thead><tbody>{data.staff.map((item) => <tr key={item.profileId} className="border-t border-border"><td className="py-2">{item.displayAlias}</td><td dir="ltr">{item.publicHandlerCode}</td><td>{item.team?.name ?? 'بدون تیم'}</td><td>{pct(item.capacityPercent)}</td><td>{nf(item.activeOrders)}</td><td>{pct(item.onTimeRate)}</td><td>{pct(item.qcPassRate)}</td><td>{nf(item.customerRating)}</td><td>{nf(item.openRiskAlerts)}</td></tr>)}</tbody></ResponsiveTable></Card>
    </>}
  </div>;
}
