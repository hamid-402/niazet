'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';

const NAV = [
  { href: '/dashboard', label: 'میز کار' },
  { href: '/orders/new', label: 'درخواست جدید' },
  { href: '/orders', label: 'سفارش‌ها' },
  { href: '/wallet', label: 'کیف پول و فاکتورها' },
  { href: '/tickets', label: 'تیکت‌ها' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['customer']}>
      <AppShell navItems={NAV} title="پنل مشتری">
        {children}
      </AppShell>
    </RequireRole>
  );
}
