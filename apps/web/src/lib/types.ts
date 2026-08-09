export type UserRole = 'customer' | 'executor' | 'support' | 'admin';
export type AdminScope = 'super_admin' | 'ops_admin' | 'finance_admin' | null;

export interface AuthUser {
  id: string;
  role: UserRole;
  adminScope: AdminScope;
  capabilities: ('customer' | 'executor')[];
  fullName: string;
  phone: string;
  email: string | null;
}

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'pending_triage'
  | 'triaging'
  | 'pending_quote'
  | 'quoted'
  | 'pending_payment'
  | 'paid'
  | 'assigned'
  | 'in_progress'
  | 'submitted_for_qc'
  | 'qc_in_review'
  | 'qc_rejected'
  | 'ready_for_customer_review'
  | 'delivered'
  | 'revision_requested'
  | 'confirmed'
  | 'disputed'
  | 'cancelled'
  | 'closed';

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  draft: 'پیش‌نویس',
  submitted: 'ثبت‌شده',
  pending_triage: 'در صف بررسی',
  triaging: 'در حال بررسی',
  pending_quote: 'در انتظار قیمت‌گذاری',
  quoted: 'قیمت‌گذاری‌شده',
  pending_payment: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  assigned: 'ارجاع‌شده',
  in_progress: 'در حال اجرا',
  submitted_for_qc: 'ارسال‌شده به QC',
  qc_in_review: 'در حال بررسی کیفیت',
  qc_rejected: 'نیازمند اصلاح (QC)',
  ready_for_customer_review: 'آماده بازبینی',
  delivered: 'تحویل‌شده',
  revision_requested: 'اصلاح خواسته‌شده',
  confirmed: 'تاییدشده',
  disputed: 'در حال اختلاف',
  cancelled: 'لغوشده',
  closed: 'بسته‌شده',
};

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  slaHours: number | null;
  deliverables: string | null;
}

export interface ServiceLine {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  deliverables: string | null;
  pricingModel: 'fixed' | 'formula' | 'manual_quote';
  basePrice: number | null;
  slaHours: number | null;
  revisionPolicy: string | null;
  isActive: boolean;
  packages: ServicePackage[];
  formFields?: {
    id: string;
    label: string;
    fieldKey: string;
    fieldType: string;
    required: boolean;
  }[];
  acceptanceCriteria?: { id: string; description: string }[];
}

export interface PublicHandler {
  id: string;
  publicHandlerCode: string;
  displayAlias: string;
  assignmentRole: string;
  visibleToCustomer: boolean;
}

export interface OrderSummary {
  id: string;
  code: string;
  title: string;
  status: OrderStatus;
  urgency: string;
  finalPrice: number | null;
  createdAt: string;
  serviceLine?: { title: string };
  publicHandlers?: PublicHandler[];
}

export interface OrderDetail extends OrderSummary {
  briefDescription: string;
  customerId: string;
  revisionsAllowed: number;
  revisionsUsed: number;
  statusHistory?: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: string;
    source: string;
  }[];
  files?: {
    id: string;
    originalName: string;
    fileKind: string;
    createdAt: string;
  }[];
  reports?: {
    id: string;
    reportType: string;
    summary: string;
    createdAt: string;
    visibleToCustomer: boolean;
  }[];
  messages?: {
    id: string;
    body: string;
    senderUserId: string;
    createdAt: string;
    visibility: string;
  }[];
  payments?: {
    id: string;
    amount: number;
    status: string;
    createdAt: string;
  }[];
  escrowHolds?: { id: string; amount: number; status: string }[];
  tickets?: { id: string; code: string; subject: string; status: string }[];
  feedback?: {
    id: string;
    feedbackType: string;
    rating: number | null;
    comment: string | null;
  }[];
  acceptanceCriteria?: { id: string; description: string; isMet: boolean }[];
  assignments?: {
    id: string;
    unassignedAt: string | null;
    executorProfile: { id: string; displayAlias: string; publicHandlerCode: string };
  }[];
}

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_internal'
  | 'resolved'
  | 'closed'
  | 'escalated';

export const TICKET_STATUS_LABELS_FA: Record<TicketStatus, string> = {
  open: 'باز',
  assigned: 'اختصاص‌یافته',
  in_progress: 'در حال بررسی',
  waiting_customer: 'منتظر مشتری',
  waiting_internal: 'منتظر داخلی',
  resolved: 'حل‌شده',
  closed: 'بسته‌شده',
  escalated: 'ارجاع‌شده (escalation)',
};

export interface Ticket {
  id: string;
  code: string;
  subject: string;
  category: string;
  priority: string;
  status: TicketStatus;
  slaDueAt: string | null;
  createdAt: string;
  customer?: { fullName: string; phone: string };
  order?: { code: string } | null;
}

export interface TicketMessage {
  id: string;
  body: string;
  senderUserId: string;
  visibility: 'customer_visible' | 'internal_only';
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  transactions: {
    id: string;
    direction: 'debit' | 'credit';
    amount: number;
    balanceAfter: number;
    referenceType: string;
    createdAt: string;
  }[];
}

export interface ExecutorProfile {
  id: string;
  publicHandlerCode: string;
  displayAlias: string;
  executorType: string;
  status: string;
  capacityPercent: number;
  qcPassRate: number;
  onTimeDeliveryRate: number;
  customerRatingAvg: number;
  complaintCount: number;
  complimentCount: number;
  riskScore: number;
  team?: { name: string; code: string } | null;
  user?: { fullName: string; phone: string; status: string };
}
