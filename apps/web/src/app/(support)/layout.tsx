'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';

const NAV = [
  { href: '/support', label: 'داشبورد' },
  { href: '/support/tickets', label: 'صف تیکت‌ها' },
  { href: '/support/tickets?view=mine', label: 'تیکت‌های من' },
  { href: '/support/performance', label: 'عملکرد من' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

export default function SupportLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['support', 'admin']}>
      <AppShell navItems={NAV} title="پنل پشتیبانی">
        {children}
      </AppShell>
    </RequireRole>
  );
}
