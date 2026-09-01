import { OrderStatus, OrderStatusSource } from '@prisma/client';
import {
  FINAL_ORDER_STATUSES,
  ORDER_TRANSITIONS,
  ORDER_TRANSITION_SOURCES,
  isCancellable,
  isTransitionAllowed,
  isTransitionAllowedForSource,
} from './order-state-machine';

describe('order-state-machine', () => {
  it('defines every enum status and exactly mirrors every allowed transition', () => {
    const statuses = Object.values(OrderStatus);
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...statuses].sort());
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isTransitionAllowed(from, to)).toBe(ORDER_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('assigns at least one actor source to every transition and no source to a forbidden transition', () => {
    const statuses = Object.values(OrderStatus);
    const sources = Object.values(OrderStatusSource);
    for (const from of statuses) {
      for (const to of statuses) {
        const allowedSources = ORDER_TRANSITION_SOURCES[from]?.[to] ?? [];
        expect(allowedSources.length > 0).toBe(ORDER_TRANSITIONS[from].includes(to));
        for (const source of sources) {
          expect(isTransitionAllowedForSource(from, to, source)).toBe(allowedSources.includes(source));
        }
      }
    }
  });

  it('keeps final states absorbing with no transition sources', () => {
    for (const status of FINAL_ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).toEqual([]);
      expect(ORDER_TRANSITION_SOURCES[status]).toBeUndefined();
    }
  });

  it('allows the documented happy path in order', () => {
    const happyPath: OrderStatus[] = [
      OrderStatus.draft,
      OrderStatus.submitted,
      OrderStatus.pending_triage,
      OrderStatus.triaging,
      OrderStatus.pending_quote,
      OrderStatus.quoted,
      OrderStatus.pending_payment,
      OrderStatus.paid,
      OrderStatus.assigned,
      OrderStatus.in_progress,
      OrderStatus.submitted_for_qc,
      OrderStatus.qc_in_review,
      OrderStatus.ready_for_customer_review,
      OrderStatus.delivered,
      OrderStatus.confirmed,
      OrderStatus.closed,
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isTransitionAllowed(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('rejects transitions that skip states', () => {
    expect(isTransitionAllowed(OrderStatus.draft, OrderStatus.paid)).toBe(
      false,
    );
    expect(
      isTransitionAllowed(OrderStatus.pending_triage, OrderStatus.assigned),
    ).toBe(false);
  });

  it('only allows disputed to move via admin-mediated outcomes', () => {
    expect(
      isTransitionAllowed(OrderStatus.disputed, OrderStatus.in_progress),
    ).toBe(true);
    expect(
      isTransitionAllowed(OrderStatus.disputed, OrderStatus.cancelled),
    ).toBe(true);
    expect(isTransitionAllowed(OrderStatus.disputed, OrderStatus.closed)).toBe(
      true,
    );
    expect(
      isTransitionAllowed(OrderStatus.disputed, OrderStatus.confirmed),
    ).toBe(true);
    expect(isTransitionAllowed(OrderStatus.disputed, OrderStatus.paid)).toBe(
      false,
    );
  });

  it('treats cancelled and closed as final states', () => {
    for (const status of FINAL_ORDER_STATUSES) {
      expect(isCancellable(status)).toBe(false);
    }
    expect(isCancellable(OrderStatus.in_progress)).toBe(true);
  });

  it('does not allow qc_in_review to skip straight to delivered', () => {
    expect(
      isTransitionAllowed(OrderStatus.qc_in_review, OrderStatus.delivered),
    ).toBe(false);
  });

  it('enforces the actor/source for transitions', () => {
    expect(
      isTransitionAllowedForSource(
        OrderStatus.assigned,
        OrderStatus.in_progress,
        OrderStatusSource.executor,
      ),
    ).toBe(true);
    expect(
      isTransitionAllowedForSource(
        OrderStatus.assigned,
        OrderStatus.in_progress,
        OrderStatusSource.customer,
      ),
    ).toBe(false);
    expect(
      isTransitionAllowedForSource(
        OrderStatus.disputed,
        OrderStatus.closed,
        OrderStatusSource.admin,
      ),
    ).toBe(true);
  });
});
