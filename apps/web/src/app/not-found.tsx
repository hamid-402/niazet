import { PublicNav } from '@/components/public-nav';
import { LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicNav />
      <main id="main-content" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center md:px-8">
        <p className="text-sm font-extrabold text-accent">خطای ۴۰۴</p>
        <h1 className="mt-3 text-3xl font-extrabold text-fg">این صفحه پیدا نشد</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-fg-muted">ممکن است نشانی تغییر کرده باشد یا صفحه دیگر در دسترس نباشد. از مسیرهای زیر ادامه دهید.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <LinkButton href="/">بازگشت به صفحه اصلی</LinkButton>
          <LinkButton href="/services" variant="secondary">مشاهده خدمات</LinkButton>
          <LinkButton href="/status" variant="secondary">وضعیت سرویس‌ها</LinkButton>
        </div>
      </main>
    </div>
  );
}
