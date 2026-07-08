'use client';

import { use, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import type { ExecutorProfile } from '@/lib/types';

interface StaffDetail extends ExecutorProfile {
  assignments: { order: { code: string; title: string; status: string } }[];
}

export default function AdminStaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<StaffDetail>(`/admin/staff/${id}`).then(setProfile).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!profile) return <PageLoading />;

  return (
    <div>
      <SectionTitle subtitle={profile.publicHandlerCode}>{profile.displayAlias}</SectionTitle>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-400">ظرفیت</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{profile.capacityPercent}٪</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">QC pass</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Number(profile.qcPassRate).toFixed(0)}٪</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">تحویل به‌موقع</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Number(profile.onTimeDeliveryRate).toFixed(0)}٪</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">ریسک عملکرد</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{Number(profile.riskScore).toFixed(0)}</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 font-bold text-slate-800">سفارش‌ها</h3>
        {profile.assignments?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {profile.assignments.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>{a.order.title}</span>
                <span className="text-xs text-slate-400">{a.order.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">سفارشی ثبت نشده است.</p>
        )}
      </Card>
    </div>
  );
}
