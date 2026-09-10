'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-bg p-4 text-fg">
        <main className="w-full max-w-xl rounded-card border border-danger-border bg-surface p-8 text-center shadow-elevation-2">
          <p className="text-sm font-extrabold text-danger">خطای غیرمنتظره</p>
          <h1 className="mt-3 text-2xl font-extrabold">بارگذاری سامانه کامل نشد</h1>
          <p className="mt-3 text-sm leading-7 text-fg-muted">دوباره تلاش کنید. جزئیات فنی خطا برای جلوگیری از افشای اطلاعات در این صفحه نمایش داده نمی‌شود.</p>
          <button type="button" onClick={reset} className="mt-6 min-h-10 rounded-control bg-accent px-5 py-2 text-sm font-bold text-fg-on-accent">تلاش دوباره</button>
        </main>
      </body>
    </html>
  );
}
