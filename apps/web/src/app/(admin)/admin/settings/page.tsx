'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, inputClass, PageLoading, SectionTitle } from '@/components/ui';

type Setting = { key: string; group: string; label: string; description: string; valueType: string; value: unknown; isDefault: boolean; updatedAt: string | null };

export default function AdminSettingsPage() {
  const [items, setItems] = useState<Setting[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function apply(result: Setting[]) {
    const visible = result.filter((item) => item.group !== 'ai');
    setItems(visible);
    setDrafts(Object.fromEntries(visible.map((item) => [item.key, Array.isArray(item.value) ? item.value.join('\n') : String(item.value)])));
  }

  useEffect(() => {
    apiFetch<Setting[]>('/admin/settings').then(apply).catch((err) => setError(err.message));
  }, []);

  async function save(item: Setting) {
    setBusy(item.key); setError('');
    try {
      const draft = drafts[item.key] ?? '';
      const value = item.valueType === 'date_array'
        ? draft.split(/\r?\n|,/).map((part) => part.trim()).filter(Boolean)
        : Number(draft);
      await apiFetch('/admin/settings', { method: 'PUT', body: { key: item.key, value } });
      apply(await apiFetch<Setting[]>('/admin/settings', { dedupe: false }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تنظیم ذخیره نشد.');
    } finally { setBusy(''); }
  }

  if (!items) return error ? <ErrorBanner message={error} /> : <PageLoading />;
  return <div>
    <SectionTitle subtitle="تغییرات حساس ثبت Audit می‌شوند و بلافاصله بر منطق مرتبط اثر می‌گذارند.">تنظیمات سامانه</SectionTitle>
    {error && <ErrorBanner message={error} />}
    <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <Card key={item.key}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-fg">{item.label}</h3><p className="mt-1 text-sm text-fg-muted">{item.description}</p></div>{item.isDefault && <span className="rounded-pill bg-warning-subtle px-2 py-1 text-xs text-warning">پیش‌فرض</span>}</div>
      <p className="mt-2 text-xs text-fg-subtle" dir="ltr">{item.key}</p>
      {item.valueType === 'date_array'
        ? <textarea className={`${inputClass} mt-3 min-h-28`} dir="ltr" value={drafts[item.key] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [item.key]: event.target.value }))} placeholder="2026-03-21" />
        : <input className={`${inputClass} mt-3`} type="number" dir="ltr" step={item.valueType === 'rate' ? '0.01' : '1'} value={drafts[item.key] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [item.key]: event.target.value }))} />}
      <Button className="mt-3" disabled={busy === item.key || drafts[item.key] === ''} onClick={() => void save(item)}>{busy === item.key ? 'در حال ذخیره...' : 'ذخیره تنظیم'}</Button>
    </Card>)}</div>
  </div>;
}
