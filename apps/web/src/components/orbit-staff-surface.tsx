'use client';

import type { ReactNode } from 'react';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-staff-surface.module.css';

export function OrbitStaffSurface({ children }: { children: ReactNode }) {
  const motion = useOrbitMotionPreference();
  return <div className={styles.page} data-motion={motion ? 'on' : 'off'}>{children}</div>;
}
