'use client';

import type { ReactNode } from 'react';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-customer-surface.module.css';

export function OrbitCustomerSurface({ children }: { children: ReactNode }) {
  const motion = useOrbitMotionPreference();
  return <div className={styles.page} data-customer-orbit data-motion={motion ? 'on' : 'off'}>{children}</div>;
}
