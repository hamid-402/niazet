'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

export interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  children,
  navItems,
  title,
}: {
  children: ReactNode;
  navItems: NavItem[];
  title: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-l border-slate-200 bg-white p-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 text-lg font-extrabold text-slate-900">
          نیازت با ما
        </Link>
        <p className="mb-4 text-xs font-semibold text-slate-400">{title}</p>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 border-t border-slate-100 pt-4 text-sm">
          <p className="font-medium text-slate-700">{user?.fullName}</p>
          <p className="text-xs text-slate-400">{user?.phone}</p>
          <button
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
            className="mt-3 text-xs font-medium text-red-600 hover:underline"
          >
            خروج از حساب
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <span className="font-bold">نیازت با ما</span>
          <span className="text-sm text-slate-500">{user?.fullName}</span>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
