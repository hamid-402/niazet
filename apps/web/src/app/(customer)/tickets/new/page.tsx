'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, inputClass, SectionTitle } from '@/components/ui';
import type { OrderSummary } from '@/lib/types';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'payment', label: 'مشکل پرداخت' },
  { value: 'quality', label: 'مشکل کیفیت' },
  { value: 'delay', label: 'تأخیر' },
  { value: 'file', label: 'فایل یا دانلود' },
  { value: 'report', label: 'سوال درباره گزارش' },
  { value: 'complaint', label: 'شکایت از مسئول یا تیم' },
  { value: 'compliment', label: 'تشکر از مسئول یا تیم' },
  { value: 'support', label: 'درخواست توضیح بیشتر' },
  { value: 'other', label: 'سایر' },
];

function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [orderId, setOrderId] = useState(params.get('orderId') ?? '');
  const [category, setCategory] = useState('support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<OrderSummary[]>('/customer/orders').then(setOrders).catch(() => undefined);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ticket = await apiFetch<{ id: string }>('/customer/tickets', {
        method: 'POST',
        body: { orderId: orderId || undefined, category, subject, message, priority },
      });
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ثبت تیکت');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionTitle>ثبت تیکت جدید</SectionTitle>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="موضوع">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="سفارش مرتبط (اختیاری)">
              <select className={inputClass} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">بدون سفارش مرتبط</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اولویت">
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">کم</option>
                <option value="normal">عادی</option>
                <option value="high">زیاد</option>
                <option value="urgent">فوری</option>
              </select>
            </Field>
            <Field label="عنوان کوتاه">
              <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="پیام">
              <textarea
                className={`${inputClass} min-h-28`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </Field>
          </div>
        </Card>

        {error && <ErrorBanner message={error} />}

        <Button type="submit" disabled={loading}>
          {loading ? 'در حال ارسال...' : 'ثبت تیکت'}
        </Button>
      </form>
    </div>
  );
}

export default function NewTicketPage() {
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}
