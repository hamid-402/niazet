import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'وضعیت سرویس‌ها',
  description: 'نمای عمومی سلامت و رخدادهای جاری سرویس‌های نیازت',
  alternates: { canonical: '/status' },
};

export default function StatusLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
