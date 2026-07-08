import { OrderStatus } from '@prisma/client';

/**
 * جدول گذار وضعیت سفارش — دقیقاً مطابق
 * docs/specs/addendum-state-machine-ledger.md بخش ۱.۳.
 *
 * `disputed -> *` عمداً از این جدول عمومی حذف شده چون طبق بند ۱.۴ الحاقیه
 * فقط باید از طریق endpoint اختصاصی resolve-dispute انجام شود، نه از مسیر
 * عمومی تغییر وضعیت.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: [OrderStatus.submitted, OrderStatus.cancelled],
  submitted: [OrderStatus.pending_triage, OrderStatus.cancelled],
  pending_triage: [OrderStatus.triaging, OrderStatus.cancelled],
  triaging: [
    OrderStatus.pending_quote,
    OrderStatus.quoted,
    OrderStatus.cancelled,
  ],
  pending_quote: [OrderStatus.quoted, OrderStatus.cancelled],
  quoted: [OrderStatus.pending_payment, OrderStatus.cancelled],
  pending_payment: [OrderStatus.paid, OrderStatus.cancelled],
  paid: [OrderStatus.assigned, OrderStatus.cancelled],
  assigned: [OrderStatus.in_progress, OrderStatus.cancelled],
  in_progress: [
    OrderStatus.submitted_for_qc,
    OrderStatus.cancelled,
    OrderStatus.disputed,
  ],
  submitted_for_qc: [OrderStatus.qc_in_review],
  qc_in_review: [
    OrderStatus.qc_rejected,
    OrderStatus.ready_for_customer_review,
  ],
  qc_rejected: [OrderStatus.in_progress],
  ready_for_customer_review: [OrderStatus.delivered],
  delivered: [
    OrderStatus.confirmed,
    OrderStatus.revision_requested,
    OrderStatus.disputed,
  ],
  revision_requested: [OrderStatus.in_progress],
  disputed: [
    OrderStatus.in_progress,
    OrderStatus.cancelled,
    OrderStatus.closed,
    OrderStatus.confirmed,
  ],
  confirmed: [OrderStatus.closed],
  cancelled: [],
  closed: [],
};

export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** لغو از هر وضعیت غیرنهایی مجاز است (بند ۱.۴ الحاقیه). */
export function isCancellable(status: OrderStatus): boolean {
  return status !== OrderStatus.cancelled && status !== OrderStatus.closed;
}

export const FINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.cancelled,
  OrderStatus.closed,
];
