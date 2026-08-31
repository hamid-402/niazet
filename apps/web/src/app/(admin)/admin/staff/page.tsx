'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PageLoading,
  SectionTitle,
} from '@/components/ui';
import type {
  ExecutorProfile,
  StaffSkill,
  StaffTeam,
} from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  over_capacity: 'بیش‌ازظرفیت',
  on_leave: 'مرخصی',
  under_review: 'تحت بررسی',
  blocked: 'مسدود',
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  in_review: 'در حال بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
};

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<ExecutorProfile[] | null>(null);
  const [teams, setTeams] = useState<StaffTeam[]>([]);
  const [skills, setSkills] = useState<StaffSkill[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [displayAlias, setDisplayAlias] = useState('');
  const [teamId, setTeamId] = useState('');
  const [executorType, setExecutorType] = useState('internal_staff');
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const [staffRows, teamRows, skillRows] = await Promise.all([
        apiFetch<ExecutorProfile[]>('/admin/staff?pageSize=100'),
        apiFetch<StaffTeam[]>('/admin/teams'),
        apiFetch<StaffSkill[]>('/admin/skills'),
      ]);
      setStaff(staffRows);
      setTeams(teamRows);
      setSkills(skillRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت اطلاعات ممکن نشد.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiFetch<ExecutorProfile[]>('/admin/staff?pageSize=100'),
      apiFetch<StaffTeam[]>('/admin/teams'),
      apiFetch<StaffSkill[]>('/admin/skills'),
    ])
      .then(([staffRows, teamRows, skillRows]) => {
        if (cancelled) return;
        setStaff(staffRows);
        setTeams(teamRows);
        setSkills(skillRows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'دریافت اطلاعات ممکن نشد.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStaff = useMemo(
    () =>
      (staff ?? []).filter(
        (item) =>
          (!teamFilter || item.teamId === teamFilter) &&
          (!statusFilter || item.status === statusFilter) &&
          (!typeFilter || item.executorType === typeFilter) &&
          (!verificationFilter ||
            item.verificationStatus === verificationFilter),
      ),
    [staff, teamFilter, statusFilter, typeFilter, verificationFilter],
  );

  async function createStaff(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/admin/staff', {
        method: 'POST',
        body: {
          phone,
          fullName,
          displayAlias,
          executorType,
          teamId: teamId || undefined,
        },
      });
      setPhone('');
      setFullName('');
      setDisplayAlias('');
      setTeamId('');
      setExecutorType('internal_staff');
      setShowForm(false);
      setMessage('کارمند با موفقیت ساخته شد.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ایجاد کارمند');
    } finally {
      setBusy(false);
    }
  }

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/admin/teams', {
        method: 'POST',
        body: { name: teamName, code: teamCode },
      });
      setTeamName('');
      setTeamCode('');
      setMessage('تیم جدید ثبت شد.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت تیم ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function createSkill(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/admin/skills', {
        method: 'POST',
        body: { name: skillName, category: skillCategory || undefined },
      });
      setSkillName('');
      setSkillCategory('');
      setMessage('مهارت جدید ثبت شد.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت مهارت ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle subtitle="تیم، تخصص، احراز، حضور، ظرفیت و دسترسی از یک نقطه کنترل می‌شوند.">
          کارمندان و مجریان
        </SectionTitle>
        <Button onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'بستن فرم' : 'افزودن کارمند'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form
            onSubmit={createStaff}
            className="grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            <Field label="شماره موبایل">
              <input
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                dir="ltr"
                required
              />
            </Field>
            <Field label="نام کامل داخلی">
              <input
                className={inputClass}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </Field>
            <Field label="نام نمایشی به مشتری">
              <input
                className={inputClass}
                value={displayAlias}
                onChange={(event) => setDisplayAlias(event.target.value)}
                placeholder="کارشناس پیگیری ..."
                required
              />
            </Field>
            <Field label="نوع همکاری">
              <select
                className={inputClass}
                value={executorType}
                onChange={(event) => setExecutorType(event.target.value)}
              >
                <option value="internal_staff">کارمند داخلی</option>
                <option value="vetted_external">مجری بیرونی گزینش‌شده</option>
              </select>
            </Field>
            <Field label="تیم">
              <select
                className={inputClass}
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
              >
                <option value="">بدون تیم</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>
                {busy ? 'در حال ثبت...' : 'ثبت کارمند'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold text-fg">تعریف تیم</h3>
          <p className="mt-1 text-xs text-fg-muted">
            {teams.length} تیم فعال در ساختار عملیات
          </p>
          <form onSubmit={createTeam} className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="نام تیم">
              <input
                className={inputClass}
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                required
              />
            </Field>
            <Field label="کد یکتا">
              <input
                className={inputClass}
                value={teamCode}
                onChange={(event) => setTeamCode(event.target.value.toUpperCase())}
                dir="ltr"
                required
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="secondary" disabled={busy}>
                افزودن تیم
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <h3 className="font-bold text-fg">تعریف مهارت</h3>
          <p className="mt-1 text-xs text-fg-muted">
            {skills.length} مهارت قابل انتساب
          </p>
          <form onSubmit={createSkill} className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="نام مهارت">
              <input
                className={inputClass}
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
                required
              />
            </Field>
            <Field label="دسته‌بندی">
              <input
                className={inputClass}
                value={skillCategory}
                onChange={(event) => setSkillCategory(event.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="secondary" disabled={busy}>
                افزودن مهارت
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {message && (
        <div className="mb-4 rounded-control border border-success-border bg-success-subtle px-4 py-3 text-sm text-success">
          {message}
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="تیم">
            <select
              className={inputClass}
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
            >
              <option value="">همه تیم‌ها</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="وضعیت کاری">
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نوع همکاری">
            <select
              className={inputClass}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">همه انواع</option>
              <option value="internal_staff">داخلی</option>
              <option value="vetted_external">بیرونی</option>
            </select>
          </Field>
          <Field label="وضعیت احراز">
            <select
              className={inputClass}
              value={verificationFilter}
              onChange={(event) => setVerificationFilter(event.target.value)}
            >
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {!staff && !error && <PageLoading />}
      {staff && filteredStaff.length === 0 && (
        <EmptyState
          title="مجری مطابق فیلتر پیدا نشد"
          description="فیلترها را تغییر دهید یا کارمند جدیدی اضافه کنید."
        />
      )}
      {staff && filteredStaff.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-fg-subtle">
                <th className="px-4 py-3 font-medium">کارمند / کد</th>
                <th className="px-4 py-3 font-medium">نوع و احراز</th>
                <th className="px-4 py-3 font-medium">تیم و مهارت</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">ظرفیت</th>
                <th className="px-4 py-3 font-medium">عملکرد</th>
                <th className="px-4 py-3 font-medium">هشدار</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-bg-subtle"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/staff/${item.id}`}
                      className="font-bold text-fg hover:underline"
                    >
                      {item.user?.fullName ?? item.displayAlias}
                    </Link>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {item.displayAlias} · {item.publicHandlerCode}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg-muted">
                      {item.executorType === 'internal_staff' ? 'داخلی' : 'بیرونی'}
                    </p>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {VERIFICATION_LABELS[item.verificationStatus] ??
                        item.verificationStatus}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg-muted">{item.team?.name ?? 'بدون تیم'}</p>
                    <p className="mt-1 max-w-56 truncate text-xs text-fg-subtle">
                      {item.skills?.map((entry) => entry.skill.name).join('، ') ||
                        'مهارتی ثبت نشده'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={item.status === 'active' ? 'green' : 'yellow'}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-bg-subtle">
                      <div
                        className={`h-full ${item.capacityPercent >= 90 ? 'bg-warning-subtle0' : 'bg-success-subtle0'}`}
                        style={{ width: `${item.capacityPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {item.capacityPercent}٪
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    <p>QC: {Number(item.qcPassRate).toFixed(0)}٪</p>
                    <p className="mt-1">
                      رضایت: {Number(item.customerRatingAvg).toFixed(1)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {(item.riskAlerts?.length ?? 0) > 0 ? (
                      <Badge
                        color={
                          item.riskAlerts?.some(
                            (alert) => alert.severity === 'critical',
                          )
                            ? 'red'
                            : 'yellow'
                        }
                      >
                        {item.riskAlerts?.length} هشدار باز
                      </Badge>
                    ) : (
                      <Badge color="green">بدون هشدار</Badge>
                    )}
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
