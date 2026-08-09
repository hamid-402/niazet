'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button, LinkButton } from './ui';
import { roleHomePath } from '@/lib/role-paths';
import { ThemeSwitcher } from './theme-switcher';

export function PublicNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="text-lg font-extrabold text-fg">
          نیازت با ما
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-fg-muted md:flex">
          <Link href="/services" className="transition-colors hover:text-fg">
            خدمات
          </Link>
          <Link
            href="/#how-it-works"
            className="transition-colors hover:text-fg"
          >
            روند کار
          </Link>
          <Link href="/#faq" className="transition-colors hover:text-fg">
            سوالات پرتکرار
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeSwitcher variant="compact" />
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
