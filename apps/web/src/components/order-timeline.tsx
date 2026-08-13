import { Badge } from "@/components/ui";
import { OrderStatusBadge } from "@/components/status-badge";
import { formatDate, formatToman } from "@/lib/format";
import type { OrderDetail, OrderStatus } from "@/lib/types";

const CUSTOMER_NEXT_ACTION: Record<OrderStatus, string> = {
  draft: "اطلاعات درخواست را کامل و ثبت نهایی کنید.",
  submitted: "درخواست ثبت شده و در حال انتقال به صف بررسی است.",
  pending_triage: "تیم عملیات درخواست را بررسی و مسیر اجرا را مشخص می‌کند.",
  triaging: "نیاز شما در حال بررسی تخصصی است.",
  pending_quote: "منتظر آماده‌شدن پیشنهاد قیمت بمانید.",
  quoted: "پیشنهاد قیمت را بررسی و در صورت تأیید ادامه دهید.",
  pending_payment: "پرداخت سفارش یا مرحله فعال را انجام دهید.",
  paid: "پرداخت تأیید شده؛ تیم عملیات مجری مناسب را اختصاص می‌دهد.",
  assigned: "مجری مشخص شده و به‌زودی اجرای کار را آغاز می‌کند.",
  in_progress: "کار در حال اجراست؛ گزارش‌ها و پیام‌ها را دنبال کنید.",
  submitted_for_qc: "خروجی برای کنترل کیفیت ارسال شده است.",
  qc_in_review: "تیم کنترل کیفیت خروجی را بررسی می‌کند.",
  qc_rejected: "خروجی برای اصلاح به مجری بازگردانده شده است.",
  ready_for_customer_review: "خروجی تأیید شده و برای تحویل نهایی آماده می‌شود.",
  delivered:
    "فایل‌های تحویل را بررسی کنید؛ سپس تحویل را تأیید یا درخواست اصلاح ثبت کنید.",
  revision_requested: "درخواست اصلاح ثبت شده و مجری روی تغییرات کار می‌کند.",
  disputed:
    "پرونده در حال بررسی اختلاف است؛ نتیجه از همین صفحه و تیکت اعلام می‌شود.",
  confirmed: "تحویل تأیید شده و تسویه/بستن نهایی در حال انجام است.",
  cancelled: "این سفارش لغو شده و اقدام دیگری لازم نیست.",
  closed: "این سفارش با موفقیت بسته شده است.",
};

export function customerNextAction(status: OrderStatus) {
  return CUSTOMER_NEXT_ACTION[status];
}

export function OrderTimeline({
  order,
}: {
  order: Pick<OrderDetail, "statusHistory" | "milestones" | "reports">;
}) {
  const events = [
    ...(order.statusHistory ?? []).map((item) => ({
      id: `history-${item.id}`,
      at: item.createdAt,
      kind: "status" as const,
      item,
    })),
    ...(order.milestones ?? []).flatMap((item) => [
      {
        id: `milestone-created-${item.id}`,
        at: item.createdAt,
        kind: "milestone" as const,
        item,
        title: `مرحله ${item.sequence}: ${item.title}`,
      },
      ...(item.deliveredAt
        ? [
            {
              id: `milestone-delivered-${item.id}`,
              at: item.deliveredAt,
              kind: "milestone-delivered" as const,
              item,
              title: `تحویل مرحله ${item.sequence}`,
            },
          ]
        : []),
      ...(item.approvedAt
        ? [
            {
              id: `milestone-approved-${item.id}`,
              at: item.approvedAt,
              kind: "milestone-approved" as const,
              item,
              title: `تأیید مرحله ${item.sequence}`,
            },
          ]
        : []),
    ]),
    ...(order.reports ?? []).map((item) => ({
      id: `report-${item.id}`,
      at: item.createdAt,
      kind: "report" as const,
      item,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (!events.length)
    return <p className="text-sm text-fg-muted">هنوز رویدادی ثبت نشده است.</p>;
  return (
    <ol className="relative border-r border-border pr-5">
      {events.map((event) => (
        <li key={event.id} className="mb-5 last:mb-0">
          <span className="absolute -mr-[25px] mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" />
          {event.kind === "status" ? (
            <>
              <OrderStatusBadge status={event.item.toStatus} />
              {event.item.note && (
                <p className="mt-1 text-xs text-fg-muted">{event.item.note}</p>
              )}
            </>
          ) : event.kind === "report" ? (
            <>
              <Badge color="blue">
                گزارش {event.item.reportType} · نسخه {event.item.version}
              </Badge>
              <p className="mt-1 text-xs text-fg-muted">{event.item.summary}</p>
            </>
          ) : (
            <>
              <Badge
                color={event.kind === "milestone-approved" ? "green" : "purple"}
              >
                {event.title}
              </Badge>
              <p className="mt-1 text-xs text-fg-muted">
                {formatToman(event.item.amount)} · پرداخت{" "}
                {event.item.paymentStatus} · تحویل {event.item.deliveryStatus}
              </p>
            </>
          )}
          <time className="mt-1 block text-xs text-fg-subtle">
            {formatDate(event.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
