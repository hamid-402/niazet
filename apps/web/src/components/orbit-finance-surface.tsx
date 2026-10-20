'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-ops-surface.module.css';

export function OrbitFinanceSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const motion = useOrbitMotionPreference();
  const active = /^\/admin\/(?:finance(?:\/(?:payments|escrow|refunds|invoices|withdrawals|ledger))?|organizations|reports\/finance)$/.test(pathname);
  if (!active) return children;
  return <div className={styles.surface} data-motion={motion ? 'on' : 'off'}><p className={styles.eyebrow}>مدار مالی · روشن، دقیق، قابل پیگیری</p>{children}</div>;
}
