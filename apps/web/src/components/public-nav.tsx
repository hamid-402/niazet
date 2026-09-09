'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button, LinkButton } from './ui';
import { useCallback, useState } from 'react';
import { MobileDrawer } from './mobile-drawer';
import { roleHomePath } from '@/lib/role-paths';
import { ThemeSwitcher } from './theme-switcher';
import { BrandMark } from './brand-mark';
import { usePathname } from 'next/navigation';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-public-nav.module.css';

export function PublicNav() {
  const pathname = usePathname();
  const motion = useOrbitMotionPreference();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const publicLinks = [
    { href: '/services', label: 'خدمات' },
    { href: '/#how-it-works', label: 'روند کار' },
    { href: '/#faq', label: 'سوالات پرتکرار' },
    { href: '/status', label: 'وضعیت سرویس' },
  ];

  return (
    <header data-motion={motion ? 'on' : 'off'} className={`${styles.header} public-header sticky top-0 z-sticky border-b border-border bg-surface/90 backdrop-blur`}>
      <div className="page-container flex items-center justify-between py-4">
        <Link href="/" className="text-lg font-extrabold text-fg">
          <BrandMark />
        </Link>
        <nav className={`${styles.navigation} hidden items-center gap-6 text-sm font-medium text-fg-muted md:flex`} aria-label="ناوبری عمومی">
          {publicLinks.map((item) => <Link key={item.href} href={item.href} aria-current={!item.href.includes('#') && (pathname === item.href || pathname.startsWith(`${item.href}/`)) ? 'page' : undefined} className="transition-colors hover:text-fg">{item.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
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
        <div className="flex items-center gap-2 md:hidden">
          <ThemeSwitcher variant="compact" />
          <button type="button" aria-label="باز کردن منوی سایت" aria-expanded={mobileOpen} aria-controls="public-mobile-drawer" onClick={() => setMobileOpen(true)} className="rounded-control p-2 text-fg-muted hover:bg-bg-subtle">
            <svg viewBox="0 0 20 20" fill="none" className="icon-md" aria-hidden="true"><path stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="M3 5.5h14M3 10h14M3 14.5h14" /></svg>
          </button>
        </div>
      </div>
      <MobileDrawer id="public-mobile-drawer" open={mobileOpen} onClose={closeMobile} title="منوی سایت">
        <nav className="flex flex-col gap-1" aria-label="ناوبری عمومی موبایل">
          {publicLinks.map((item) => <Link key={item.href} href={item.href} aria-current={!item.href.includes('#') && (pathname === item.href || pathname.startsWith(`${item.href}/`)) ? 'page' : undefined} onClick={closeMobile} className="rounded-control px-3 py-3 text-sm font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg aria-[current=page]:bg-accent-subtle">{item.label}</Link>)}
        </nav>
        <div className="mt-auto grid gap-2 border-t border-border pt-5">
          {user ? <><LinkButton href={roleHomePath(user)}>میز کار</LinkButton><Button variant="secondary" onClick={() => { closeMobile(); void logout(); }}>خروج</Button></> : <><LinkButton href="/register">ثبت‌نام</LinkButton><LinkButton href="/login" variant="secondary">ورود</LinkButton></>}
        </div>
      </MobileDrawer>
    </header>
  );
}
