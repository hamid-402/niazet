'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Field, inputClass, SectionTitle } from '@/components/ui';
import type { ServiceLine } from '@/lib/types';

function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const preselectedServiceId = params.get('serviceId') ?? '';

  const [services, setServices] = useState<ServiceLine[]>([]);
  const [serviceId, setServiceId] = useState(preselectedServiceId);
  const [packageId, setPackageId] = useState('');
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [briefDescription, setBriefDescription] = useState('');
  const [budgetHint, setBudgetHint] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ServiceLine[]>('/services', { auth: false }).then(setServices).catch(() => undefined);
  }, []);

  const selectedService = services.find((s) => s.id === serviceId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (briefDescription.trim().length < 10) {
      setError('شرح نیاز باید حداقل ۱۰ کاراکتر باشد.');
      return;
    }

    setLoading(true);
    try {
      const order = await apiFetch<{ id: string }>('/customer/orders', {
        method: 'POST',
        body: {
          serviceId,
          packageId: packageId || undefined,
          title,
          urgency,
          briefDescription,
          budgetHint: budgetHint ? Number(budgetHint) : undefined,
          acceptanceCriteria: acceptanceCriteria
            ? acceptanceCriteria.split('\n').filter(Boolean)
            : undefined,
        },
      });
      await apiFetch(`/customer/orders/${order.id}/submit`, { method: 'POST' });
      router.push(`/orders/${order.id}?submitted=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در ثبت درخواست');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle subtitle="فرم کوتاه؛ جزئیات بیشتر اختیاری است">ثبت درخواست جدید</SectionTitle>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="نوع خدمت">
              <select
                className={inputClass}
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setPackageId('');
                }}
                required
              >
                <option value="">انتخاب کنید</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="پکیج (اختیاری)">
              <select
                className={inputClass}
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                disabled={!selectedService?.packages.length}
              >
                <option value="">بدون پکیج مشخص</option>
                {selectedService?.packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="عنوان درخواست">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: طراحی سایت فروشگاهی"
                required
              />
            </Field>

            <Field label="فوریت">
              <select className={inputClass} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                <option value="low">کم</option>
                <option value="normal">عادی</option>
                <option value="high">زیاد</option>
                <option value="urgent">فوری</option>
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="شرح نیاز" hint="هرچه دقیق‌تر بنویسید، بررسی سریع‌تر انجام می‌شود.">
              <textarea
                className={`${inputClass} min-h-28`}
                value={briefDescription}
                onChange={(e) => setBriefDescription(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="بودجه تقریبی (اختیاری)" hint="در صورت نبودن قیمت ثابت، پس از بررسی قیمت‌گذاری می‌شود.">
              <input
                className={inputClass}
                type="number"
                value={budgetHint}
                onChange={(e) => setBudgetHint(e.target.value)}
                dir="ltr"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <button
            type="button"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setShowOptional((v) => !v)}
          >
            {showOptional ? 'بستن جزئیات اختیاری' : 'افزودن جزئیات اختیاری (معیار پذیرش و ...)'}
          </button>
          {showOptional && (
            <div className="mt-4">
              <Field label="معیارهای پذیرش" hint="هر معیار را در یک خط بنویسید.">
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                />
              </Field>
            </div>
          )}
        </Card>

        {error && <ErrorBanner message={error} />}

        <Button type="submit" disabled={loading}>
          {loading ? 'در حال ارسال...' : 'ارسال برای بررسی'}
        </Button>
      </form>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrderForm />
    </Suspense>
  );
}
