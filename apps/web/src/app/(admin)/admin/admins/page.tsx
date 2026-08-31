'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import { ConfirmationModal } from '@/components/confirmation-modal';

interface AdminRow {
  id: string;
  fullName: string;
  phone: string;
  adminScope: string;
  status: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [scope, setScope] = useState('ops_admin');
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingScope, setPendingScope] = useState<AdminRow | null>(null);

  function load() {
    apiFetch<AdminRow[]>('/admin/admins')
      .then((result) => {
        setAdmins(result);
        setScopeDrafts(Object.fromEntries(result.map((admin) => [admin.id, admin.adminScope])));
      })
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/admin/admins', {
        method: 'POST',
        body: { phone, fullName, adminScope: scope },
      });
      setPhone('');
      setFullName('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ایجاد ادمین');
    } finally {
      setBusy(false);
    }
  }

  async function updateScope(admin: AdminRow, note: string) {
    const adminScope = scopeDrafts[admin.id];
    if (!adminScope || adminScope === admin.adminScope) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/admins/${admin.id}/scope`, {
        method: 'PATCH',
        body: { adminScope, note },
      });
      load();
      setPendingScope(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در تغییر سطح دسترسی');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>مدیریت ادمین‌ها</SectionTitle>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'بستن' : 'افزودن ادمین'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form
            onSubmit={createAdmin}
            className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end"
          >
            <Field label="شماره موبایل">
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                required
              />
            </Field>
            <Field label="نام کامل">
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>
            <Field label="سطح دسترسی">
              <select
                className={inputClass}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="ops_admin">ops_admin</option>
                <option value="finance_admin">finance_admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </Field>
            <Button type="submit" disabled={busy}>
              ثبت
            </Button>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}
      {!admins && !error && <PageLoading />}

      {admins && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">نام</th>
                <th className="px-4 py-3 font-medium">موبایل</th>
                <th className="px-4 py-3 font-medium">دسترسی</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تغییر Scope</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 text-fg">{a.fullName}</td>
                  <td className="px-4 py-3 text-fg-muted" dir="ltr">
                    {a.phone}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color="purple">{a.adminScope}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={a.status === 'active' ? 'green' : 'red'}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <select className={inputClass} value={scopeDrafts[a.id] ?? a.adminScope} onChange={(event) => setScopeDrafts((current) => ({ ...current, [a.id]: event.target.value }))}>
                        <option value="ops_admin">ops_admin</option>
                        <option value="finance_admin">finance_admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                      <Button variant="secondary" disabled={busy || (scopeDrafts[a.id] ?? a.adminScope) === a.adminScope} onClick={() => setPendingScope(a)}>
                        اعمال
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {pendingScope && (
        <ConfirmationModal
          open
          title="تغییر سطح دسترسی ادمین"
          description={`${pendingScope.fullName} — ${pendingScope.phone}`}
          impacts={[
            `Scope از ${pendingScope.adminScope} به ${scopeDrafts[pendingScope.id]} تغییر می‌کند.`,
            'همه Sessionهای فعال این ادمین باطل می‌شوند.',
          ]}
          confirmLabel="اعمال Scope جدید"
          onCancel={() => setPendingScope(null)}
          onConfirm={(note) => updateScope(pendingScope, note)}
        />
      )}
    </div>
  );
}
