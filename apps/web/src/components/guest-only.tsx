'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { roleHomePath } from '@/lib/role-paths';
import { PageSkeleton } from '@/components/ui';

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(roleHomePath(user));
  }, [loading, router, user]);

  if (loading || user) {
    return (
      <main id="main-content" className="page-container py-10">
        <PageSkeleton />
      </main>
    );
  }
  return <>{children}</>;
}
