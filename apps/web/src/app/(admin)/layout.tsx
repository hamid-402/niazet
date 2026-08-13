'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';

const OPS_NAV = [
  { href: '/admin', label: 'داشبورد عملیات' },
  { href: '/admin/orders', label: 'مدیریت سفارش‌ها' },
  { href: '/admin/qc', label: 'کنترل کیفیت QC' },
  { href: '/admin/staff', label: 'کارمندان و مجریان' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

const FINANCE_NAV = [
  { href: '/admin/finance', label: 'داشبورد مالی' },
  { href: '/admin/finance/payments', label: 'پرداخت‌ها' },
  { href: '/admin/finance/escrow', label: 'Escrow' },
  { href: '/admin/finance/ledger', label: 'Ledger' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

const SUPER_NAV = [
  { href: '/admin/users', label: 'کاربران' },
  { href: '/admin/admins', label: 'ادمین‌ها' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['admin']}>
      <AdminShell>{children}</AdminShell>
    </RequireRole>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  let nav = OPS_NAV;
  let title = 'پنل ادمین عملیاتی';

  if (user?.adminScope === 'finance_admin') {
    nav = FINANCE_NAV;
    title = 'پنل ادمین مالی';
  } else if (user?.adminScope === 'super_admin') {
    nav = [...OPS_NAV, ...FINANCE_NAV, ...SUPER_NAV];
    title = 'پنل ادمین کل';
  }

  return (
    <AppShell navItems={nav} title={title}>
      {children}
    </AppShell>
  );
}
