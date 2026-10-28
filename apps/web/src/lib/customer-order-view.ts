import type { OrderStatus } from './types';

const ACTIONABLE = new Set<OrderStatus>([
  'quoted',
  'pending_payment',
  'delivered',
  'revision_requested',
  'qc_rejected',
]);

export const isCustomerOrderActionable = (status: OrderStatus) => ACTIONABLE.has(status);
export const isCustomerOrderOpen = (status: OrderStatus) => status !== 'closed' && status !== 'cancelled';
