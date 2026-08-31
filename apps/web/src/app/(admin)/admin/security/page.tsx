'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';

type Summary = { generatedAt: string; activeSessions: number; failedLogins24h: number; blockedUsers: number; suspendedUsers: number; criticalEvents24h: number; pendingFileScans: number; activeSignedUrls: number };
const LABELS: Record<keyof Omit<Summary, 'generatedAt'>, string> = { activeSessions: 'Session فعال', failedLogins24h: 'ورود ناموفق در ۲۴ ساعت', blockedUsers: 'کاربر مسدود', suspendedUsers: 'کاربر تعلیق‌شده', criticalEvents24h: 'رویداد بحرانی در ۲۴ ساعت', pendingFileScans: 'فایل در انتظار اسکن', activeSignedUrls: 'لینک دانلود فعال' };

export default function SecurityPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiFetch<Summary>('/admin/security/summary').then(setData).catch((err) => setError(err.message)); }, []);
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;
  const keys = Object.keys(LABELS) as (keyof typeof LABELS)[];
  return <div><SectionTitle subtitle="نمای بدون اطلاعات شخصی برای پایش سریع سطح حمله و کنترل‌های حفاظتی">امنیت و سلامت</SectionTitle><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{keys.map((key) => <Card key={key}><p className="text-xs text-fg-subtle">{LABELS[key]}</p><p className="mt-2 text-2xl font-extrabold text-fg">{formatNumber(data[key])}</p></Card>)}</div><p className="mt-3 text-xs text-fg-subtle">آخرین محاسبه: {formatDate(data.generatedAt)}</p></div>;
}
