'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PublicNav } from '@/components/public-nav';
import { Badge, Button, Card, ErrorBanner, PageLoading } from '@/components/ui';
import { formatDate } from '@/lib/format';

type ComponentState = 'operational' | 'degraded' | 'unknown';
type StatusResponse = {
  status: 'operational' | 'degraded';
  generatedAt: string;
  notice: string;
  components: Array<{ id: string; label: string; status: ComponentState; lastActivityAt?: string | null }>;
  incidents: Array<{ id: string; title: string; status: 'investigating' | 'monitoring'; startedAt: string }>;
};

const LABELS: Record<ComponentState, string> = {
  operational: 'عملیاتی',
  degraded: 'کاهش کیفیت',
  unknown: 'در حال بررسی',
};

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<StatusResponse>('/status', {
        auth: false,
        dedupe: false,
      });
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'وضعیت سرویس دریافت نشد.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<StatusResponse>('/status', { auth: false, dedupe: false })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'وضعیت سرویس دریافت نشد.');
      });
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  return <div className="min-h-screen bg-bg">
    <PublicNav />
    <main id="main-content" className="mx-auto w-full max-w-4xl px-4 py-12 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-extrabold text-fg">وضعیت سرویس‌های نیازت</h1><p className="mt-2 text-sm text-fg-muted">نمای عمومی سلامت سرویس‌ها؛ به‌روزرسانی خودکار هر ۶۰ ثانیه</p></div>
        <Button variant="secondary" disabled={refreshing} onClick={() => { setRefreshing(true); void load(); }}>{refreshing ? 'در حال بررسی...' : 'بررسی دوباره'}</Button>
      </div>
      {error && <div className="mt-5"><ErrorBanner message={error} /></div>}
      {!data && !error && <PageLoading />}
      {data && <>
        <Card className={`mt-6 ${data.status === 'operational' ? 'border-success-border bg-success-subtle' : 'border-warning-border bg-warning-subtle'}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-lg font-extrabold text-fg">{data.status === 'operational' ? 'همه سرویس‌ها در دسترس‌اند' : 'برخی سرویس‌ها با کاهش کیفیت مواجه‌اند'}</p><p className="mt-1 text-sm text-fg-muted">آخرین بررسی: {formatDate(data.generatedAt)}</p></div><Badge color={data.status === 'operational' ? 'green' : 'yellow'}>{data.status === 'operational' ? 'عملیاتی' : 'کاهش کیفیت'}</Badge></div>
        </Card>
        <section className="mt-8"><h2 className="mb-3 text-lg font-bold text-fg">اجزای سرویس</h2><div className="grid gap-3 md:grid-cols-2">{data.components.map((component) => <Card key={component.id}><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-fg">{component.label}</p>{component.lastActivityAt && <p className="mt-1 text-xs text-fg-subtle">آخرین فعالیت: {formatDate(component.lastActivityAt)}</p>}</div><Badge color={component.status === 'operational' ? 'green' : component.status === 'degraded' ? 'yellow' : 'gray'}>{LABELS[component.status]}</Badge></div></Card>)}</div></section>
        <section className="mt-8"><h2 className="mb-3 text-lg font-bold text-fg">رخدادهای جاری</h2>{data.incidents.length === 0 ? <Card><p className="font-bold text-success">رخداد فعالی گزارش نشده است.</p><p className="mt-1 text-sm text-fg-muted">سامانه طبق آخرین بررسی در وضعیت پایدار قرار دارد.</p></Card> : <div className="space-y-3">{data.incidents.map((incident) => <Card key={incident.id}><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-fg">{incident.title}</p><p className="mt-1 text-xs text-fg-subtle">شروع بررسی: {formatDate(incident.startedAt)}</p></div><Badge color="yellow">{incident.status === 'investigating' ? 'در حال بررسی' : 'پایش'}</Badge></div></Card>)}</div>}</section>
        <p className="mt-8 rounded-control bg-bg-subtle p-3 text-xs leading-6 text-fg-subtle">{data.notice}</p>
      </>}
    </main>
  </div>;
}
