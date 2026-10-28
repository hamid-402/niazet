"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, ErrorBanner, PageLoading, SectionTitle } from "@/components/ui";
import { OrbitStaffSurface } from "@/components/orbit-staff-surface";
import styles from "@/components/orbit-staff-surface.module.css";

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
    <OrbitStaffSurface>
      <div className={styles.heading}><div><p className={styles.eyebrow}>کیفیت پاسخ‌گویی</p><SectionTitle>عملکرد من</SectionTitle></div></div>
      <div className={styles.detailMetrics}>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-muted">پاسخ‌های قابل مشاهده مشتری</p>
          <p className="mt-2 text-2xl font-extrabold text-info">{data.totalReplied}</p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-muted">تیکت حل یا بسته‌شده</p>
          <p className="mt-2 text-2xl font-extrabold text-success">{data.resolved}</p>
        </Card>
        <Card className={styles.metric}>
          <p className="text-xs text-fg-muted">عبور از SLA</p>
          <p className="mt-2 text-2xl font-extrabold text-danger">{data.slaBreaches}</p>
        </Card>
      </div>
      <Card className="text-sm leading-7 text-fg-muted">
        این شاخص‌ها فقط فعالیت حساب فعلی را نشان می‌دهند و یادداشت‌های داخلی در تعداد پاسخ‌های مشتری محاسبه نمی‌شوند.
      </Card>
    </OrbitStaffSurface>
  );
}
