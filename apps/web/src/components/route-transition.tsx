'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const PUBLIC_ROUTE_PREFIXES = ['/services', '/status', '/login', '/register', '/forgot-password'] as const;

function isPublicRoute(pathname: string) {
  return pathname === '/' || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);

  return (
    <div key={pathname} data-route-motion={publicRoute ? 'public' : 'workspace'} className={`route-transition flex min-w-0 flex-1 flex-col ${publicRoute ? 'route-transition--public' : 'route-transition--workspace'}`}>
      {children}
    </div>
  );
}
