"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  LinkButton,
  PageLoading,
  SectionTitle,
  inputClass,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format";

type AccountType = "individual" | "company";

interface CustomerProfile {
  fullName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  accountType: AccountType;
  nationalId: string | null;
  companyName: string | null;
  companyNationalId: string | null;
  companyRegistrationNumber: string | null;
  economicCode: string | null;
  billingRecipientName: string | null;
  invoiceEmail: string | null;
  province: string | null;
  city: string | null;
  addressLine: string | null;
  postalCode: string | null;
  marketingConsent: boolean;
  analyticsConsent: boolean;
  privacyPolicyAcceptedAt: string | null;
  completionPercent: number;
}

interface NotificationPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

interface PrivacyRequest {
  id: string;
  requestType: "data_export" | "account_deletion";
  status: "pending" | "completed" | "rejected";
  reason: string | null;
  requestedAt: string;
  completedAt: string | null;
  decisionNote: string | null;
}

const EMPTY_PROFILE: CustomerProfile = {
  fullName: "",
  phone: "",
  email: null,
  createdAt: "",
  accountType: "individual",
  nationalId: null,
  companyName: null,
  companyNationalId: null,
  companyRegistrationNumber: null,
  economicCode: null,
  billingRecipientName: null,
  invoiceEmail: null,
  province: null,
  city: null,
  addressLine: null,
  postalCode: null,
  marketingConsent: false,
  analyticsConsent: false,
  privacyPolicyAcceptedAt: null,
  completionPercent: 0,
};

const NAV = [
  { href: "/dashboard", label: "بازگشت به پنل" },
  { href: "/account/profile", label: "پروفایل و حریم داده" },
  { href: "/account/security", label: "نشست‌ها و امنیت" },
];

function nullable(value: string | null) {
  return value ?? "";
}

export default function AccountProfilePage() {
  return (
    <RequireRole roles={["customer"]}>
      <ProfileContent />
    </RequireRole>
  );
}

