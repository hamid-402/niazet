'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, Card, ErrorBanner, Field, inputClass, PageLoading, SectionTitle } from '@/components/ui';
import type { ExecutorProfile } from '@/lib/types';

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<ExecutorProfile[] | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [displayAlias, setDisplayAlias] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ExecutorProfile[]>('/admin/staff').then(setStaff).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/admin/staff', { method: 'POST', body: { phone, fullName, displayAlias } });
      setPhone('');
      setFullName('');
      setDisplayAlias('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ایجاد کارمند');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>کارمندان و مجریان</SectionTitle>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'بستن' : 'افزودن کارمند'}</Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={createStaff} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
            <Field label="شماره موبایل">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" required />
            </Field>
            <Field label="نام کامل (داخلی)">
              <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="نام نمایشی به مشتری">
              <input
                className={inputClass}
                value={displayAlias}
                onChange={(e) => setDisplayAlias(e.target.value)}
                placeholder="کارشناس پیگیری ..."
                required
              />
            </Field>
            <Button type="submit" disabled={busy}>
              ثبت
            </Button>
          </form>
        </Card>
      )}

      {error && <ErrorBanner message={error} />}
      {!staff && !error && <PageLoading />}

      {staff && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">کد نمایشی</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">ظرفیت</th>
                <th className="px-4 py-3 font-medium">QC pass</th>
                <th className="px-4 py-3 font-medium">امتیاز مشتری</th>
                <th className="px-4 py-3 font-medium">شکایت/تشکر</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/staff/${s.id}`} className="font-medium text-slate-800 hover:underline">
                      {s.displayAlias}
                    </Link>
                    <p className="text-xs text-slate-400">{s.publicHandlerCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={s.status === 'active' ? 'green' : 'yellow'}>{s.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.capacityPercent}٪</td>
                  <td className="px-4 py-3 text-slate-500">{Number(s.qcPassRate).toFixed(0)}٪</td>
                  <td className="px-4 py-3 text-slate-500">{Number(s.customerRatingAvg).toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.complimentCount} / {s.complaintCount}
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
