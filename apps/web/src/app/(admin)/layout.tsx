'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireRole } from '@/components/require-role';
import { PRODUCT_TERMS } from '@/lib/product-copy';
import { useAuth } from '@/lib/auth-context';

const OPS_NAV = [
  { href: '/admin', label: 'داشبورد عملیات' },
  { href: '/admin/orders', label: 'مدیریت سفارش‌ها' },
  { href: '/admin/services', label: 'خدمات و فرم‌ها' },
  { href: '/admin/qc', label: PRODUCT_TERMS.qualityControl },
  { href: '/admin/staff', label: 'کارمندان و مجریان' },
  { href: '/admin/feedback', label: 'بازخورد و شکایت‌ها' },
  { href: '/admin/reports/operations', label: 'گزارش عملیات' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

const FINANCE_NAV = [
  { href: '/admin/finance', label: 'داشبورد مالی' },
  { href: '/admin/finance/payments', label: 'پرداخت‌ها' },
  { href: '/admin/finance/escrow', label: PRODUCT_TERMS.escrow },
  { href: '/admin/finance/refunds', label: 'بازپرداخت‌ها' },
  { href: '/admin/finance/invoices', label: 'فاکتورها' },
  { href: '/admin/finance/withdrawals', label: 'برداشت‌ها' },
  { href: '/admin/finance/ledger', label: PRODUCT_TERMS.ledger },
  { href: '/admin/reports/finance', label: 'گزارش مالی' },
  { href: '/account/security', label: 'حساب و امنیت' },
];

const SUPER_NAV = [
  { href: '/admin/users', label: 'کاربران' },
  { href: '/admin/admins', label: 'ادمین‌ها' },
  { href: '/admin/settings', label: 'تنظیمات سامانه' },
  { href: '/admin/ai-controls', label: `کنترل‌های ${PRODUCT_TERMS.artificialIntelligence}` },
  { href: '/admin/security', label: 'امنیت و سلامت' },
  { href: '/admin/audit', label: PRODUCT_TERMS.audit },
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
