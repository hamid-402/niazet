'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button, Card, ErrorBanner, Field, inputClass } from '@/components/ui';
import { roleHomePath } from '@/lib/role-paths';

type LoginMode = 'password' | 'otp';

interface DevelopmentAccount {
  label: string;
  phone: string;
  password: string;
}

export default function LoginPage() {
  const { loginWithPassword, loginWithOtp, requestOtp } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('password');
  const [otpRequested, setOtpRequested] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [developmentAccounts, setDevelopmentAccounts] = useState<DevelopmentAccount[]>([]);

  useEffect(() => {
    fetch('/api/development/demo-accounts', { cache: 'no-store' })
      .then(async (response) => response.status === 200 ? response.json() as Promise<{ accounts: DevelopmentAccount[] }> : null)
      .then((result) => setDevelopmentAccounts(result?.accounts ?? []))
      .catch(() => setDevelopmentAccounts([]));
  }, []);

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError('');
    setOtpRequested(false);
    setCode('');
    setDevOtp('');
  }

  async function onPasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginWithPassword(phone, password);
      router.push(roleHomePath(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  }

  async function onRequestOtp(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp(phone, 'login');
      setDevOtp(result.devOtp ?? '');
      setOtpRequested(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ارسال کد ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }

  async function onOtpSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginWithOtp(phone, code, 'login');
      router.push(roleHomePath(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کد تأیید نادرست است.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-extrabold text-fg">ورود به نیازت با ما</h1>
        <p className="mb-5 text-sm text-fg-muted">با رمز عبور یا کد یکبار مصرف وارد شوید.</p>

        <div className="mb-5 grid grid-cols-2 rounded-control bg-bg-subtle p-1" role="tablist" aria-label="روش ورود">
          <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => switchMode('password')} className={`rounded-control px-3 py-2 text-sm font-bold ${mode === 'password' ? 'bg-surface text-fg shadow-elevation-1' : 'text-fg-muted'}`}>رمز عبور</button>
          <button type="button" role="tab" aria-selected={mode === 'otp'} onClick={() => switchMode('otp')} className={`rounded-control px-3 py-2 text-sm font-bold ${mode === 'otp' ? 'bg-surface text-fg shadow-elevation-1' : 'text-fg-muted'}`}>کد یکبار مصرف</button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4">
            <Field label="شماره موبایل">
              <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09xxxxxxxxx" inputMode="tel" autoComplete="tel" dir="ltr" required />
            </Field>
            <Field label="رمز عبور">
              <input type="password" className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </Field>
            <Link href="/forgot-password" className="-mt-2 text-sm font-bold text-accent hover:underline">رمز عبور را فراموش کرده‌اید؟</Link>
            {error && <ErrorBanner message={error} />}
            <Button type="submit" disabled={loading} className="w-full">{loading ? 'در حال ورود...' : 'ورود'}</Button>
          </form>
        ) : otpRequested ? (
          <form onSubmit={onOtpSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">کد ارسال‌شده به <b dir="ltr">{phone}</b> را وارد کنید.</p>
            {devOtp && <p className="rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning">محیط توسعه — کد ورود: <b dir="ltr">{devOtp}</b></p>}
            <Field label="کد تأیید">
              <input className={inputClass} value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} required />
            </Field>
            {error && <ErrorBanner message={error} />}
            <Button type="submit" disabled={loading} className="w-full">{loading ? 'در حال تأیید...' : 'تأیید و ورود'}</Button>
            <Button type="button" variant="ghost" onClick={() => setOtpRequested(false)}>تغییر شماره موبایل</Button>
          </form>
        ) : (
          <form onSubmit={onRequestOtp} className="flex flex-col gap-4">
            <Field label="شماره موبایل" hint="در محیط توسعه، کد روی همین صفحه نمایش داده می‌شود.">
              <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09xxxxxxxxx" inputMode="tel" autoComplete="tel" dir="ltr" required />
            </Field>
            {error && <ErrorBanner message={error} />}
            <Button type="submit" disabled={loading} className="w-full">{loading ? 'در حال ارسال...' : 'دریافت کد ورود'}</Button>
          </form>
        )}

        {developmentAccounts.length > 0 && (
          <section className="mt-6 border-t border-border pt-5" aria-labelledby="development-accounts-title">
            <div className="mb-3">
              <h2 id="development-accounts-title" className="text-sm font-extrabold text-fg">حساب‌های نمایشی توسعه</h2>
              <p className="mt-1 text-xs text-fg-muted">یک نقش را انتخاب کنید؛ اطلاعات ورود فقط پر می‌شود و ورود با انتخاب شما انجام خواهد شد.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {developmentAccounts.map((account) => (
                <Button key={account.phone} type="button" variant="secondary" className="px-2 text-xs" onClick={() => { switchMode('password'); setPhone(account.phone); setPassword(account.password); }}>{account.label}</Button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-fg-muted">رمز حساب پس از انتخاب نقش، به‌صورت خودکار در فرم قرار می‌گیرد.</p>
          </section>
        )}

        <p className="mt-5 text-center text-sm text-fg-muted">حساب ندارید؟{' '}<Link href="/register" className="font-medium text-fg hover:underline">ثبت‌نام</Link></p>
      </Card>
    </div>
  );
}
