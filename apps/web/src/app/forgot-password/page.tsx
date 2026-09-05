'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorBanner, Field, inputClass } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { PasswordInput } from '@/components/password-input';
import { GuestOnly } from '@/components/guest-only';

type Step = 'request' | 'reset' | 'success';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{
        message: string;
        expiresInSeconds: number;
        devOtp?: string;
      }>('/auth/password/forgot', {
        method: 'POST',
        auth: false,
        body: { phone },
      });
      if (result.devOtp) {
        setDevelopmentCode(result.devOtp);
        setCode(result.devOtp);
      }
      setStep('reset');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'ارسال کد بازیابی انجام نشد.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== passwordConfirmation) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/password/reset', {
        method: 'POST',
        auth: false,
        body: { phone, code, password },
      });
      setStep('success');
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'تغییر رمز عبور انجام نشد.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <GuestOnly>
      <main id="main-content" className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-heading-md font-extrabold leading-heading text-fg">
          بازیابی رمز عبور
        </h1>

        {step === 'request' && (
          <>
            <p className="mb-6 text-sm leading-prose text-fg-muted">
              شماره موبایل حساب را وارد کنید. اگر حساب فعالی وجود داشته باشد،
              کد بازیابی برای آن ارسال می‌شود.
            </p>
            <form onSubmit={requestCode} className="flex flex-col gap-4">
              <Field label="شماره موبایل">
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="09xxxxxxxxx"
                  autoComplete="tel"
                  inputMode="tel"
                  dir="ltr"
                  required
                />
              </Field>
              {error && <ErrorBanner message={error} />}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'در حال ارسال...' : 'ارسال کد بازیابی'}
              </Button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <p className="mb-6 text-sm leading-prose text-fg-muted">
              کد ارسال‌شده به <span dir="ltr">{phone}</span> و رمز جدید را
              وارد کنید.
            </p>
            {developmentCode && (
              <p className="mb-4 rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning">
                کد محیط توسعه: <b dir="ltr">{developmentCode}</b>
              </p>
            )}
            <form onSubmit={resetPassword} className="flex flex-col gap-4">
              <Field label="کد شش‌رقمی">
                <input
                  className={inputClass}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  dir="ltr"
                  required
                />
              </Field>
              <Field
                label="رمز عبور جدید"
                hint="حداقل ۱۰ کاراکتر؛ شامل حرف کوچک، حرف بزرگ، عدد و نماد"
              >
                <PasswordInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </Field>
              <Field label="تکرار رمز عبور جدید">
                <PasswordInput
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </Field>
              {error && <ErrorBanner message={error} />}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'در حال تغییر...' : 'ثبت رمز عبور جدید'}
              </Button>
              <button
                type="button"
                onClick={() => setStep('request')}
                className="text-sm font-bold text-accent hover:underline"
              >
                اصلاح شماره یا ارسال دوباره کد
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div role="status" className="space-y-4">
            <p className="rounded-control border border-success-border bg-success-subtle px-4 py-3 text-sm leading-prose text-success">
              رمز عبور با موفقیت تغییر کرد و نشست‌های قبلی حساب باطل شدند.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-control bg-accent px-4 py-2 text-sm font-bold text-fg-on-accent hover:bg-accent-hover"
            >
              ورود با رمز جدید
            </Link>
          </div>
        )}

        {step !== 'success' && (
          <p className="mt-5 text-center text-sm text-fg-muted">
            <Link href="/login" className="font-bold text-accent hover:underline">
              بازگشت به صفحه ورود
            </Link>
          </p>
        )}
      </Card>
      </main>
    </GuestOnly>
  );
}
