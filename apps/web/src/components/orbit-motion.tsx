'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './orbit-hero.module.css';

const KEY = 'niazat-orbit-motion';
const EVENT = 'niazat-orbit-motion-change';
const QUERY = '(prefers-reduced-motion: reduce)';
const MotionContext = createContext(false);
export const useOrbitMotion = () => useContext(MotionContext);

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
    media.removeEventListener('change', onChange);
  };
}
// A conservative SSR snapshot keeps content visible and motion off until preferences are known.
const serverSnapshot = () => false;
function snapshot() {
  if (window.matchMedia(QUERY).matches) return false;
  try { return localStorage.getItem(KEY) !== 'paused'; } catch { return false; }
}
const reducedSnapshot = () => window.matchMedia(QUERY).matches;

export function OrbitMotion({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const reduced = useSyncExternalStore(subscribe, reducedSnapshot, serverSnapshot);
  function toggle() {
    try { localStorage.setItem(KEY, enabled ? 'paused' : 'enabled'); } catch { return; }
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <MotionContext.Provider value={enabled}>
      <section className={styles.hero} aria-labelledby="orbit-hero-title" data-orbit-motion={enabled ? 'on' : 'off'}>
        <div className={styles.topline}>
          <p className={styles.eyebrow}>خدمات تخصصی، با اجرای مدیریت‌شده و پرداخت امن</p>
          <button type="button" className={styles.motionToggle} onClick={toggle} aria-pressed={!enabled} disabled={reduced}>
            {enabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {reduced ? 'حرکت محدود سیستم' : 'توقف حرکت‌های مدار'}
          </button>
        </div>
        {children}
      </section>
    </MotionContext.Provider>
  );
}
