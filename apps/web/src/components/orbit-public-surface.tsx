'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from './brand-mark';
import { ThemeSwitcher } from './theme-switcher';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-public-surface.module.css';

export function OrbitPublicSurface({ children }: { children: ReactNode }) {
  const motion = useOrbitMotionPreference();
  return <div className={styles.surface} data-public-orbit data-motion={motion ? 'on' : 'off'}>{children}</div>;
}

export function OrbitAuthFrame({ children }: { children: ReactNode }) {
  return (
    <OrbitPublicSurface>
      <header className={styles.authHeader}>
        <Link href="/" aria-label="نیازت با ما — صفحه اصلی"><BrandMark caption={false} /></Link>
        <ThemeSwitcher variant="compact" />
      </header>
      <div className={styles.authLayout}>
        <div className={styles.authForm}>{children}</div>
        <aside className={styles.authStory} aria-labelledby="account-journey-title">
          <p className={styles.eyebrow}>همراه انجام کارهای مهم</p>
          <h2 id="account-journey-title">یک حساب.<br />مسیر روشن تا تحویل.</h2>
          <p>درخواست‌ها، گفتگوها و مراحل انجام کار را در فضای کاری خود دنبال کنید.</p>
          <ol className={styles.accountSteps}>
            <li><span aria-hidden="true">۰۱</span><div><strong>نیازت را تعریف کن</strong><p>خدمت و خروجی موردنظرت را مشخص کن.</p></div></li>
            <li><span aria-hidden="true">۰۲</span><div><strong>از روند کار خبر داشته باش</strong><p>پیام‌ها و گزارش‌های سفارش در یک مسیر قرار دارند.</p></div></li>
            <li><span aria-hidden="true">۰۳</span><div><strong>نتیجه را بررسی کن</strong><p>تحویل، کنترل کیفیت و اصلاح را از همان سفارش پیگیری کن.</p></div></li>
          </ol>
          <Link href="/services" className={styles.explore}>پیش از ورود، خدمات را ببین <span aria-hidden="true">↖</span></Link>
        </aside>
      </div>
    </OrbitPublicSurface>
  );
}
