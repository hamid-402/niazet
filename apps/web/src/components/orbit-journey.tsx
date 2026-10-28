'use client';

import { useEffect, useState } from 'react';
import { ArrowUpLeft, CircleDot, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useOrbitMotion } from './orbit-motion';
import styles from './orbit-hero.module.css';

// Explanatory groups, not domain states or a simulated customer order.
const STAGES = [
  { number: '۰۱', title: 'نیاز تو، نقطهٔ شروع', detail: 'تعریف مسئله و خروجی موردنظر', caption: 'خدمت را انتخاب کنید و نیاز و فایل‌های لازم را در فرم درخواست ثبت کنید.' },
  { number: '۰۲', title: 'مسیر روشن، شروع مطمئن', detail: 'توافق بر زمان، هزینه و پرداخت امن', caption: 'پس از بررسی کارشناس و تأیید شما، پرداخت در حساب امانی نگه‌داری می‌شود.' },
  { number: '۰۳', title: 'اجرا با یک تیم هماهنگ', detail: 'اجرای داخلی و کنترل کیفیت', caption: 'تیم مشخص کار را اجرا می‌کند؛ خروجی پیش از تحویل با معیارهای توافق‌شده بررسی می‌شود.' },
  { number: '۰۴', title: 'تحویل، با خیال آسوده', detail: 'دریافت خروجی و امکان اصلاح', caption: 'خروجی را بررسی کنید؛ تأیید یا درخواست اصلاح در محدودهٔ توافق از همان سفارش انجام می‌شود.' },
] as const;

export function OrbitJourney() {
  const motion = useOrbitMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !motion) return;
    const timer = window.setTimeout(() => {
      if (active === STAGES.length - 1) setPlaying(false);
      else setActive((index) => index + 1);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [active, playing, motion]);

  return (
    <div className={styles.device}>
      <div className={styles.deviceLabel}><span>مدار اجرای نیازت</span><span aria-hidden="true">IDEA → DELIVERY</span></div>
      <div className={styles.stack}>
        <div className={styles.stackInner}>
          <div className={styles.stackHeader}><CircleDot size={16} aria-hidden="true" /><span>از تعریف نیاز تا نتیجه</span><span aria-hidden="true">۰۱ — ۰۴</span></div>
          <ol className={styles.stages} aria-label="نگاهی به مسیر اجرای نیازت">
            {STAGES.map((stage, index) => (
              <li key={stage.number}>
                <button type="button" className={styles.stage} aria-pressed={active === index} aria-controls="orbit-journey-detail" onClick={() => { setActive(index); setPlaying(false); }}>
                  <span className={styles.stageNumber} aria-hidden="true">{stage.number}</span>
                  <span className={styles.stageText}><strong>{stage.title}</strong><small>{stage.detail}</small></span>
                  <ArrowUpLeft className={styles.stageArrow} size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <p id="orbit-journey-detail" className={styles.caption} aria-live={playing && motion ? 'off' : 'polite'} aria-atomic="true">{STAGES[active].caption}</p>
        </div>
      </div>
      <div className={styles.deviceFooter}>
        <button type="button" className={styles.play} disabled={!motion} onClick={() => { if (playing) setPlaying(false); else { setActive(0); setPlaying(true); } }} aria-label={playing && motion ? 'توقف پخش مسیر' : 'پخش مسیر'}>
          {playing && motion ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {playing && motion ? 'توقف پخش مسیر' : 'پخش مسیر'}
        </button>
        <div className={styles.track} aria-hidden="true"><span style={{ transform: `scaleX(${(active + 1) / STAGES.length})` }} /></div>
        <Link href="#how-it-works">جزئیات هر مرحله <ArrowUpLeft size={13} aria-hidden="true" /></Link>
      </div>
    </div>
  );
}
