'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, ErrorBanner, PageLoading, SectionTitle } from '@/components/ui';
import { formatDate } from '@/lib/format';

interface UserRow {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<UserRow[]>('/admin/users').then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function toggleStatus(user: UserRow) {
    const next = user.status === 'blocked' ? 'active' : 'blocked';
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}/status`, { method: 'PATCH', body: { status: next } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle>مدیریت کاربران</SectionTitle>
      {error && <ErrorBanner message={error} />}
      {!users && !error && <PageLoading />}

      {users && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">نام</th>
                <th className="px-4 py-3 font-medium">موبایل</th>
                <th className="px-4 py-3 font-medium">نقش</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ عضویت</th>
                <th className="px-4 py-3 font-medium">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-500" dir="ltr">{u.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{u.role}</td>
                  <td className="px-4 py-3">
                    <Badge color={u.status === 'active' ? 'green' : 'red'}>{u.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Button variant="secondary" disabled={busy} onClick={() => toggleStatus(u)}>
                      {u.status === 'blocked' ? 'فعال‌سازی' : 'مسدودسازی'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
