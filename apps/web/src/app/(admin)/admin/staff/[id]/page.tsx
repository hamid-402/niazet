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
}

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

export default function AdminStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<StaffDetail | null>(null);
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

      <div className="grid gap-4 xl:grid-cols-2">
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

        <Card>
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

        <Card>
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