function ProfileContent() {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState<CustomerProfile>(EMPTY_PROFILE);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(
    null,
  );
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<CustomerProfile>("/customer/account/profile", { dedupe: false }),
      apiFetch<NotificationPreference>("/notifications/preferences", {
        dedupe: false,
      }),
      apiFetch<PrivacyRequest[]>("/customer/account/privacy/requests", {
        dedupe: false,
      }),
    ])
      .then(([profileResult, preferenceResult, requestResult]) => {
        setProfile(profileResult);
        setForm(profileResult);
        setPreferences(preferenceResult);
        setRequests(requestResult);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "دریافت اطلاعات حساب ممکن نشد.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof CustomerProfile>(
    key: K,
    value: CustomerProfile[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccess("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!preferences) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const [updated] = await Promise.all([
        apiFetch<CustomerProfile>("/customer/account/profile", {
          method: "PUT",
          body: {
            fullName: form.fullName,
            email: nullable(form.email),
            accountType: form.accountType,
            nationalId: nullable(form.nationalId),
            companyName: nullable(form.companyName),
            companyNationalId: nullable(form.companyNationalId),
            companyRegistrationNumber: nullable(
              form.companyRegistrationNumber,
            ),
            economicCode: nullable(form.economicCode),
            billingRecipientName: nullable(form.billingRecipientName),
            invoiceEmail: nullable(form.invoiceEmail),
            province: nullable(form.province),
            city: nullable(form.city),
            addressLine: nullable(form.addressLine),
            postalCode: nullable(form.postalCode),
            marketingConsent: form.marketingConsent,
            analyticsConsent: form.analyticsConsent,
          },
        }),
        apiFetch("/notifications/preferences", {
          method: "PUT",
          body: {
            inAppEnabled: preferences.inAppEnabled,
            emailEnabled: preferences.emailEnabled,
            smsEnabled: preferences.smsEnabled,
          },
        }),
      ]);
      setProfile(updated);
      setForm(updated);
      await refreshUser();
      setSuccess("اطلاعات حساب و تنظیمات دریافت با موفقیت ذخیره شد.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره اطلاعات ممکن نشد.");
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setError("");
    try {
      const data = await apiFetch<Record<string, unknown>>(
        "/customer/account/privacy/export",
        { method: "POST", dedupe: false },
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `niazat-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setRequests(
        await apiFetch<PrivacyRequest[]>("/customer/account/privacy/requests", {
          dedupe: false,
        }),
      );
      setSuccess("نسخه داده‌های حساب آماده و دانلود شد.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت خروجی ممکن نشد.");
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setDeleting(true);
    setError("");
    try {
      await apiFetch("/customer/account/privacy/deletion-request", {
        method: "POST",
        body: { reason: deletionReason },
      });
      setRequests(
        await apiFetch<PrivacyRequest[]>("/customer/account/privacy/requests", {
          dedupe: false,
        }),
      );
      setSuccess(
        "درخواست حذف ثبت شد. تا پایان بررسی تعهدات مالی، حساب فعال باقی می‌ماند.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت درخواست ممکن نشد.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell navItems={NAV} title="پروفایل مشتری">
        <PageLoading />
      </AppShell>
    );
  }

  return (
    <AppShell navItems={NAV} title="پروفایل مشتری">
      <SectionTitle subtitle="اطلاعات هویتی، حقوقی، صدور فاکتور و انتخاب‌های حریم خصوصی">
        حساب من
      </SectionTitle>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {success && (
        <p role="status" className="mb-4 rounded-control border border-success-border bg-success-subtle px-4 py-3 text-sm text-success">
          {success}
        </p>
      )}

      <form onSubmit={save} className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-extrabold text-fg">تکمیل پروفایل</p>
            <p className="mt-1 text-sm text-fg-muted">
              اطلاعات کامل، صدور فاکتور و پیگیری سفارش را دقیق‌تر می‌کند.
            </p>
          </div>
          <div className="min-w-52">
            <div className="mb-2 flex justify-between text-xs text-fg-muted">
              <span>{form.completionPercent.toLocaleString("fa-IR")}٪</span>
              <span>وضعیت تکمیل</span>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-bg-subtle">
              <div className="h-full rounded-pill bg-accent" style={{ width: `${form.completionPercent}%` }} />
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-extrabold text-fg">اطلاعات اصلی</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="نوع حساب">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-control border border-border p-3 text-sm text-fg">
                  <input type="radio" name="accountType" checked={form.accountType === "individual"} onChange={() => update("accountType", "individual")} />
                  شخص حقیقی
                </label>
                <label className="flex items-center gap-2 rounded-control border border-border p-3 text-sm text-fg">
                  <input type="radio" name="accountType" checked={form.accountType === "company"} onChange={() => update("accountType", "company")} />
                  شخص حقوقی
                </label>
              </div>
            </Field>
            <Field label="نام و نام خانوادگی / نماینده حساب">
              <input className={inputClass} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
            </Field>
            <Field label="شماره موبایل" hint="شماره تأییدشده حساب از این صفحه قابل تغییر نیست.">
              <input className={`${inputClass} bg-bg-subtle`} value={form.phone} dir="ltr" readOnly />
            </Field>
            <Field label="ایمیل حساب">
              <input type="email" className={inputClass} value={nullable(form.email)} onChange={(event) => update("email", event.target.value)} autoComplete="email" dir="ltr" />
            </Field>
            {form.accountType === "individual" ? (
              <Field label="کد ملی" hint="۱۰ رقم بدون خط تیره">
                <input className={inputClass} value={nullable(form.nationalId)} onChange={(event) => update("nationalId", event.target.value)} inputMode="numeric" dir="ltr" maxLength={10} />
              </Field>
            ) : (
              <>
                <Field label="نام شرکت">
                  <input className={inputClass} value={nullable(form.companyName)} onChange={(event) => update("companyName", event.target.value)} required maxLength={150} />
                </Field>
                <Field label="شناسه ملی شرکت" hint="۱۱ رقم">
                  <input className={inputClass} value={nullable(form.companyNationalId)} onChange={(event) => update("companyNationalId", event.target.value)} inputMode="numeric" dir="ltr" required maxLength={11} />
                </Field>
                <Field label="شماره ثبت">
                  <input className={inputClass} value={nullable(form.companyRegistrationNumber)} onChange={(event) => update("companyRegistrationNumber", event.target.value)} dir="ltr" maxLength={30} />
                </Field>
                <Field label="کد اقتصادی">
                  <input className={inputClass} value={nullable(form.economicCode)} onChange={(event) => update("economicCode", event.target.value)} dir="ltr" maxLength={30} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-1 font-extrabold text-fg">نشانی و اطلاعات صدور فاکتور</h3>
          <p className="mb-4 text-sm text-fg-muted">این اطلاعات هنگام صدور روی فاکتور Snapshot می‌شود و فاکتورهای قبلی تغییر نمی‌کنند.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="نام دریافت‌کننده فاکتور">
              <input className={inputClass} value={nullable(form.billingRecipientName)} onChange={(event) => update("billingRecipientName", event.target.value)} autoComplete="name" maxLength={150} />
            </Field>
            <Field label="ایمیل دریافت فاکتور">
              <input type="email" className={inputClass} value={nullable(form.invoiceEmail)} onChange={(event) => update("invoiceEmail", event.target.value)} autoComplete="email" dir="ltr" />
            </Field>
            <Field label="استان">
              <input className={inputClass} value={nullable(form.province)} onChange={(event) => update("province", event.target.value)} autoComplete="address-level1" maxLength={100} />
            </Field>
            <Field label="شهر">
              <input className={inputClass} value={nullable(form.city)} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" maxLength={100} />
            </Field>
            <Field label="نشانی کامل">
              <textarea className={`${inputClass} min-h-24`} value={nullable(form.addressLine)} onChange={(event) => update("addressLine", event.target.value)} autoComplete="street-address" maxLength={500} />
            </Field>
            <Field label="کد پستی" hint="۱۰ رقم بدون خط تیره">
              <input className={inputClass} value={nullable(form.postalCode)} onChange={(event) => update("postalCode", event.target.value)} autoComplete="postal-code" inputMode="numeric" dir="ltr" maxLength={10} />
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-extrabold text-fg">اعلان‌ها و رضایت‌های اختیاری</h3>
          {preferences && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg">
                <input type="checkbox" checked={preferences.inAppEnabled} onChange={(event) => setPreferences({ ...preferences, inAppEnabled: event.target.checked })} />
                اعلان‌های ضروری داخل سایت
              </label>
              <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg">
                <input type="checkbox" checked={preferences.emailEnabled} onChange={(event) => setPreferences({ ...preferences, emailEnabled: event.target.checked })} />
                دریافت رویدادهای سفارش با ایمیل
              </label>
              <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg">
                <input type="checkbox" checked={preferences.smsEnabled} onChange={(event) => setPreferences({ ...preferences, smsEnabled: event.target.checked })} />
                دریافت رویدادهای سفارش با پیامک
              </label>
              <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg">
                <input type="checkbox" checked={form.marketingConsent} onChange={(event) => update("marketingConsent", event.target.checked)} />
                دریافت پیشنهادهای بازاریابی اختیاری
              </label>
              <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm text-fg md:col-span-2">
                <input type="checkbox" checked={form.analyticsConsent} onChange={(event) => update("analyticsConsent", event.target.checked)} />
                اجازه تحلیل اختیاری رفتار برای بهبود تجربه کاربری
              </label>
            </div>
          )}
          <p className="mt-3 text-xs leading-6 text-fg-subtle">عدم رضایت به بازاریابی یا تحلیل، دسترسی شما به خدمات اصلی را محدود نمی‌کند.</p>
        </Card>

        <div className="sticky bottom-4 z-sticky flex justify-end rounded-card border border-border bg-surface/95 p-3 shadow-elevation-3 backdrop-blur">
          <Button type="submit" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره همه تغییرات"}</Button>
        </div>
      </form>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-fg">امنیت حساب</h3>
            <p className="mt-1 text-sm text-fg-muted">نشست‌های فعال، دستگاه فعلی و خروج از دستگاه‌های دیگر را مدیریت کنید.</p>
          </div>
          <LinkButton href="/account/security" variant="secondary">مدیریت نشست‌ها</LinkButton>
        </div>
      </Card>

      <Card className="mt-5">
        <h3 className="font-extrabold text-fg">مرکز حریم داده</h3>
        <p className="mt-1 text-sm leading-6 text-fg-muted">می‌توانید نسخه قابل‌حمل داده‌های خود را دریافت کنید یا درخواست بررسی حذف حساب بدهید. حذف واقعی پس از بررسی تعهدات مالی و الزامات نگهداری قانونی انجام می‌شود.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportData()}>{exporting ? "در حال آماده‌سازی..." : "دانلود داده‌های من (JSON)"}</Button>
        </div>
        <div className="mt-5 rounded-control border border-danger-border bg-danger-subtle p-4">
          <p className="font-bold text-danger">درخواست حذف حساب</p>
          <textarea className={`${inputClass} mt-3 min-h-20`} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="دلیل درخواست (اختیاری)" maxLength={500} />
          <label className="mt-3 flex items-start gap-2 text-xs leading-6 text-danger">
            <input type="checkbox" checked={deletionAcknowledged} onChange={(event) => setDeletionAcknowledged(event.target.checked)} />
            متوجه‌ام که این درخواست بلافاصله داده‌های مالی و سفارش‌های قانونی را پاک نمی‌کند و ابتدا بررسی می‌شود.
          </label>
          <Button type="button" variant="danger" className="mt-3" disabled={!deletionAcknowledged || deleting || requests.some((request) => request.requestType === "account_deletion" && request.status === "pending")} onClick={() => void requestDeletion()}>
            {deleting ? "در حال ثبت..." : requests.some((request) => request.requestType === "account_deletion" && request.status === "pending") ? "درخواست در حال بررسی است" : "ثبت درخواست حذف حساب"}
          </Button>
        </div>

        {requests.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h4 className="mb-3 text-sm font-bold text-fg">سوابق درخواست‌های حریم داده</h4>
            <div className="space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-bg-subtle px-3 py-2 text-xs">
                  <span className="text-fg">{request.requestType === "data_export" ? "دریافت نسخه داده" : "حذف حساب"} · {formatDate(request.requestedAt)}</span>
                  <Badge color={request.status === "completed" ? "green" : request.status === "rejected" ? "red" : "yellow"}>{request.status === "completed" ? "تکمیل‌شده" : request.status === "rejected" ? "ردشده" : "در حال بررسی"}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      {profile?.privacyPolicyAcceptedAt && <p className="mt-4 text-xs text-fg-subtle">آخرین ثبت پذیرش سیاست حریم خصوصی: {formatDate(profile.privacyPolicyAcceptedAt)}</p>}
    </AppShell>
  );
}
