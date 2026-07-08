'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, ErrorBanner, Field, inputClass, PageLoading, SectionTitle } from '@/components/ui';

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
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<AdminRow[]>('/admin/admins').then(setAdmins).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/admin/admins', { method: 'POST', body: { phone, fullName, adminScope: scope } });
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>مدیریت ادمین‌ها</SectionTitle>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'بستن' : 'افزودن ادمین'}</Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={createAdmin} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
            <Field label="شماره موبایل">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required />
            </Field>
            <Field label="نام کامل">
              <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="سطح دسترسی">
              <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value)}>
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
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">نام</th>
                <th className="px-4 py-3 font-medium">موبایل</th>
                <th className="px-4 py-3 font-medium">دسترسی</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-slate-700">{a.fullName}</td>
                  <td className="px-4 py-3 text-slate-500" dir="ltr">{a.phone}</td>
                  <td className="px-4 py-3">
                    <Badge color="purple">{a.adminScope}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={a.status === 'active' ? 'green' : 'red'}>{a.status}</Badge>
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
