'use client';

import { use, useEffect, useState } from 'react';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { apiFetch } from '@/lib/api';
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
import type {
  ExecutorProfile,
  StaffAttendanceRecord,
  StaffSkill,
  StaffTeam,
} from '@/lib/types';

interface StaffDetail extends ExecutorProfile {
  assignments: {
    id?: string;
    order: { code: string; title: string; status: string };
  }[];
  performanceSnapshots: {
    id: string;
    periodStart: string;
    periodEnd: string;
    completedOrders: number;
    activeOrders: number;
    onTimeRate: number;
    qcPassRate: number;
    avgCustomerRating: number;
    complaintCount: number;
    complimentCount: number;
    riskScore: number;
  }[];
  feedback: {
    id: string;
    code: string;
    rating: number | null;
    satisfactionPercent: number | null;
    feedbackType: string;
    comment: string | null;
    status: string;
    resolutionNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
    order: { id: string; code: string; title: string };
    customer: { fullName: string };
  }[];
  history: {
    id: string;
    action: string;
    before: unknown;
    after: unknown;
    sensitivity: string;
    actorRole: string | null;
    createdAt: string;
    actor: { fullName: string } | null;
  }[];
}

type StaffTab =
  | 'summary'
  | 'orders'
  | 'performance'
  | 'feedback'
  | 'skills'
  | 'capacity'
  | 'history';

const STAFF_TABS: { value: StaffTab; label: string }[] = [
  { value: 'summary', label: 'خلاصه و دسترسی' },
  { value: 'orders', label: 'سفارش‌ها' },
  { value: 'performance', label: 'عملکرد' },
  { value: 'feedback', label: 'امتیاز و بازخورد' },
  { value: 'skills', label: 'مهارت‌ها' },
  { value: 'capacity', label: 'ظرفیت و حضور' },
  { value: 'history', label: 'تاریخچه' },
];

type PendingAction = {
  title: string;
  description: string;
  impacts: string[];
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  path: string;
  body: Record<string, unknown>;
  noteKey?: 'note' | 'reason';
  success: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  over_capacity: 'بیش‌ازظرفیت',
  on_leave: 'مرخصی',
  under_review: 'تحت بررسی',
  blocked: 'مسدود',
};

const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'در انتظار بررسی',
  in_review: 'در حال بررسی',
  approved: 'تأییدشده',
  rejected: 'ردشده',
};

const ATTENDANCE_LABELS: Record<string, string> = {
  present: 'حاضر',
  remote: 'دورکار',
  leave: 'مرخصی',
  sick_leave: 'مرخصی استعلاجی',
  absent: 'غایب',
};

const FEEDBACK_LABELS: Record<string, string> = {
  rating: 'امتیاز',
  complaint: 'شکایت',
  compliment: 'تشکر',
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  'staff.created': 'ایجاد پروفایل مجری',
  'staff.profile_changed': 'تغییر مشخصات و احراز',
  'staff.status_changed': 'تغییر وضعیت کاری',
  'staff.capacity_changed': 'تغییر ظرفیت',
  'staff.skills_changed': 'تغییر مهارت‌ها',
  'staff.attendance_recorded': 'ثبت یا اصلاح حضور',
  'staff.access_changed': 'تغییر دسترسی حساب',
};

