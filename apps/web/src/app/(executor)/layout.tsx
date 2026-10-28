'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';

const NAV = [
  { href: '/executor', label: 'کارهای من' },
  { href: '/executor/orders', label: 'سفارش‌های ارجاع‌شده' },
  { href: '/executor/performance', label: 'عملکرد من' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

export default function ExecutorLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['executor']}>
      <AppShell navItems={NAV} title="پنل کارمند / مجری">
        {children}
      </AppShell>
    </RequireRole>
  );
}
