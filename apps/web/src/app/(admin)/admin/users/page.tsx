'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { ResponsiveTable,
  Badge,
  Button,
  Card,
  ErrorBanner,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmationModal } from '@/components/confirmation-modal';

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
  const [pending, setPending] = useState<UserRow | null>(null);

  function load() {
    apiFetch<UserRow[]>('/admin/users')
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function toggleStatus(user: UserRow, note: string) {
    const next = user.status === 'blocked' ? 'active' : 'blocked';
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: next, note },
      });
      setPending(null);
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
          <ResponsiveTable className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
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
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 text-fg">{u.fullName}</td>
                  <td className="px-4 py-3 text-fg-muted" dir="ltr">
                    {u.phone}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{u.role}</td>
                  <td className="px-4 py-3">
                    <Badge color={u.status === 'active' ? 'green' : 'red'}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setPending(u)}
                    >
                      {u.status === 'blocked' ? 'فعال‌سازی' : 'مسدودسازی'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </Card>
      )}
      {pending && (
        <ConfirmationModal
          open
          title={pending.status === 'blocked' ? 'فعال‌سازی دوباره کاربر' : 'مسدودسازی کاربر'}
          description={`${pending.fullName} — ${pending.phone}`}
          impacts={pending.status === 'blocked'
            ? ['کاربر دوباره امکان ورود و استفاده از حساب را خواهد داشت.']
            : ['دسترسی همه دستگاه‌های فعال کاربر فوراً قطع می‌شود.', 'ورود و استفاده از حساب تا فعال‌سازی مجدد متوقف می‌شود.']}
          confirmLabel={pending.status === 'blocked' ? 'فعال‌سازی کاربر' : 'مسدودکردن کاربر'}
          tone={pending.status === 'blocked' ? 'primary' : 'danger'}
          onCancel={() => setPending(null)}
          onConfirm={(note) => toggleStatus(pending, note)}
        />
      )}
    </div>
  );
}
