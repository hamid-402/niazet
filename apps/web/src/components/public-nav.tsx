'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button, LinkButton } from './ui';
import { ThemeToggle } from './theme-toggle';
import { roleHomePath } from '@/lib/role-paths';

export function PublicNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-accent">
            <Sparkles size={16} strokeWidth={2.2} />
          </span>
          نیازت با ما
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          <Link href="/services" className="transition hover:text-foreground">
            خدمات
          </Link>
          <Link href="/#how-it-works" className="transition hover:text-foreground">
            روند کار
          </Link>
          <Link href="/#faq" className="transition hover:text-foreground">
            سوالات پرتکرار
          </Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
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
