import { ArrowUpLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { LinkButton } from './ui';
import { OrbitJourney } from './orbit-journey';
import { OrbitMotion } from './orbit-motion';
import styles from './orbit-hero.module.css';

export function OrbitHero({ children }: { children: ReactNode }) {
  return (
    <OrbitMotion>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 id="orbit-hero-title" className={styles.title}>
            <span><span>بزرگ فکر کن.</span></span>
            <span><span>دقیق تحویل بگیر.</span></span>
          </h1>
          <p className={styles.intro}>بین چیزی که در ذهن توست و چیزی که تحویل می‌گیری، یک تیم هماهنگ می‌ایستد. از تعریف نیاز تا اجرای کار و بررسی کیفیت؛ با نیازت.</p>
          <div className={styles.actions}>
            <LinkButton href="/services" className={styles.primary}>شروع ثبت درخواست <span className={styles.arrow}><ArrowUpLeft size={21} aria-hidden="true" /></span></LinkButton>
            <LinkButton href="/services" variant="secondary" className={styles.secondary}>مشاهده خدمات و قیمت‌گذاری</LinkButton>
          </div>
          <p className={styles.micro}>مسیر اجرا، زمان و هزینه پیش از شروع روشن می‌شود.</p>
        </div>
        <OrbitJourney />
      </div>
      {children}
    </OrbitMotion>
  );
}
