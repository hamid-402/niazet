'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button, LinkButton } from './ui';
import { roleHomePath } from '@/lib/role-paths';

export function PublicNav() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="text-lg font-extrabold text-slate-900">
          نیازت با ما
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/services" className="hover:text-slate-900">
            خدمات
          </Link>
          <Link href="/#how-it-works" className="hover:text-slate-900">
            روند کار
          </Link>
          <Link href="/#faq" className="hover:text-slate-900">
            سوالات پرتکرار
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <LinkButton href={roleHomePath(user)} variant="secondary">
                میز کار
              </LinkButton>
              <Button variant="ghost" onClick={() => logout()}>
                خروج
              </Button>
            </>
          ) : (
            <>
              <LinkButton href="/login" variant="secondary">
                ورود
              </LinkButton>
              <LinkButton href="/register">ثبت‌نام</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
