'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button, Card, ErrorBanner } from './ui';
import { formatNumber, formatPercent, formatToman } from '@/lib/format';
interface Suggestions {
  orderVersion: number;
  candidates: Array<{ id: string; displayAlias: string; publicHandlerCode: string; team: string | null; score: number; skills: string[]; evidence: { capacityPercent: number; qcPassRate: number; onTimeRate: number; skillLevel: number; riskScore: number } }>;
  price: { amount: number | null; source: string; samples: number | null };
}
export function OrderSuggestions({ orderId, onUsePrice }: { orderId: string; onUsePrice?: (amount: number) => void }) {
  const [report, setReport] = useState<Suggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { setReport(await apiFetch<Suggestions>(`/admin/orders/${orderId}/suggestions`, { dedupe: false })); }
    catch (e) { setError(e instanceof Error ? e.message : 'پیشنهاد دریافت نشد.'); }
    finally { setBusy(false); }
  }
  return <Card className="mb-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold">دستیار انتخاب مجری و برآورد قیمت</h2><p className="mt-2 text-sm leading-7 text-fg-muted">پیشنهاد مبتنی بر قواعد و اطلاعات موجود؛ انتخاب مجری و ثبت قیمت نهایی همچنان با شماست.</p></div><Button variant="secondary" disabled={busy} onClick={() => void load()}>{busy ? 'در حال بررسی…' : report ? 'محاسبه دوباره پیشنهادها' : 'بررسی پیشنهادها'}</Button></div>
    {error && <ErrorBanner message={error} />}
    {report && <div className="mt-5 space-y-5">
      <section className="rounded-control border border-border bg-bg-subtle p-4" aria-label="برآورد اولیه قیمت"><h3 className="text-sm font-bold">برآورد اولیه</h3><p className="my-3 text-xl font-extrabold">{report.price.amount === null ? 'داده کافی برای قیمت نداریم' : formatToman(report.price.amount)}</p><p className="text-sm leading-7 text-fg-muted">{report.price.source === 'current_catalog' ? 'بر اساس قیمت فعلی پکیج انتخابی در کاتالوگ.' : report.price.source === 'recent_completed_median' ? `میانه ${formatNumber(report.price.samples ?? 0)} سفارش بسته‌شده همین خدمت در ۱۸۰ روز اخیر، بدون پرونده بازپرداخت.` : 'پکیج قیمت‌دار یا حداقل پنج سفارش بسته‌شده قابل مقایسه لازم است.'} فوریت، پیچیدگی و تفاوت خروجی هنوز در این مبلغ لحاظ نشده‌اند.</p>{onUsePrice && report.price.amount !== null && <Button className="mt-3" variant="secondary" onClick={() => onUsePrice(report.price.amount!)}>انتقال مبلغ به فرم بررسی قیمت</Button>}</section>
      <section aria-label="مجریان پیشنهادی"><h3 className="mb-3 text-sm font-bold">مجریان قابل بررسی</h3>{!report.candidates.length ? <p className="text-sm text-fg-muted">مجری تأییدشده با مهارت و ظرفیت مناسب پیدا نشد؛ ظرفیت و مهارت‌ها را بررسی کنید.</p> : <ol className="grid gap-3 lg:grid-cols-2">{report.candidates.map((row, i) => <li key={row.id} className="rounded-control border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{formatNumber(i+1)}. {row.displayAlias}</strong><span className="text-sm">امتیاز قواعد: {formatNumber(row.score)} از ۱۰۰</span></div><p className="my-2 text-xs text-fg-muted"><bdi>{row.publicHandlerCode}</bdi>{row.team && ` · ${row.team}`}</p><p className="text-sm leading-7">مهارت: {row.skills.join('، ') || 'برای این دسته مهارتی تعریف نشده'}<br />ظرفیت مصرف‌شده: {formatPercent(row.evidence.capacityPercent)} · قبولی QC: {formatPercent(row.evidence.qcPassRate)}</p></li>)}</ol>}</section>
      <p className="text-xs leading-7 text-fg-muted">وزن‌ها: مهارت ۴۰٪، ظرفیت آزاد ۲۵٪، کیفیت ۱۵٪، تحویل به‌موقع ۱۵٪ و ریسک کمتر ۵٪. حداکثر ده پیشنهاد از صد مجری واجد شرایط با بیشترین ظرفیت آزاد نمایش داده می‌شود. داده کارکنان تازه ممکن است سابقه کافی نداشته باشد. هنگام تخصیص، صلاحیت دوباره کنترل می‌شود. هیچ تغییر خودکاری در سفارش انجام نشده است.</p>
    </div>}
  </Card>;
}
