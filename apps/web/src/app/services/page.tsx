import { PublicNav } from '@/components/public-nav';
import { ServiceCatalog } from '@/components/service-catalog';
import { EmptyState, LinkButton, RetryState } from '@/components/ui';
import { publicApiFetch } from '@/lib/server-api';
import type { ServiceLine } from '@/lib/types';

export const revalidate = 300;

export default async function ServicesPage() {
  let services: ServiceLine[] = [];
  let error = false;
  try { services = await publicApiFetch<ServiceLine[]>('/services'); } catch { error = true; }
  return (
    <div className="flex flex-1 flex-col">
      <PublicNav />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:px-8">
        <div className="mb-6 max-w-3xl">
          <p className="text-sm font-bold text-accent">کاتالوگ خدمات مدیریت‌شده</p>
          <h1 className="mt-1 text-2xl font-extrabold text-fg">خدمت مناسب را با خروجی روشن انتخاب کنید</h1>
          <p className="mt-2 text-sm leading-7 text-fg-muted">در هر خدمت، پکیج‌ها، زمان هدف، خروجی قابل تحویل و معیار پذیرش را پیش از ثبت سفارش مقایسه کنید.</p>
        </div>
        {error && <RetryState title="دریافت خدمات ممکن نشد" description="ارتباط با سرویس خدمات برقرار نشد." action={<LinkButton href="/services">تلاش مجدد</LinkButton>} />}
        {!error && services.length === 0 && <EmptyState title="در حال حاضر خدمتی ثبت نشده است." />}
        {!error && services.length > 0 && <ServiceCatalog services={services} />}
      </main>
    </div>
  );
}
