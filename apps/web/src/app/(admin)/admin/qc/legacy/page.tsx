import Link from 'next/link';
import { SectionTitle } from '@/components/ui';
import { LegacyOutputReview } from '@/components/legacy-output-review';

export default function LegacyOutputReviewPage() {
  return <div className="mx-auto max-w-4xl space-y-5">
    <SectionTitle subtitle="انتشار فقط با مدرک همان نسخه و تصمیم انسانی">بررسی نسخه‌های قدیمی</SectionTitle>
    <Link href="/admin/qc" className="inline-block text-sm font-bold text-accent underline">بازگشت به صف کنترل کیفیت</Link>
    <LegacyOutputReview />
  </div>;
}
