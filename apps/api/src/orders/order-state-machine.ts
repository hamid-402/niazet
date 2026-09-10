import { OrderStatus, OrderStatusSource } from '@prisma/client';

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

type TransitionSources = Partial<
  Record<OrderStatus, Partial<Record<OrderStatus, OrderStatusSource[]>>>
>;

export const ORDER_TRANSITION_SOURCES: TransitionSources = {
  draft: {
    submitted: [OrderStatusSource.customer],
    cancelled: [OrderStatusSource.customer, OrderStatusSource.admin],
  },
  submitted: {
    pending_triage: [OrderStatusSource.system, OrderStatusSource.admin],
    cancelled: [OrderStatusSource.customer, OrderStatusSource.admin],
  },
  pending_triage: {
    triaging: [OrderStatusSource.admin],
    cancelled: [OrderStatusSource.admin, OrderStatusSource.customer],
  },
  triaging: {
    pending_quote: [OrderStatusSource.admin],
    quoted: [OrderStatusSource.admin, OrderStatusSource.system],
    cancelled: [OrderStatusSource.admin, OrderStatusSource.customer],
  },
  pending_quote: {
    quoted: [OrderStatusSource.admin],
    cancelled: [OrderStatusSource.admin, OrderStatusSource.customer],
  },
  quoted: {
    pending_payment: [OrderStatusSource.customer],
    cancelled: [OrderStatusSource.admin, OrderStatusSource.customer],
  },
  pending_payment: {
    paid: [OrderStatusSource.system],
    cancelled: [OrderStatusSource.admin, OrderStatusSource.customer],
  },
  paid: {
    assigned: [OrderStatusSource.admin],
    cancelled: [OrderStatusSource.admin],
  },
  assigned: {
    in_progress: [OrderStatusSource.executor],
    cancelled: [OrderStatusSource.admin],
  },
  in_progress: {
    submitted_for_qc: [OrderStatusSource.executor],
    cancelled: [OrderStatusSource.admin],
    disputed: [
      OrderStatusSource.customer,
      OrderStatusSource.admin,
      OrderStatusSource.support,
    ],
  },
  submitted_for_qc: { qc_in_review: [OrderStatusSource.system] },
  qc_in_review: {
    qc_rejected: [OrderStatusSource.admin],
    ready_for_customer_review: [OrderStatusSource.admin],
  },
  qc_rejected: { in_progress: [OrderStatusSource.system] },
  ready_for_customer_review: { delivered: [OrderStatusSource.system] },
  delivered: {
    confirmed: [OrderStatusSource.customer, OrderStatusSource.system],
    revision_requested: [OrderStatusSource.customer],
    disputed: [
      OrderStatusSource.customer,
      OrderStatusSource.admin,
      OrderStatusSource.support,
    ],
  },
  revision_requested: { in_progress: [OrderStatusSource.system] },
  disputed: {
    in_progress: [OrderStatusSource.admin],
    cancelled: [OrderStatusSource.admin],
    closed: [OrderStatusSource.admin],
    confirmed: [OrderStatusSource.admin],
  },
  confirmed: { closed: [OrderStatusSource.system, OrderStatusSource.admin] },
};

export function isTransitionAllowedForSource(
  from: OrderStatus,
  to: OrderStatus,
  source: OrderStatusSource,
) {
  return (
    isTransitionAllowed(from, to) &&
    (ORDER_TRANSITION_SOURCES[from]?.[to]?.includes(source) ?? false)
  );
}

/** لغو از هر وضعیت غیرنهایی مجاز است (بند ۱.۴ الحاقیه). */
export function isCancellable(status: OrderStatus): boolean {
  return status !== OrderStatus.cancelled && status !== OrderStatus.closed;
}

export const FINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.cancelled,
  OrderStatus.closed,
];
