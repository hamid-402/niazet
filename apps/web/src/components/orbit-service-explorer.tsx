'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUpLeft, Code2, FileText, ChartNoAxesCombined, Presentation, PenTool, ClipboardList, BriefcaseBusiness, Shapes, Check } from 'lucide-react';
import { useOrbitMotionPreference } from './orbit-motion';
import styles from './orbit-service-explorer.module.css';

// Editorial domain guide; availability, pricing and order schemas come from the real catalog.
const DOMAINS = [
  { title: 'طراحی و توسعه سایت', number: '۰۱', icon: Code2, headline: 'از ایدهٔ آنلاین، تا یک تجربهٔ قابل استفاده.', description: 'برای معرفی کسب‌وکار، راه‌اندازی صفحهٔ فرود یا توسعهٔ وب‌سایت، نیاز و مسیر کاربر را روشن می‌کنیم تا خروجی قابل بررسی باشد.', outputs: ['وب‌سایت یا صفحهٔ فرود', 'مستندات تحویل و راهنمای استفاده'], brief: 'هدف سایت، مخاطب و امکانات موردنیاز را مشخص کنید.' },
  { title: 'محتوا و سئو', number: '۰۲', icon: FileText, headline: 'محتوایی که هدف دارد؛ نه فقط تعداد کلمه.', description: 'از برنامه‌ریزی محتوا تا نگارش و ویرایش؛ لحن برند، مخاطب و هدف انتشار، مبنای تعریف کار هستند.', outputs: ['تقویم و بریف محتوا', 'محتوای آمادهٔ انتشار و گزارش بررسی'], brief: 'موضوع، مخاطب، لحن و محل انتشار را به ما بگویید.' },
  { title: 'تحقیق و تحلیل بازار', number: '۰۳', icon: ChartNoAxesCombined, headline: 'قبل از تصمیم بزرگ، تصویر روشن‌تری ببین.', description: 'پرسش تصمیم‌گیری را به تحقیق ساخت‌یافته تبدیل کنید؛ با محدودهٔ مشخص، منابع قابل پیگیری و جمع‌بندی قابل استفاده.', outputs: ['گزارش بازار و مقایسهٔ رقبا', 'جدول داده و منابع تحقیق'], brief: 'پرسش تحقیق، بازار هدف و محدودیت‌های اطلاعاتی را تعریف کنید.' },
  { title: 'گزارش مدیریتی', number: '۰۴', icon: Presentation, headline: 'از میان داده‌ها، به یک جمع‌بندی قابل تصمیم.', description: 'اطلاعات پراکنده را به گزارشی منظم تبدیل کنید؛ با شاخص‌های روشن، ساختار خوانا و ارائه‌ای متناسب با مخاطب.', outputs: ['گزارش و خلاصهٔ مدیریتی', 'جدول، نمودار یا فایل ارائه'], brief: 'داده‌های موجود، مخاطب گزارش و تصمیم موردنظر را مشخص کنید.' },
  { title: 'طراحی گرافیک', number: '۰۵', icon: PenTool, headline: 'یک زبان تصویری منسجم، برای چیزی که می‌سازی.', description: 'از تعریف جهت بصری تا آماده‌سازی اقلام طراحی؛ کاربرد، قالب تحویل و معیار پذیرش را پیش از اجرا مشخص می‌کنیم.', outputs: ['اقلام گرافیکی و قالب‌های موردتوافق', 'فایل‌های نهایی مناسب کاربرد شما'], brief: 'کاربرد طرح، ابعاد، هویت بصری و نمونه‌های مدنظر را ارسال کنید.' },
  { title: 'امور اداری و پیگیری', number: '۰۶', icon: ClipboardList, headline: 'پیگیری منظم؛ با نتیجه‌ای که قابل ارجاع است.', description: 'جمع‌آوری اطلاعات، هماهنگی و پیگیری‌های تعریف‌شده را در یک مسیر مستند ببینید؛ با حدود اختیار و مسئولیت روشن.', outputs: ['گزارش اقدامات و پیگیری‌ها', 'مستندات و جدول وضعیت'], brief: 'موضوع پیگیری، محدودیت دسترسی و نتیجهٔ موردانتظار را توضیح دهید.' },
  { title: 'دستیار کسب‌وکار', number: '۰۷', icon: BriefcaseBusiness, headline: 'برای کارهای پشت صحنه، یک همراه هماهنگ.', description: 'کارهای مشخص و تکرارشوندهٔ کسب‌وکار را با خروجی و بازهٔ زمانی روشن تعریف کنید؛ از آماده‌سازی اطلاعات تا هماهنگی اجرایی.', outputs: ['بستهٔ خروجی متناسب با نیاز کسب‌وکار', 'گزارش انجام کار و موارد نیازمند تصمیم'], brief: 'فهرست کارها، تناوب و دسترسی‌های مجاز را مشخص کنید.' },
  { title: 'خدمات سفارشی', number: '۰۸', icon: Shapes, headline: 'اگر در یک دسته جا نمی‌شود، از خودِ نیاز شروع کنیم.', description: 'برای نیازهای ترکیبی یا متفاوت، ابتدا امکان اجرا و محدوده را بررسی می‌کنیم؛ پذیرش کار و تعهد نهایی پس از این بررسی مشخص می‌شود.', outputs: ['پیشنهاد دامنه و خروجی‌های توافق‌شده', 'معیار پذیرش و برنامهٔ اجرای مشخص'], brief: 'مسئله، خروجی مطلوب و محدودیت زمان یا بودجه را شرح دهید.' },
] as const;

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function OrbitServiceExplorer() {
  const [selected, setSelected] = useState(0);
  const enhanced = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const motion = useOrbitMotionPreference();
  const collection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = collection.current;
    const panel = root?.querySelector('details[open] > div');
    if (!root || !panel) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--panel-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [selected, enhanced]);
  return (
    <section id="explore-services" aria-labelledby="orbit-services-title" className={styles.section} data-orbit-explorer data-enhanced={enhanced} data-motion={motion ? 'on' : 'off'}>
      <div className={styles.heading}>
        <div><p className={styles.overline}>۰۱ / تخصص‌های نیازت</p><h2 id="orbit-services-title">نیاز تو، مسیر ما.</h2></div>
        <p>دسته‌های خدمات را مرور کنید؛ دامنه و نمونهٔ خروجی را ببینید و سپس خدمت فعال را در کاتالوگ انتخاب کنید.</p>
      </div>
      <div ref={collection} className={`service-collection ${styles.collection}`}>
        {DOMAINS.map((domain, index) => {
          const Icon = domain.icon;
          return (
            <details key={domain.number} open={selected === index} className={styles.item}>
              <summary className={styles.choice} onClick={(event) => { event.preventDefault(); setSelected(index); }}>
                <span className={styles.number} aria-hidden="true">{domain.number}</span>
                <span>{domain.title}</span><ArrowUpLeft className={styles.choiceArrow} size={18} aria-hidden="true" />
              </summary>
              <div className={styles.panel}>
                <div className={styles.art} aria-hidden="true"><span className={styles.orbitRing} /><span className={styles.tileBack} /><span className={styles.tile}><Icon size={44} strokeWidth={1.25} /></span><span className={styles.serial}>{domain.number} / ۰۸</span></div>
                <div className={styles.panelCopy}>
                  <p className={styles.domain}>{domain.title}</p><h3>{domain.headline}</h3>
                  <p className={styles.description}>{domain.description}</p>
                  <ul className={styles.outputs} aria-label={`نمونه خروجی‌های ${domain.title}`}>
                    {domain.outputs.map((output) => <li key={output}><Check size={15} aria-hidden="true" /><span>{output}</span></li>)}
                  </ul>
                  <p className={styles.brief}><strong>برای شروع:</strong> {domain.brief}</p>
                  <Link href="/services" className={styles.cta}>مشاهده کاتالوگ خدمات <ArrowUpLeft size={17} aria-hidden="true" /></Link>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      <p className={styles.disclaimer}>این بخش معرفی حوزه‌هاست؛ موجودبودن خدمت، قیمت، زمان و خروجی قطعی فقط در کاتالوگ و پیشنهاد نهایی سفارش مشخص می‌شود.</p>
    </section>
  );
}
