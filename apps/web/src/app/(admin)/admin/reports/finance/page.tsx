'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, downloadAuthenticated } from '@/lib/api';
import { formatDateOnly, formatNumber, formatToman } from '@/lib/format';
import { ResponsiveTable, Button, Card, ErrorBanner, Field, PageLoading, SectionTitle, inputClass } from '@/components/ui';

interface FinanceReport {
  period: { fromUtc: string; toExclusiveUtc: string; timeZone: string; days: number };
  sales: { gmv: number; succeededPayments: number; paidOrders: number; failedPayments: number; averagePayment: number };
  income: { revenue: number; commission: number };
  escrow: { periodInflow: number; periodCount: number; currentHeld: number; totalCount: number; byStatus: Record<string, number> };
  refunds: { requestedAmount: number; processedAmount: number; count: number; byStatus: Record<string, number> };
  daily: Array<{ date: string; gmv: number; revenue: number; refunds: number }>;
}
const nf = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
const metric = (label: string, value: string, detail?: string) => <Card key={label}><p className="text-xs text-fg-muted">{label}</p><p className="mt-1 text-xl font-bold text-fg">{value}</p>{detail && <p className="text-xs text-fg-muted">{detail}</p>}</Card>;

export default function FinanceReportPage() {
  const [data, setData] = useState<FinanceReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    try { setData(await apiFetch<FinanceReport>(`/admin/reports/finance?${query}`, { dedupe: false })); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت گزارش ممکن نشد.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => {
    let active = true;
    apiFetch<FinanceReport>('/admin/reports/finance')
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'دریافت گزارش ممکن نشد.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function exportCsv() {
    setExporting(true); setError('');
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    try { await downloadAuthenticated(`/admin/reports/finance/export?${query}`, `niazat-finance-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت خروجی ممکن نشد.'); }
    finally { setExporting(false); }
  }

  return <div>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><SectionTitle subtitle="فروش، درآمد، وجوه امانی و بازپرداخت؛ فقط برای حوزه مالی">گزارش یکپارچه مالی</SectionTitle><Button variant="secondary" disabled={exporting || loading} onClick={() => void exportCsv()}>{exporting ? 'در حال تهیه...' : 'خروجی کنترل‌شده CSV'}</Button></div>
    <Card className="mb-4"><div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
      <Field label="از تاریخ"><input aria-label="از تاریخ گزارش مالی" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="تا تاریخ"><input aria-label="تا تاریخ گزارش مالی" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Button onClick={() => void load()} disabled={loading}>به‌روزرسانی گزارش</Button>
    </div></Card>
    {error && <ErrorBanner message={error} />}
    {loading && !data ? <PageLoading /> : data && <>
      <p className="mb-3 text-xs text-fg-muted">بازه {formatNumber(data.period.days)} روزه · منطقه زمانی <bdi dir="ltr">{data.period.timeZone}</bdi></p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metric('فروش ناخالص GMV', formatToman(data.sales.gmv), `${nf(data.sales.succeededPayments)} پرداخت موفق`)}
        {metric('درآمد و کارمزد', formatToman(data.income.revenue))}
        {metric('مانده جاری Escrow', formatToman(data.escrow.currentHeld), `${nf(data.escrow.totalCount)} حساب امانی`)}
        {metric('بازپرداخت پردازش‌شده', formatToman(data.refunds.processedAmount), `${nf(data.refunds.count)} درخواست در بازه`)}
        {metric('میانگین پرداخت', formatToman(data.sales.averagePayment))}
        {metric('سفارش پرداخت‌شده', nf(data.sales.paidOrders))}
        {metric('پرداخت ناموفق', nf(data.sales.failedPayments))}
        {metric('ورودی Escrow بازه', formatToman(data.escrow.periodInflow), `${nf(data.escrow.periodCount)} رکورد`)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><h3 className="mb-3 font-bold text-fg">وضعیت Escrow</h3><div className="grid grid-cols-2 gap-2 text-sm">{Object.entries(data.escrow.byStatus).map(([status,count]) => <div key={status} className="flex justify-between rounded-control bg-bg-subtle p-3"><span>{status}</span><b>{nf(count)}</b></div>)}</div></Card>
        <Card><h3 className="mb-3 font-bold text-fg">بازپرداخت‌ها</h3><p className="mb-3 text-sm">مبلغ درخواست‌شده: <b>{formatToman(data.refunds.requestedAmount)}</b></p><div className="grid grid-cols-2 gap-2 text-sm">{Object.entries(data.refunds.byStatus).map(([status,count]) => <div key={status} className="flex justify-between rounded-control bg-bg-subtle p-3"><span>{status}</span><b>{nf(count)}</b></div>)}</div></Card>
      </div>
      <Card className="mt-4 overflow-x-auto"><h3 className="mb-3 font-bold text-fg">روند روزانه بر مبنای تهران</h3><ResponsiveTable className="w-full min-w-[650px] text-sm"><thead><tr className="text-right text-fg-muted"><th className="pb-2">تاریخ</th><th>GMV</th><th>درآمد</th><th>بازپرداخت</th></tr></thead><tbody>{data.daily.map((item) => <tr key={item.date} className="border-t border-border"><td className="py-2">{formatDateOnly(item.date)}</td><td>{formatToman(item.gmv)}</td><td>{formatToman(item.revenue)}</td><td>{formatToman(item.refunds)}</td></tr>)}</tbody></ResponsiveTable></Card>
    </>}
  </div>;
}
