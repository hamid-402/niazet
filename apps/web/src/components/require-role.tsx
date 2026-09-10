'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { AdminScope, UserRole } from '@/lib/types';
import { LinkButton, PageSkeleton, PermissionState } from './ui';
import { roleHomePath } from '@/lib/role-paths';

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
  const roleOk =
    !!user &&
    (roles.includes(user.role) ||
      roles.some((role) =>
        user.capabilities.includes(role as 'customer' | 'executor'),
      ));
  const scopeOk =
    !!user &&
    (!adminScopes ||
      (user.adminScope && adminScopes.includes(user.adminScope)) ||
      user.adminScope === 'super_admin');
  const authorized = roleOk && scopeOk;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!authorized) {
      router.replace(roleHomePath(user));
    }
  }, [user, loading, authorized, router]);

  if (loading || !user) return <PageSkeleton />;
  if (!authorized) {
    return (
      <PermissionState
        action={<LinkButton href={roleHomePath(user)}>بازگشت به میز کار</LinkButton>}
      />
    );
  }

  return <>{children}</>;
}
