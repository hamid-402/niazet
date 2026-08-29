export type UserRole = "customer" | "executor" | "support" | "admin";
export type AdminScope = "super_admin" | "ops_admin" | "finance_admin" | null;

export interface AuthUser {
  id: string;
  role: UserRole;
  adminScope: AdminScope;
  capabilities: ("customer" | "executor")[];
  fullName: string;
  phone: string;
  email: string | null;
}

export type OrderStatus =
  | "draft"
  | "submitted"
  | "pending_triage"
  | "triaging"
  | "pending_quote"
  | "quoted"
  | "pending_payment"
  | "paid"
  | "assigned"
  | "in_progress"
  | "submitted_for_qc"
  | "qc_in_review"
  | "qc_rejected"
  | "ready_for_customer_review"
  | "delivered"
  | "revision_requested"
  | "confirmed"
  | "disputed"
  | "cancelled"
  | "closed";

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  draft: "پیش‌نویس",
  submitted: "ثبت‌شده",
  pending_triage: "در صف بررسی",
  triaging: "در حال بررسی",
  pending_quote: "در انتظار قیمت‌گذاری",
  quoted: "قیمت‌گذاری‌شده",
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  assigned: "ارجاع‌شده",
  in_progress: "در حال اجرا",
  submitted_for_qc: "ارسال‌شده به QC",
  qc_in_review: "در حال بررسی کیفیت",
  qc_rejected: "نیازمند اصلاح (QC)",
  ready_for_customer_review: "آماده بازبینی",
  delivered: "تحویل‌شده",
  revision_requested: "اصلاح خواسته‌شده",
  confirmed: "تاییدشده",
  disputed: "در حال اختلاف",
  cancelled: "لغوشده",
  closed: "بسته‌شده",
};

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  slaHours: number | null;
  deliverables: string | null;
}

export interface ServiceFormField {
  id: string;
  label: string;
  fieldKey: string;
  fieldType:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "radio"
    | "checkbox"
    | "multiselect"
    | "date"
    | "email"
    | "url"
    | string;
  required: boolean;
  options: unknown;
  sortOrder: number;
}

export interface ServiceLine {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  deliverables: string | null;
  pricingModel: "fixed" | "formula" | "manual_quote";
  basePrice: number | null;
  slaHours: number | null;
  revisionPolicy: string | null;
  isActive: boolean;
  packages: ServicePackage[];
  formFields?: ServiceFormField[];
  acceptanceCriteria?: { id: string; description: string }[];
}

export interface PublicHandler {
  id: string;
  publicHandlerCode: string;
  displayAlias: string;
  assignmentRole: string;
  visibleToCustomer: boolean;
}

export interface OrderFile {
  id: string;
  orderId: string;
  fileKind: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  createdAt: string;
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
  packageId?: string | null;
  budgetHint?: number | null;
  formResponses?: unknown;
  version?: number;
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
  milestones?: {
    id: string;
    sequence: number;
    title: string;
    amount: number;
    dueAt: string | null;
    acceptanceCriteria: string | null;
    paymentStatus: string;
    deliveryStatus: string;
    qcStatus: string;
    deliveredAt: string | null;
    approvedAt: string | null;
    createdAt: string;
  }[];
  files?: OrderFile[];
  reports?: {
    id: string;
    reportType: string;
    version: number;
      status: string;
      summary: string;
      progressPercent?: number | null;
    createdAt: string;
    visibleToCustomer: boolean;
    file?: OrderFile | null;
  }[];
  messages?: {
    id: string;
    body: string;
    senderUserId: string;
    createdAt: string;
    visibility: string;
    attachmentFileId?: string | null;
    attachment?: OrderFile | null;
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
      acceptedAt?: string | null;
      unassignedAt: string | null;
      executionChecklistItems?: {
        id: string;
        label: string;
        isCompleted: boolean;
        completedAt: string | null;
      }[];
      executorProfile: {
      id: string;
      displayAlias: string;
      publicHandlerCode: string;
      };
    }[];
    qcReviews?: {
      id: string;
      result: string | null;
      comment: string | null;
      reviewedAt: string | null;
      items: {
        id: string;
        passed: boolean;
        note: string | null;
        checklistItem: { label: string };
      }[];
    }[];
  }

export type TicketStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "waiting_customer"
  | "waiting_internal"
  | "resolved"
  | "closed"
  | "escalated";

export const TICKET_STATUS_LABELS_FA: Record<TicketStatus, string> = {
  open: "باز",
  assigned: "اختصاص‌یافته",
  in_progress: "در حال بررسی",
  waiting_customer: "منتظر مشتری",
  waiting_internal: "منتظر داخلی",
  resolved: "حل‌شده",
  closed: "بسته‌شده",
  escalated: "ارجاع‌شده (escalation)",
};

export interface Ticket {
  id: string;
  orderId?: string | null;
  code: string;
  subject: string;
  category: string;
  priority: string;
  status: TicketStatus;
    slaDueAt: string | null;
    assignedToUserId?: string | null;
    createdAt: string;
    updatedAt?: string;
    customer?: { fullName: string; phone: string };
    order?: { code: string } | null;
    assignedTo?: { id: string; fullName: string } | null;
  }

export interface TicketMessage {
  id: string;
  body: string;
  senderUserId: string;
  visibility: "customer_visible" | "internal_only";
  createdAt: string;
  attachmentFileId?: string | null;
  attachment?: OrderFile | null;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  transactions: {
    id: string;
    direction: "debit" | "credit";
    amount: number;
    balanceAfter: number;
    referenceType: string;
    createdAt: string;
  }[];
}

export interface StaffTeam {
  id: string;
  name: string;
  code: string;
  description: string | null;
  _count?: { members: number };
}

export interface StaffSkill {
  id: string;
  name: string;
  category: string | null;
  _count?: { executorSkills: number };
}

export interface StaffAttendanceRecord {
  id: string;
  workDate: string;
  status: 'present' | 'remote' | 'leave' | 'sick_leave' | 'absent';
  note: string | null;
  recordedBy?: { fullName: string };
  createdAt: string;
  updatedAt: string;
}

export interface ExecutorSkillAssignment {
  id: string;
  level: number;
  skillId: string;
  skill: StaffSkill;
}

export interface StaffRiskAlert {
  id: string;
  riskType:
    | 'over_capacity'
    | 'burnout_risk'
    | 'sla_risk'
    | 'quality_regression';
  severity: 'warning' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'cleared';
  evidence: Record<string, unknown> | null;
  detectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  acknowledgedBy?: { fullName: string } | null;
}

export interface ExecutorProfile {
  id: string;
  publicHandlerCode: string;
  displayAlias: string;
  executorType: string;
  status: string;
  verificationStatus: string;
  capacityPercent: number;
  qcPassRate: number;
  onTimeDeliveryRate: number;
  customerRatingAvg: number;
  complaintCount: number;
  complimentCount: number;
  riskScore: number;
  teamId?: string | null;
  team?: StaffTeam | null;
  skills?: ExecutorSkillAssignment[];
  attendanceRecords?: StaffAttendanceRecord[];
  capacitySnapshots?: {
    id: string;
    snapshotDate: string;
    capacityPercent: number;
    activeOrders: number;
  }[];
  riskAlerts?: StaffRiskAlert[];
  user?: {
    id?: string;
    fullName: string;
    phone: string;
    status: string;
    capabilities?: { id: string; capability: 'customer' | 'executor' }[];
  };
}
