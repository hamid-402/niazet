'use client';

import Image from 'next/image';
import { useId, type CSSProperties } from 'react';
import styles from './brand-mark.module.css';

// Remove only the near-white paper in the supplied sheet at render time.
const PAPER_ALPHA = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1.5 -1.5 -1.5 0 4.2';

export function BrandMark({ language = 'fa', caption = true }: { language?: 'fa' | 'en'; caption?: boolean }) {
  const id = useId();
  const lightId = `brand-light-${id}`;
  const darkId = `brand-dark-${id}`;
  const filters = { '--brand-light-filter': `url("#${lightId}")`, '--brand-dark-filter': `url("#${darkId}")` } as CSSProperties;
  return (
    <span className={styles.lockup} data-brand-mark={language} style={filters}>
      <svg className={styles.filters} width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id={lightId} colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values={PAPER_ALPHA} />
          </filter>
          <filter id={darkId} colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values={PAPER_ALPHA} result="shape" />
            {/* Select dark/cool ink, leaving the gold and bright turquoise accents intact. */}
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -4 0 0 2.8" result="darkInk" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 6 0 0" result="coolInk" />
            <feComposite in="darkInk" in2="coolInk" operator="in" result="inkMask" />
            <feFlood className={styles.lightInk} result="lightInk" />
            <feComposite in="lightInk" in2="inkMask" operator="in" result="liftedInk" />
            <feComposite in="liftedInk" in2="SourceGraphic" operator="over" result="adapted" />
            <feComposite in="adapted" in2="shape" operator="in" />
          </filter>
        </defs>
      </svg>
      <span className={styles.plate}>
        <span className={styles.viewport} data-language={language}>
          <Image src="/brand/niazet-approved.png" alt={language === 'fa' ? 'نیازت با ما' : 'Niazet Ba Ma'} width={1536} height={1024} sizes="320px" loading="eager" className={styles.artwork} />
        </span>
      </span>
      {caption && <span className={`${styles.caption} brand-caption`}>همراهِ انجام کارهای مهم</span>}
    </span>
  );
}
