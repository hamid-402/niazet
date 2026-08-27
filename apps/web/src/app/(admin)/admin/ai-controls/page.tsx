'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';

type Setting = { key: string; group: string; label: string; description: string; value: unknown; isDefault: boolean };

export default function AiControlsPage() {
  const [items, setItems] = useState<Setting[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function apply(result: Setting[]) { setItems(result.filter((item) => item.group === 'ai')); }
  useEffect(() => { apiFetch<Setting[]>('/admin/settings').then(apply).catch((err) => setError(err.message)); }, []);

  async function toggle(item: Setting) {
    setBusy(item.key); setError('');
    try {
      await apiFetch('/admin/settings', { method: 'PUT', body: { key: item.key, value: !item.value } });
      apply(await apiFetch<Setting[]>('/admin/settings', { dedupe: false }));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'کنترل AI ذخیره نشد.'); }
    finally { setBusy(''); }
  }

  if (!items) return error ? <ErrorBanner message={error} /> : <PageLoading />;
  const masterEnabled = items.find((item) => item.key === 'ai.enabled')?.value === true;
  return <div>
    <SectionTitle subtitle="این کنترل‌ها مجوز استفاده را تعیین می‌کنند؛ هیچ تصمیم یا ارسال خودکاری بدون پیاده‌سازی موتور و تأیید انسانی انجام نمی‌شود.">کنترل‌های AI</SectionTitle>
    {error && <ErrorBanner message={error} />}
    <Card className={`mb-3 ${masterEnabled ? 'border-warning-border' : 'border-success-border'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-fg">وضعیت سراسری</p><p className="mt-1 text-sm text-fg-muted">Kill switch بر همه قابلیت‌های AI اولویت دارد.</p></div><Badge color={masterEnabled ? 'yellow' : 'green'}>{masterEnabled ? 'فعال' : 'خاموش و امن'}</Badge></div></Card>
    <div className="space-y-3">{items.map((item) => {
      const enabled = item.value === true;
      const locked = item.key === 'ai.human_approval_required';
      return <Card key={item.key}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-fg">{item.label}</p><p className="mt-1 text-sm text-fg-muted">{item.description}</p><p className="mt-1 text-xs text-fg-subtle" dir="ltr">{item.key}</p></div><Button variant={enabled ? 'danger' : 'secondary'} disabled={busy === item.key || locked} onClick={() => void toggle(item)}>{locked ? 'همیشه اجباری' : enabled ? 'خاموش‌کردن' : 'روشن‌کردن'}</Button></div></Card>;
    })}</div>
  </div>;
}
