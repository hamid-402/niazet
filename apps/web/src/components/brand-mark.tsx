import Image from 'next/image';
import styles from './brand-mark.module.css';

export function BrandMark({ language = 'fa', caption = true }: { language?: 'fa' | 'en'; caption?: boolean }) {
  return (
    <span className={styles.lockup} data-brand-mark={language}>
      <span className={styles.plate}>
        <span className={styles.viewport} data-language={language}>
          <Image src="/brand/niazet-approved.png" alt={language === 'fa' ? 'نیازت با ما' : 'Niazet Ba Ma'} width={1536} height={1024} sizes="320px" loading="eager" className={styles.artwork} />
        </span>
      </span>
      {caption && <span className={`${styles.caption} brand-caption`}>همراهِ انجام کارهای مهم</span>}
    </span>
  );
}
