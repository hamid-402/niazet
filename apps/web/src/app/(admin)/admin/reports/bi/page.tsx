'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, PageLoading, ResponsiveTable, SectionTitle, inputClass } from '@/components/ui';
import { RequireRole } from '@/components/require-role';
import { formatNumber, formatPercent } from '@/lib/format';

interface Report {
  asOf: string;
  period: { days: number };
  funnel: Array<{ stage: string; count: number; conversionFromCreated: number | null }>;
  weekly: Array<{ week: string; orders: number; complete: boolean }>;
  forecast: { available: boolean; nextWeek: number | null; lower: number | null; upper: number | null };
  cohorts: Array<{ month: string; customers: number | null; suppressed: boolean; day30: number | null; day60: number | null; day90: number | null }>;
}
const labels: Record<string, string> = { created: 'ایجاد درخواست', submitted: 'ثبت نهایی', quoted: 'اعلام قیمت', paid: 'پرداخت', delivered: 'تحویل', closed: 'بسته‌شده' };
const retention = (value: number | null) => value === null ? 'هنوز قابل گزارش نیست' : formatPercent(value);

export default function BiPage() {
  return <RequireRole roles={['admin']} adminScopes={['ops_admin', 'finance_admin']}><BiReport /></RequireRole>;
}
function BiReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Report>('/admin/reports/bi', { signal: controller.signal }).then(setReport).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'گزارش دریافت نشد.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function refresh() {
    setLoading(true); setError('');
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    try { setReport(await apiFetch<Report>(`/admin/reports/bi?${query}`, { dedupe: false })); }
    catch (e) { setError(e instanceof Error ? e.message : 'گزارش دریافت نشد.'); }
    finally { setLoading(false); }
  }
  return <div className="space-y-5">
    <SectionTitle subtitle="از اولین پرداخت تا بازگشت مشتری؛ تصویری از روند رشد و ظرفیت هفته آینده">تحلیل کسب‌وکار</SectionTitle>
    <Card><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end" onSubmit={e => { e.preventDefault(); void refresh(); }}>
      <Field label="از تاریخ"><input aria-label="از تاریخ تحلیل" type="date" className={inputClass} value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="تا تاریخ"><input aria-label="تا تاریخ تحلیل" type="date" className={inputClass} value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Button disabled={loading}>{loading ? 'در حال محاسبه…' : 'به‌روزرسانی تحلیل'}</Button>
    </form></Card>
    {error && <ErrorBanner message={error} />}
    {loading && !report && <PageLoading />}
    {report && <div aria-busy={loading} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><h2 className="mb-5 text-lg font-bold">مسیر تبدیل درخواست</h2>
          <ol className="space-y-4">{report.funnel.map(row => <li key={row.stage}>
            <div className="mb-2 flex justify-between gap-3 text-sm"><span>{labels[row.stage] ?? row.stage}</span><span className="tabular-fa">{formatNumber(row.count)} · {row.conversionFromCreated === null ? '—' : formatPercent(row.conversionFromCreated)}</span></div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-bg-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${row.conversionFromCreated ?? 0}%` }} /></div>
          </li>)}</ol>
          <p className="mt-5 text-xs leading-6 text-fg-muted">درخواست‌های ایجادشده در بازه انتخابی، با وضعیت ثبت‌شده تا پایان همین بازه. مسیرهای مستقیم ممکن است از بعضی مراحل عبور نکنند.</p>
        </Card>
        <Card><p className="text-sm text-fg-muted">برآورد سفارش در هفته آینده</p>
          <p className="my-5 text-4xl font-extrabold text-fg">{report.forecast.available ? formatNumber(report.forecast.nextWeek ?? 0) : 'داده کافی نیست'}</p>
          <p className="text-sm leading-7 text-fg-muted">{report.forecast.available ? `دامنه تغییرات معمول: ${formatNumber(report.forecast.lower ?? 0)} تا ${formatNumber(report.forecast.upper ?? 0)} سفارش` : 'برای برآورد، بازه‌ای با حداقل چهار هفته کامل انتخاب کنید.'}</p>
          <p className="mt-5 text-xs leading-6 text-fg-muted">میانگین حداکثر هشت هفته کامل اخیر؛ هفته ناقص حذف می‌شود. دامنه از پراکندگی داده‌های گذشته به دست آمده و تضمین یا فاصله اطمینان آماری نیست. این برآورد فقط برای برنامه‌ریزی انسانی است.</p>
          <div className="mt-6 space-y-3">{report.weekly.slice(-8).map(row => <div key={row.week} className="flex justify-between border-t border-border pt-3 text-sm"><bdi>{row.week}</bdi><span>{formatNumber(row.orders)} سفارش{!row.complete && ' · هفته ناقص'}</span></div>)}</div>
        </Card>
      </div>
      <Card><h2 className="mb-2 text-lg font-bold">بازگشت گروه‌های مشتری</h2><p className="mb-5 text-sm leading-7 text-fg-muted">گروه‌بندی بر اساس ماه اولین پرداخت مشتری است. هر ستون، پرداخت دوباره در پنجره ۳۰روزه پس از روز مشخص‌شده را نشان می‌دهد. گروه‌های کمتر از پنج نفر و پنجره‌های ناتمام گزارش نمی‌شوند.</p>
        {report.cohorts.length ? <ResponsiveTable className="w-full text-right text-sm"><thead><tr><th className="py-3">ماه اولین پرداخت</th><th>تعداد مشتری</th><th>روز ۳۰ تا ۵۹</th><th>روز ۶۰ تا ۸۹</th><th>روز ۹۰ تا ۱۱۹</th></tr></thead><tbody>{report.cohorts.map(row => <tr key={row.month} className="border-t border-border"><td className="py-4"><bdi>{row.month}</bdi></td><td>{row.suppressed ? 'گروه کوچک' : formatNumber(row.customers ?? 0)}</td><td>{retention(row.day30)}</td><td>{retention(row.day60)}</td><td>{retention(row.day90)}</td></tr>)}</tbody></ResponsiveTable> : <p className="rounded-control bg-bg-subtle p-5 text-sm">در این بازه مشتری با اولین پرداخت وجود ندارد؛ بازه زمانی را تغییر دهید.</p>}
      </Card>
    </div>}
  </div>;
}
