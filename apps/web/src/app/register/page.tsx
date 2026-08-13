'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button, Card, ErrorBanner, Field, inputClass } from '@/components/ui';
import { roleHomePath } from '@/lib/role-paths';
import { PasswordInput } from '@/components/password-input';

export default function RegisterPage() {
  const { register, loginWithOtp } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await register(phone, fullName, password || undefined);
      setDevOtp(result.devOtp ?? '');
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت‌نام');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginWithOtp(phone, code, 'register');
      router.push(roleHomePath(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کد تایید نادرست است.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-extrabold text-fg">
          ثبت‌نام در نیازت با ما
        </h1>
        <p className="mb-6 text-sm text-fg-muted">
          {step === 'form'
            ? 'اطلاعات خود را وارد کنید.'
            : 'کد تایید ارسال‌شده به موبایل را وارد کنید.'}
        </p>

        {step === 'form' ? (
          <form onSubmit={onSubmitForm} className="flex flex-col gap-4">
            <Field label="نام نمایشی">
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>
            <Field label="شماره موبایل">
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                required
              />
            </Field>
            <Field
              label="رمز عبور (اختیاری)"
              hint="حداقل ۱۰ کاراکتر شامل حرف بزرگ، حرف کوچک، عدد و نماد؛ یا خالی بگذارید و با OTP وارد شوید."
            >
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            {error && <ErrorBanner message={error} />}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'در حال ارسال...' : 'ادامه'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmitOtp} className="flex flex-col gap-4">
            {devOtp && (
              <p className="rounded-control bg-warning-subtle px-3 py-2 text-xs text-warning">
                (محیط توسعه) کد تایید: <b dir="ltr">{devOtp}</b>
              </p>
            )}
            <Field label="کد تایید">
              <input
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </Field>

            {error && <ErrorBanner message={error} />}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'در حال تایید...' : 'تایید و ورود'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-fg-muted">
          حساب دارید؟{' '}
          <Link href="/login" className="font-medium text-fg hover:underline">
            ورود
          </Link>
        </p>
      </Card>
    </div>
  );
}
