'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button, Card, ErrorBanner, Field, inputClass } from '@/components/ui';
import { roleHomePath } from '@/lib/role-paths';

export default function LoginPage() {
  const { loginWithPassword } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-extrabold text-fg">
          ورود به نیازت با ما
        </h1>
        <p className="mb-6 text-sm text-fg-muted">
          با شماره موبایل و رمز عبور وارد شوید.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="شماره موبایل">
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxxx"
              dir="ltr"
              required
            />
          </Field>
          <Field label="رمز عبور">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && <ErrorBanner message={error} />}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'در حال ورود...' : 'ورود'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-fg-muted">
          حساب ندارید؟{' '}
          <Link
            href="/register"
            className="font-medium text-fg hover:underline"
          >
            ثبت‌نام
          </Link>
        </p>
      </Card>
    </div>
  );
}
