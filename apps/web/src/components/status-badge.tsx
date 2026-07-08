import { Badge } from './ui';
import { ORDER_STATUS_LABELS_FA, TICKET_STATUS_LABELS_FA, type OrderStatus, type TicketStatus } from '@/lib/types';

const ORDER_STATUS_COLOR: Record<OrderStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple'> = {
  draft: 'gray',
  submitted: 'blue',
  pending_triage: 'blue',
  triaging: 'blue',
  pending_quote: 'yellow',
  quoted: 'yellow',
  pending_payment: 'yellow',
  paid: 'green',
  assigned: 'blue',
  in_progress: 'blue',
  submitted_for_qc: 'purple',
  qc_in_review: 'purple',
  qc_rejected: 'red',
  ready_for_customer_review: 'green',
  delivered: 'green',
  revision_requested: 'yellow',
  confirmed: 'green',
  disputed: 'red',
  cancelled: 'gray',
  closed: 'gray',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge color={ORDER_STATUS_COLOR[status]}>{ORDER_STATUS_LABELS_FA[status]}</Badge>;
}

const TICKET_STATUS_COLOR: Record<TicketStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple'> = {
  open: 'blue',
  assigned: 'blue',
  in_progress: 'yellow',
  waiting_customer: 'purple',
  waiting_internal: 'purple',
  resolved: 'green',
  closed: 'gray',
  escalated: 'red',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge color={TICKET_STATUS_COLOR[status]}>{TICKET_STATUS_LABELS_FA[status]}</Badge>;
}
