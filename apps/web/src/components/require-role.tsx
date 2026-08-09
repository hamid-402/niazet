'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { AdminScope, UserRole } from '@/lib/types';
import { PageLoading } from './ui';

export function RequireRole({
  roles,
  adminScopes,
  children,
}: {
  roles: UserRole[];
  adminScopes?: AdminScope[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const roleOk =
      roles.includes(user.role) ||
      roles.some((r) =>
        user.capabilities.includes(r as 'customer' | 'executor'),
      );
    const scopeOk =
      !adminScopes ||
      (user.adminScope && adminScopes.includes(user.adminScope)) ||
      user.adminScope === 'super_admin';
    if (!roleOk || !scopeOk) {
      router.replace('/');
    }
  }, [user, loading, roles, adminScopes, router]);

  if (loading || !user) return <PageLoading />;

  return <>{children}</>;
}