export default function AdminStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [activeTab, setActiveTab] = useState<StaffTab>('summary');
  const [teams, setTeams] = useState<StaffTeam[]>([]);
  const [allSkills, setAllSkills] = useState<StaffSkill[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [displayAlias, setDisplayAlias] = useState('');
  const [teamId, setTeamId] = useState('');
  const [executorType, setExecutorType] = useState('internal_staff');
  const [verificationStatus, setVerificationStatus] = useState('approved');
  const [staffStatus, setStaffStatus] = useState('active');
  const [capacity, setCapacity] = useState(0);
  const [selectedSkills, setSelectedSkills] = useState<Record<string, number>>(
    {},
  );
  const [workDate, setWorkDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [attendanceStatus, setAttendanceStatus] = useState('present');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [userStatus, setUserStatus] = useState('active');
  const [customerCapability, setCustomerCapability] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  async function load() {
    setError('');
    try {
      const [detail, teamRows, skillRows, attendanceRows] = await Promise.all([
        apiFetch<StaffDetail>(`/admin/staff/${id}`),
        apiFetch<StaffTeam[]>('/admin/teams'),
        apiFetch<StaffSkill[]>('/admin/skills'),
        apiFetch<StaffAttendanceRecord[]>(`/admin/staff/${id}/attendance`),
      ]);
      setProfile(detail);
      setTeams(teamRows);
      setAllSkills(skillRows);
      setAttendance(attendanceRows);
      setDisplayAlias(detail.displayAlias);
      setTeamId(detail.teamId ?? '');
      setExecutorType(detail.executorType);
      setVerificationStatus(detail.verificationStatus);
      setStaffStatus(detail.status);
      setCapacity(detail.capacityPercent);
      setUserStatus(detail.user?.status ?? 'active');
      setCustomerCapability(
        detail.user?.capabilities?.some(
          (item) => item.capability === 'customer',
        ) ?? false,
      );
      setSelectedSkills(
        Object.fromEntries(
          (detail.skills ?? []).map((entry) => [entry.skillId, entry.level]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت پروفایل ممکن نشد.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiFetch<StaffDetail>(`/admin/staff/${id}`),
      apiFetch<StaffTeam[]>('/admin/teams'),
      apiFetch<StaffSkill[]>('/admin/skills'),
      apiFetch<StaffAttendanceRecord[]>(`/admin/staff/${id}/attendance`),
    ])
      .then(([detail, teamRows, skillRows, attendanceRows]) => {
        if (cancelled) return;
        setProfile(detail);
        setTeams(teamRows);
        setAllSkills(skillRows);
        setAttendance(attendanceRows);
        setDisplayAlias(detail.displayAlias);
        setTeamId(detail.teamId ?? '');
        setExecutorType(detail.executorType);
        setVerificationStatus(detail.verificationStatus);
        setStaffStatus(detail.status);
        setCapacity(detail.capacityPercent);
        setUserStatus(detail.user?.status ?? 'active');
        setCustomerCapability(
          detail.user?.capabilities?.some(
            (item) => item.capability === 'customer',
          ) ?? false,
        );
        setSelectedSkills(
          Object.fromEntries(
            (detail.skills ?? []).map((entry) => [
              entry.skillId,
              entry.level,
            ]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'دریافت پروفایل ممکن نشد.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function confirmAction(note: string) {
    if (!pending) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(pending.path, {
        method: 'PATCH',
        body: { ...pending.body, [pending.noteKey ?? 'note']: note },
      });
      setMessage(pending.success);
      setPending(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت تغییر ممکن نشد.');
      throw err;
    }
  }

  async function recalculatePerformance() {
    setError('');
    setMessage('');
    setRecalculating(true);
    try {
      await apiFetch(`/admin/staff/${id}/performance/recalculate`, {
        method: 'POST',
      });
      setMessage('شاخص‌ها و Snapshot امروز با موفقیت محاسبه شدند.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'محاسبه عملکرد ممکن نشد.');
    } finally {
      setRecalculating(false);
    }
  }

  if (error && !profile) return <ErrorBanner message={error} />;
  if (!profile) return <PageLoading />;

  const verified = profile.verificationStatus === 'approved';
  const hasCustomerCapability =
    profile.user?.capabilities?.some(
      (item) => item.capability === 'customer',
    ) ?? false;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SectionTitle subtitle={`${profile.publicHandlerCode} · ${profile.user?.phone ?? ''}`}>
          {profile.user?.fullName ?? profile.displayAlias}
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Badge color={profile.status === 'active' ? 'green' : 'yellow'}>
            {STATUS_LABELS[profile.status] ?? profile.status}
          </Badge>
          <Badge color={verified ? 'green' : 'yellow'}>
            {VERIFICATION_LABELS[profile.verificationStatus] ??
              profile.verificationStatus}
          </Badge>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="ظرفیت" value={`${profile.capacityPercent}٪`} />
        <Metric label="QC pass" value={`${Number(profile.qcPassRate).toFixed(0)}٪`} />
        <Metric
          label="تحویل به‌موقع"
          value={`${Number(profile.onTimeDeliveryRate).toFixed(0)}٪`}
        />
        <Metric label="ریسک عملکرد" value={Number(profile.riskScore).toFixed(0)} />
      </div>

      <div
        className="mb-4 flex gap-2 overflow-x-auto rounded-card border border-border bg-surface p-2"
        role="tablist"
        aria-label="بخش‌های پروفایل داخلی مجری"
      >
        {STAFF_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`shrink-0 rounded-control px-4 py-2 text-sm font-bold transition-colors ${activeTab === tab.value ? 'bg-accent text-fg-on-accent' : 'text-fg-muted hover:bg-bg-subtle hover:text-fg'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {activeTab === 'summary' && (
          <Card>
          <h3 className="font-bold text-slate-800">مشخصات همکاری و احراز</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            مجری تأییدنشده در تخصیص سفارش قابل انتخاب نیست.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="نام نمایشی">
              <input
                className={inputClass}
                value={displayAlias}
                onChange={(event) => setDisplayAlias(event.target.value)}
              />
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
            <Field label="وضعیت احراز صلاحیت">
              <select
                className={inputClass}
                value={verificationStatus}
                onChange={(event) => setVerificationStatus(event.target.value)}
              >
                {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              setPending({
                title: 'ثبت تغییرات پروفایل مجری',
                description:
                  'نوع همکاری، تیم و وضعیت احراز روی امکان تخصیص سفارش اثر دارد.',
                impacts: [
                  'مجری تأییدنشده از تخصیص جدید کنار گذاشته می‌شود.',
                  'تمام تغییرات در Audit ثبت می‌شوند.',
                ],
                confirmLabel: 'ثبت تغییرات',
                tone: 'primary',
                path: `/admin/staff/${id}/profile`,
                body: {
                  displayAlias,
                  teamId: teamId || null,
                  executorType,
                  verificationStatus,
                },
                success: 'مشخصات همکاری و احراز به‌روزرسانی شد.',
              })
            }
          >
            ذخیره مشخصات
          </Button>
          </Card>
        )}

        {activeTab === 'capacity' && (
          <Card>
          <h3 className="font-bold text-slate-800">وضعیت کاری و ظرفیت</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            ظرفیت ۱۰۰٪ یا بیشتر، وضعیت را خودکار روی بیش‌ازظرفیت می‌گذارد.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="وضعیت کاری">
              <select
                className={inputClass}
                value={staffStatus}
                onChange={(event) => setStaffStatus(event.target.value)}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button
                variant={staffStatus === 'blocked' ? 'danger' : 'secondary'}
                onClick={() =>
                  setPending({
                    title: 'تغییر وضعیت کاری مجری',
                    description:
                      'وضعیت کاری در صف تخصیص و امکان فعالیت مجری اثر مستقیم دارد.',
                    impacts: [
                      'حالت مسدود، نشست‌های فعال مجری را باطل می‌کند.',
                      'دلیل تصمیم در Audit نگهداری می‌شود.',
                    ],
                    confirmLabel: 'تغییر وضعیت',
                    tone: staffStatus === 'blocked' ? 'danger' : 'primary',
                    path: `/admin/staff/${id}/status`,
                    body: { status: staffStatus },
                    success: 'وضعیت کاری به‌روزرسانی شد.',
                  })
                }
              >
                ثبت وضعیت
              </Button>
            </div>
            <Field label={`ظرفیت فعلی: ${capacity}٪`}>
              <input
                className="w-full accent-emerald-600"
                type="range"
                min="0"
                max="100"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() =>
                  setPending({
                    title: 'ثبت ظرفیت جدید',
                    description:
                      'یک snapshot ظرفیت همراه تعداد سفارش‌های فعال ذخیره می‌شود.',
                    impacts: [
                      'ظرفیت در تصمیم تخصیص سفارش استفاده می‌شود.',
                      'رسیدن به ۱۰۰٪ هشدار بیش‌ازظرفیت ایجاد می‌کند.',
                    ],
                    confirmLabel: 'ثبت ظرفیت',
                    tone: 'primary',
                    path: `/admin/staff/${id}/capacity`,
                    body: { capacityPercent: capacity },
                    success: 'ظرفیت و snapshot جدید ثبت شد.',
                  })
                }
              >
                ذخیره ظرفیت
              </Button>
            </div>
          </div>
          </Card>
        )}

        {activeTab === 'skills' && (
          <Card className="xl:col-span-2">
          <h3 className="font-bold text-slate-800">مهارت‌ها و سطح تسلط</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            سطح ۱ مقدماتی و سطح ۵ خبره است. تخصص با دسته خدمت در تخصیص کنترل می‌شود.
          </p>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {allSkills.length === 0 && (
              <p className="text-sm text-slate-400">
                ابتدا از صفحه فهرست کارکنان مهارت تعریف کنید.
              </p>
            )}
            {allSkills.map((skill) => {
              const selected = selectedSkills[skill.id] !== undefined;
              return (
                <div
                  key={skill.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-slate-100 p-3"
                >
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        setSelectedSkills((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[skill.id] = 3;
                          else delete next[skill.id];
                          return next;
                        })
                      }
                    />
                    <span>
                      {skill.name}
                      {skill.category ? ` · ${skill.category}` : ''}
                    </span>
                  </label>
                  {selected && (
                    <select
                      aria-label={`سطح ${skill.name}`}
                      className={`${inputClass} w-24`}
                      value={selectedSkills[skill.id]}
                      onChange={(event) =>
                        setSelectedSkills((current) => ({
                          ...current,
                          [skill.id]: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          سطح {level}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() =>
              setPending({
                title: 'به‌روزرسانی مهارت‌های مجری',
                description:
                  'فهرست فعلی مهارت‌ها با انتخاب‌های جدید جایگزین می‌شود.',
                impacts: [
                  'مهارت حذف‌شده دیگر در پیشنهاد تخصیص لحاظ نمی‌شود.',
                  'سطح هر مهارت از ۱ تا ۵ ذخیره می‌شود.',
                ],
                confirmLabel: 'ذخیره مهارت‌ها',
                tone: 'primary',
                path: `/admin/staff/${id}/skills`,
                body: {
                  skills: Object.entries(selectedSkills).map(
                    ([skillId, level]) => ({ skillId, level }),
                  ),
                },
                success: 'مهارت‌های مجری به‌روزرسانی شد.',
              })
            }
          >
            ذخیره مهارت‌ها
          </Button>
          </Card>
        )}

        {activeTab === 'capacity' && (
          <Card>
          <h3 className="font-bold text-slate-800">حضور روزانه</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            برای هر روز فقط یک رکورد نگهداری می‌شود و ثبت دوباره همان روز را اصلاح می‌کند.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="تاریخ">
              <input
                className={inputClass}
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
              />
            </Field>
            <Field label="وضعیت حضور">
              <select
                className={inputClass}
                value={attendanceStatus}
                onChange={(event) => setAttendanceStatus(event.target.value)}
              >
                {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="توضیح اختیاری">
              <input
                className={inputClass}
                value={attendanceNote}
                onChange={(event) => setAttendanceNote(event.target.value)}
                placeholder="شیفت، علت مرخصی یا توضیح داخلی"
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() =>
                  setPending({
                    title: 'ثبت وضعیت حضور',
                    description: `وضعیت ${workDate} برای این مجری ثبت یا اصلاح می‌شود.`,
                    impacts: [
                      'رکورد قبلی همین تاریخ در صورت وجود جایگزین می‌شود.',
                      'ثبت‌کننده و دلیل تصمیم در Audit قابل پیگیری است.',
                    ],
                    confirmLabel: 'ثبت حضور',
                    tone: 'primary',
                    path: `/admin/staff/${id}/attendance`,
                    body: {
                      workDate,
                      status: attendanceStatus,
                      note: attendanceNote || undefined,
                    },
                    noteKey: 'reason',
                    success: 'وضعیت حضور ثبت شد.',
                  })
                }
              >
                ثبت حضور
              </Button>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h4 className="text-sm font-bold text-slate-700">۳۰ روز اخیر</h4>
            {attendance.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">رکوردی ثبت نشده است.</p>
            ) : (
              <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto text-sm">
                {attendance.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span>{new Date(record.workDate).toLocaleDateString('fa-IR')}</span>
                    <span className="text-slate-500">
                      {ATTENDANCE_LABELS[record.status] ?? record.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </Card>
        )}

        {activeTab === 'summary' && (
          <Card>
          <h3 className="font-bold text-slate-800">دسترسی حساب</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            تغییر دسترسی همه نشست‌های فعال را باطل می‌کند تا سیاست جدید فوری اعمال شود.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="وضعیت حساب کاربری">
              <select
                className={inputClass}
                value={userStatus}
                onChange={(event) => setUserStatus(event.target.value)}
              >
                <option value="active">فعال</option>
                <option value="pending_verification">در انتظار تأیید</option>
                <option value="suspended">تعلیق موقت</option>
                <option value="blocked">مسدود</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-control border border-slate-100 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={customerCapability}
                onChange={(event) => setCustomerCapability(event.target.checked)}
              />
              قابلیت استفاده هم‌زمان به‌عنوان مشتری
            </label>
          </div>
          <div className="mt-3 rounded-control bg-slate-50 p-3 text-xs leading-6 text-slate-500">
            دسترسی فعلی: حساب {profile.user?.status ?? 'نامشخص'}؛ قابلیت مشتری{' '}
            {hasCustomerCapability ? 'فعال' : 'غیرفعال'}.
          </div>
          <Button
            className="mt-4"
            variant={userStatus === 'blocked' ? 'danger' : 'secondary'}
            onClick={() =>
              setPending({
                title: 'تغییر دسترسی حساب مجری',
                description:
                  'این عملیات وضعیت ورود و قابلیت چندنقشی حساب را تغییر می‌دهد.',
                impacts: [
                  'تمام نشست‌های فعال حساب باطل می‌شوند.',
                  'حساب تعلیق یا مسدودشده امکان ورود نخواهد داشت.',
                ],
                confirmLabel: 'اعمال دسترسی',
                tone: userStatus === 'blocked' ? 'danger' : 'primary',
                path: `/admin/staff/${id}/access`,
                body: { userStatus, customerCapability },
                success: 'دسترسی حساب به‌روزرسانی و نشست‌ها باطل شد.',
              })
            }
          >
            اعمال دسترسی
          </Button>
          </Card>
        )}

        {activeTab === 'performance' && (
          <Card className="xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800">روند عملکرد مجری</h3>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  Snapshotهای ثبت‌شده، تغییر کیفیت و ریسک عملکرد را در طول زمان نشان می‌دهند.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={Number(profile.riskScore) >= 50 ? 'red' : 'green'}>
                  ریسک فعلی: {Number(profile.riskScore).toFixed(0)}
                </Badge>
                <Button
                  variant="secondary"
                  disabled={recalculating}
                  onClick={() => void recalculatePerformance()}
                >
                  {recalculating ? 'در حال محاسبه…' : 'محاسبه اکنون'}
                </Button>
              </div>
            </div>
            {profile.performanceSnapshots.length === 0 ? (
              <div className="mt-4 rounded-control bg-slate-50 p-4 text-sm text-slate-500">
                هنوز Snapshot عملکردی ثبت نشده است؛ Job روزانه یا دکمه «محاسبه اکنون» اولین Snapshot را می‌سازد.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                      <th className="px-3 py-2 font-medium">دوره</th>
                      <th className="px-3 py-2 font-medium">فعال / تکمیل</th>
                      <th className="px-3 py-2 font-medium">به‌موقع</th>
                      <th className="px-3 py-2 font-medium">QC pass</th>
                      <th className="px-3 py-2 font-medium">امتیاز</th>
                      <th className="px-3 py-2 font-medium">شکایت / تشکر</th>
                      <th className="px-3 py-2 font-medium">ریسک</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.performanceSnapshots.map((snapshot) => (
                      <tr key={snapshot.id} className="border-b border-slate-50">
                        <td className="px-3 py-3 text-slate-600">
                          {new Date(snapshot.periodEnd).toLocaleDateString('fa-IR')}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {snapshot.activeOrders} / {snapshot.completedOrders}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {Number(snapshot.onTimeRate).toFixed(0)}٪
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {Number(snapshot.qcPassRate).toFixed(0)}٪
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {Number(snapshot.avgCustomerRating).toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {snapshot.complaintCount} / {snapshot.complimentCount}
                        </td>
                        <td className="px-3 py-3">
                          <Badge color={Number(snapshot.riskScore) >= 50 ? 'red' : 'green'}>
                            {Number(snapshot.riskScore).toFixed(0)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'feedback' && (
          <Card className="xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <FeedbackMetric
                label="امتیازها"
                value={profile.feedback.filter((item) => item.feedbackType === 'rating').length}
                color="blue"
              />
              <FeedbackMetric
                label="شکایت‌ها"
                value={profile.feedback.filter((item) => item.feedbackType === 'complaint').length}
                color="red"
              />
              <FeedbackMetric
                label="تشکرها"
                value={profile.feedback.filter((item) => item.feedbackType === 'compliment').length}
                color="green"
              />
            </div>
            <h3 className="mt-5 font-bold text-slate-800">امتیاز، شکایت و تشکر</h3>
            {profile.feedback.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">بازخوردی برای این مجری ثبت نشده است.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {profile.feedback.map((item) => (
                  <li key={item.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          color={
                            item.feedbackType === 'complaint'
                              ? 'red'
                              : item.feedbackType === 'compliment'
                                ? 'green'
                                : 'blue'
                          }
                        >
                          {FEEDBACK_LABELS[item.feedbackType] ?? item.feedbackType}
                        </Badge>
                        <span className="text-sm font-bold text-slate-700">{item.code}</span>
                        {item.rating != null && (
                          <span className="text-sm text-amber-600">{item.rating} از ۵</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(item.createdAt).toLocaleString('fa-IR')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      سفارش {item.order.code} — {item.order.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">ثبت‌کننده: {item.customer.fullName}</p>
                    {item.comment && <p className="mt-2 text-sm leading-7 text-slate-700">{item.comment}</p>}
                    {item.resolutionNote && (
                      <div className="mt-2 rounded-control bg-emerald-50 p-3 text-sm text-emerald-800">
                        نتیجه رسیدگی: {item.resolutionNote}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {activeTab === 'history' && (
          <Card className="xl:col-span-2">
            <h3 className="font-bold text-slate-800">تاریخچه تغییرات داخلی</h3>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              تصمیم‌های مدیریتی همراه ثبت‌کننده، زمان و داده قبل/بعد نگهداری می‌شوند.
            </p>
            {profile.history.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">رویدادی ثبت نشده است.</p>
            ) : (
              <ol className="mt-4 space-y-3 border-r-2 border-slate-100 pr-5">
                {profile.history.map((entry) => (
                  <li key={entry.id} className="relative rounded-control border border-slate-100 p-4">
                    <span className="absolute -right-[27px] top-5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-700">
                        {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                      </p>
                      <span className="text-xs text-slate-400">
                        {new Date(entry.createdAt).toLocaleString('fa-IR')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      توسط {entry.actor?.fullName ?? entry.actorRole ?? 'سیستم'}
                    </p>
                    <details className="mt-3 text-xs text-slate-500">
                      <summary className="cursor-pointer font-medium text-slate-600">مشاهده داده قبل و بعد</summary>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2" dir="ltr">
                        <pre className="overflow-x-auto rounded-control bg-slate-50 p-3 text-left">{formatAuditPayload(entry.before)}</pre>
                        <pre className="overflow-x-auto rounded-control bg-slate-50 p-3 text-left">{formatAuditPayload(entry.after)}</pre>
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}

        {activeTab === 'orders' && (
          <Card className="xl:col-span-2">
          <h3 className="font-bold text-slate-800">سفارش‌های مرتبط</h3>
          {profile.assignments?.length ? (
            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
              {profile.assignments.map((assignment, index) => (
                <li
                  key={assignment.id ?? index}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>
                    {assignment.order.title}
                    <small className="mr-2 text-slate-400">
                      {assignment.order.code}
                    </small>
                  </span>
                  <span className="text-xs text-slate-400">
                    {assignment.order.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">سفارشی ثبت نشده است.</p>
          )}
          </Card>
        )}
      </div>

      <ConfirmationModal
        open={Boolean(pending)}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        impacts={pending?.impacts ?? []}
        confirmLabel={pending?.confirmLabel ?? 'تأیید'}
        tone={pending?.tone}
        onCancel={() => setPending(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

function FeedbackMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'red' | 'green';
}) {
  return (
    <div className="rounded-control border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        <Badge color={color}>{value}</Badge>
      </div>
    </div>
  );
}

function formatAuditPayload(value: unknown) {
  if (value == null) return 'بدون داده';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'نمایش داده ممکن نیست';
  }
}
