'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center md:px-8">
      <p className="text-sm font-extrabold text-danger">خطای موقت</p>
      <h1 className="mt-3 text-2xl font-extrabold text-fg">نمایش این صفحه ممکن نشد</h1>
      <p className="mt-3 max-w-xl text-sm leading-7 text-fg-muted">اطلاعات واردشده را بررسی کنید و دوباره تلاش کنید. اگر خطا ادامه داشت، وضعیت سرویس‌ها را ببینید.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>تلاش دوباره</Button>
        <Link href="/" className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 py-2 text-sm font-bold text-fg">صفحه اصلی</Link>
        <Link href="/status" className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-surface px-4 py-2 text-sm font-bold text-fg">وضعیت سرویس‌ها</Link>
      </div>
    </main>
  );
}
