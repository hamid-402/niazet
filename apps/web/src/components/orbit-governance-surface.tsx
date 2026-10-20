'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-ops-surface.module.css';

export function OrbitGovernanceSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const motion = useOrbitMotionPreference();
  const active = /^\/admin\/(?:users|admins|settings|ai-controls|security|audit|feedback|reports\/bi)$/.test(pathname);
  if (!active) return children;
  return <div className={styles.surface} data-motion={motion ? 'on' : 'off'}><p className={styles.eyebrow}>مدار مدیریت · تصمیم روشن، سابقه ماندگار</p>{children}</div>;
}
