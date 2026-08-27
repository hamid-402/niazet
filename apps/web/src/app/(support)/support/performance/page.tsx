"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, ErrorBanner, PageLoading, SectionTitle } from "@/components/ui";

type Performance = {
  totalReplied: number;
  resolved: number;
  slaBreaches: number;
};

export default function SupportPerformancePage() {
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Performance>("/support/tickets/performance")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <PageLoading />;

  return (
    <div className="space-y-4">
      <SectionTitle>عملکرد من</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-500">پاسخ‌های قابل مشاهده مشتری</p>
          <p className="mt-2 text-2xl font-extrabold text-sky-700">{data.totalReplied}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">تیکت حل یا بسته‌شده</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">{data.resolved}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">عبور از SLA</p>
          <p className="mt-2 text-2xl font-extrabold text-rose-700">{data.slaBreaches}</p>
        </Card>
      </div>
      <Card className="text-sm leading-7 text-slate-600">
        این شاخص‌ها فقط فعالیت حساب فعلی را نشان می‌دهند و یادداشت‌های داخلی در تعداد پاسخ‌های مشتری محاسبه نمی‌شوند.
      </Card>
    </div>
  );
}
