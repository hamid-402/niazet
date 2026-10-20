'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-ops-surface.module.css';

export function OrbitOpsSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const motion = useOrbitMotionPreference();
  const active = /^\/admin(?:\/(?:orders|qc|staff)(?:\/[^/]+(?:\/onboarding)?)?|\/services|\/reports\/operations)?$/.test(pathname);
  if (!active) return children;
  return <div className={styles.surface} data-motion={motion ? 'on' : 'off'}><p className={styles.eyebrow}>مدار عملیات · از بررسی تا تحویل</p>{children}</div>;
}
