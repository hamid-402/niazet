'use client';

import { useAuth } from '@/lib/auth-context';
import { LinkButton } from '@/components/ui';

export function ServiceOrderCta({ serviceId }: { serviceId: string }) {
  const { user } = useAuth();
  return (
    <LinkButton href={user ? `/orders/new?serviceId=${serviceId}` : '/login'} className="mt-4 w-full">
      شروع ثبت درخواست
    </LinkButton>
  );
}
