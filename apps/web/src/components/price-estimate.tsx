"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPercent, formatToman } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { estimateRequest, readPriceEstimate, type PriceEstimate as Estimate } from "./price-estimate-contract";
import styles from "./orbit-customer-surface.module.css";

type State = { key: string } & (
  | { status: "success"; value: Estimate }
  | { status: "error"; message: string }
);

export function PriceEstimate({ serviceSlug, packageId, urgency }: {
  serviceSlug?: string;
  packageId: string;
  urgency: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const request = estimateRequest(serviceSlug, packageId, urgency);
  const selection = request ? JSON.stringify(request) : "";
  const key = JSON.stringify([serviceSlug, packageId, urgency, attempt]);
  // Never render a response/error from a prior selection, even before cleanup.
  const current = state?.key === key ? state : null;

  useEffect(() => {
    if (!selection) return;
    let active = true;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      deadline = setTimeout(() => {
        controller.abort();
        if (active) setState({ key, status: "error", message: "دریافت برآورد طول کشید؛ می‌توانید دوباره تلاش کنید. فرم شما محفوظ است." });
      }, 10_000);
      try {
        const body = JSON.parse(selection) as NonNullable<typeof request>;
        const response = await apiFetch<unknown>("/pricing/calculate", {
          method: "POST", body, auth: false, signal: controller.signal,
          dedupe: false, retry: 0,
        });
        const value = readPriceEstimate(response, body);
        if (active && !controller.signal.aborted) setState({ key, status: "success", value });
      } catch (cause) {
        if (active && !controller.signal.aborted) setState({
          key, status: "error",
          message: cause instanceof ApiError && cause.status === 429
            ? "درخواست‌های برآورد زیاد شده است؛ یک دقیقه بعد دوباره تلاش کنید."
            : "دریافت برآورد ممکن نشد. می‌توانید دوباره تلاش کنید یا فرم را ادامه دهید.",
        });
      } finally { clearTimeout(deadline); }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [selection, key]);

  if (!serviceSlug) return null;
  return (
    <Card className={styles.composerCard} data-price-estimate>
      <h2 className="mb-2 text-base font-extrabold text-fg">برآورد هزینه</h2>
      <p className="mb-4 text-sm leading-7 text-fg-muted">
        این مبلغ صرفاً برآورد است؛ قیمت قطعی، پرداخت یا رزرو ظرفیت نیست. مبلغ و زمان نهایی پس از بررسی و تأیید جداگانه مشخص می‌شود.
      </p>
      <div role="status" aria-live="polite" aria-atomic="true" data-estimate-state={!request ? "unsupported" : current?.status ?? "loading"}>
        {!request ? (
          <p className="text-sm leading-7 text-fg-muted">برای فوریت انتخاب‌شده، نرخ برآورد خودکار تعریف نشده است؛ هزینه پس از بررسی اعلام می‌شود. فوریت سفارش شما تغییر نمی‌کند.</p>
        ) : current?.status === "error" ? (
          <p className="text-sm leading-7 text-danger">{current.message}</p>
        ) : current?.status === "success" ? current.value.status === "quote_required" ? (
          <p className="text-sm font-bold leading-7 text-fg">نیازمند بررسی و اعلام قیمت؛ مبلغ قطعی برای این انتخاب موجود نیست.</p>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-fg-muted">قیمت پایه</dt><dd className="mt-1 font-bold text-fg" data-estimate-base>{formatToman(current.value.base_price)}</dd></div>
            <div><dt className="text-fg-muted">اضافه‌بار ({formatPercent(current.value.surcharge_pct)})</dt><dd className="mt-1 font-bold text-fg" data-estimate-extra>{formatToman(current.value.surcharge_amount)}</dd></div>
            <div><dt className="text-fg-muted">جمع برآوردی</dt><dd className="mt-1 font-extrabold text-accent" data-estimate-total>{formatToman(current.value.final_price)}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">در حال دریافت برآورد از کاتالوگ…</p>
        )}
      </div>
      {request && current?.status === "error" && (
        <Button type="button" variant="secondary" className="mt-4" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره برای برآورد</Button>
      )}
    </Card>
  );
}
