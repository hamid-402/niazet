'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-sections.module.css';

export function OrbitSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  const motion = useOrbitMotionPreference();
  const ref = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const section = ref.current;
    if (!section || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setEntered(true);
      observer.disconnect();
    }, { threshold: 0, rootMargin: '0px 0px -48px 0px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`${styles.section} ${className}`} data-orbit-section data-motion={motion ? 'on' : 'off'} data-entered={entered}>{children}</div>;
}
