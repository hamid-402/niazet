-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'executor', 'support', 'admin');

-- CreateEnum
CREATE TYPE "AdminScope" AS ENUM ('super_admin', 'ops_admin', 'finance_admin');

-- CreateEnum
CREATE TYPE "CapabilityType" AS ENUM ('customer', 'executor');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending_verification', 'active', 'suspended', 'blocked');

-- CreateEnum
CREATE TYPE "ExecutorType" AS ENUM ('internal_staff', 'vetted_external');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ExecutorStatus" AS ENUM ('active', 'over_capacity', 'on_leave', 'under_review', 'blocked');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('fixed', 'formula', 'manual_quote');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'submitted', 'pending_triage', 'triaging', 'pending_quote', 'quoted', 'pending_payment', 'paid', 'assigned', 'in_progress', 'submitted_for_qc', 'qc_in_review', 'qc_rejected', 'ready_for_customer_review', 'delivered', 'revision_requested', 'confirmed', 'disputed', 'cancelled', 'closed');

-- CreateEnum
CREATE TYPE "OrderStatusSource" AS ENUM ('customer', 'admin', 'executor', 'system', 'support');

-- CreateEnum
CREATE TYPE "ConfidentialityLevel" AS ENUM ('normal', 'sensitive', 'highly_sensitive');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('input', 'output', 'revision', 'message_attachment', 'ticket_attachment', 'report', 'invoice');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('pending', 'clean', 'infected', 'skipped');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('progress', 'qc', 'delivery', 'management', 'support', 'staff_performance');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('customer_visible', 'internal_only');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('pursuit_owner', 'team_lead', 'contributor', 'qc_reviewer');

-- CreateEnum
CREATE TYPE "QcResult" AS ENUM ('passed', 'needs_rework', 'rejected');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('payment', 'quality', 'delay', 'file', 'report', 'support', 'complaint', 'compliment', 'other');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'assigned', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed', 'escalated');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('customer_wallet', 'executor_wallet', 'platform_commission', 'platform_escrow', 'payment_gateway_clearing');

-- CreateEnum
CREATE TYPE "LedgerReferenceType" AS ENUM ('payment', 'escrow_release', 'escrow_refund', 'withdrawal', 'commission', 'refund');

-- CreateEnum
CREATE TYPE "WalletTxDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'verifying', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('held', 'partially_released', 'released', 'partially_refunded', 'refunded', 'disputed');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'approved', 'rejected', 'processed');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "DisputeResolutionType" AS ENUM ('rework', 'refund_full', 'refund_partial', 'release_to_executor', 'close');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('rating', 'complaint', 'compliment');

-- CreateEnum
CREATE TYPE "FeedbackTargetType" AS ENUM ('order', 'team', 'executor', 'support', 'qc');

-- CreateEnum
CREATE TYPE "FeedbackVisibility" AS ENUM ('internal_only', 'admin_and_target');

-- CreateEnum
CREATE TYPE "AuditSensitivity" AS ENUM ('normal', 'sensitive', 'critical');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "OnboardingStage" AS ENUM ('registered', 'identity_verification', 'skills_exam', 'interview', 'reference_check', 'contract', 'nda', 'trial_period', 'limited_access', 'initial_evaluation', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "admin_scope" "AdminScope",
    "status" "UserStatus" NOT NULL DEFAULT 'pending_verification',
    "full_name" TEXT NOT NULL,
    "display_alias" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_capabilities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "capability" "CapabilityType" NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "identifier" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "identifier" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executor_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "executor_type" "ExecutorType" NOT NULL DEFAULT 'internal_staff',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'approved',
    "public_handler_code" TEXT NOT NULL,
    "display_alias" TEXT NOT NULL,
    "team_id" TEXT,
    "status" "ExecutorStatus" NOT NULL DEFAULT 'active',
    "capacity_percent" INTEGER NOT NULL DEFAULT 0,
    "qc_pass_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "on_time_delivery_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "customer_rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "complaint_count" INTEGER NOT NULL DEFAULT 0,
    "compliment_count" INTEGER NOT NULL DEFAULT 0,
    "risk_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executor_skills" (
    "id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "executor_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_capacity_snapshots" (
    "id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "capacity_percent" INTEGER NOT NULL,
    "active_orders" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_capacity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_performance_snapshots" (
    "id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "completed_orders" INTEGER NOT NULL DEFAULT 0,
    "active_orders" INTEGER NOT NULL DEFAULT 0,
    "on_time_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "qc_pass_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "avg_customer_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "complaint_count" INTEGER NOT NULL DEFAULT 0,
    "compliment_count" INTEGER NOT NULL DEFAULT 0,
    "risk_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executor_onboardings" (
    "id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "stage" "OnboardingStage" NOT NULL DEFAULT 'registered',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executor_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_lines" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deliverables" TEXT,
    "pricing_model" "PricingModel" NOT NULL DEFAULT 'manual_quote',
    "base_price" INTEGER,
    "sla_hours" INTEGER,
    "revision_policy" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_packages" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER,
    "sla_hours" INTEGER,
    "deliverables" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_form_fields" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_acceptance_criteria" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "service_acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_checklist_templates" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "qc_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_checklist_items" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "qc_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "package_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "brief_description" TEXT NOT NULL,
    "form_responses" JSONB,
    "confidentiality_level" "ConfidentialityLevel" NOT NULL DEFAULT 'normal',
    "budget_hint" INTEGER,
    "final_price" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "revisions_allowed" INTEGER NOT NULL DEFAULT 2,
    "revisions_used" INTEGER NOT NULL DEFAULT 0,
    "risk_flags" JSONB,
    "submitted_at" TIMESTAMP(3),
    "quoted_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_user_id" TEXT,
    "source" "OrderStatusSource" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_milestones" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3),
    "acceptance_criteria" TEXT,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "qc_status" TEXT NOT NULL DEFAULT 'not_required',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_acceptance_criteria" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_met" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_files" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "file_kind" "FileKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "scan_status" "FileScanStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_reports" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "file_id" TEXT,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_messages" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "attachment_file_id" TEXT,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'customer_visible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_public_handlers" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "internal_user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "public_handler_code" TEXT NOT NULL,
    "display_alias" TEXT NOT NULL,
    "assignment_role" "AssignmentRole" NOT NULL,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_to" TIMESTAMP(3),

    CONSTRAINT "order_public_handlers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_assignments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "team_id" TEXT,
    "assigned_by_user_id" TEXT NOT NULL,
    "assignment_role" "AssignmentRole" NOT NULL DEFAULT 'contributor',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),

    CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_reviews" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "reviewer_user_id" TEXT NOT NULL,
    "result" "QcResult",
    "comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_review_items" (
    "id" TEXT NOT NULL,
    "qc_review_id" TEXT NOT NULL,
    "checklist_item_id" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "qc_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "assigned_to_user_id" TEXT,
    "subject" TEXT NOT NULL,
    "related_public_handler_code" TEXT,
    "sla_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_file_id" TEXT,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'customer_visible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_escalations" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "escalated_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "escalated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ticket_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_sla_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "owner_user_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "reference_type" "LedgerReferenceType" NOT NULL,
    "reference_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "ledger_entry_id" TEXT NOT NULL,
    "direction" "WalletTxDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference_type" "LedgerReferenceType" NOT NULL,
    "reference_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "milestone_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "gateway" TEXT NOT NULL,
    "gateway_ref" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_holds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "status" "EscrowStatus" NOT NULL DEFAULT 'held',
    "held_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "escrow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "escrow_hold_id" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "decided_by_user_id" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "ledger_entry_reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "executor_profile_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "shaba_number" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_file_key" TEXT,
    "email_sent_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution_type" "DisputeResolutionType",
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "financial_effect_amount" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "target_type" "FeedbackTargetType" NOT NULL,
    "target_internal_id" TEXT,
    "public_handler_code" TEXT,
    "rating" INTEGER,
    "satisfaction_percent" INTEGER,
    "feedback_type" "FeedbackType" NOT NULL,
    "comment" TEXT,
    "visibility" "FeedbackVisibility" NOT NULL DEFAULT 'admin_and_target',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "UserRole",
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "sensitivity" "AuditSensitivity" NOT NULL DEFAULT 'normal',
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_capabilities_user_id_capability_key" ON "user_capabilities"("user_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "executor_profiles_user_id_key" ON "executor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "executor_profiles_public_handler_code_key" ON "executor_profiles"("public_handler_code");

-- CreateIndex
CREATE UNIQUE INDEX "executor_skills_executor_profile_id_skill_id_key" ON "executor_skills"("executor_profile_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "executor_onboardings_executor_profile_id_key" ON "executor_onboardings"("executor_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_lines_slug_key" ON "service_lines"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "service_form_fields_service_id_field_key_key" ON "service_form_fields"("service_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_milestones_order_id_sequence_key" ON "order_milestones"("order_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "order_files_storage_key_key" ON "order_files"("storage_key");

-- CreateIndex
CREATE INDEX "order_messages_order_id_idx" ON "order_messages"("order_id");

-- CreateIndex
CREATE INDEX "order_public_handlers_order_id_idx" ON "order_public_handlers"("order_id");

-- CreateIndex
CREATE INDEX "order_assignments_order_id_idx" ON "order_assignments"("order_id");

-- CreateIndex
CREATE INDEX "order_assignments_executor_profile_id_idx" ON "order_assignments"("executor_profile_id");

-- CreateIndex
CREATE INDEX "qc_reviews_order_id_idx" ON "qc_reviews"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");

-- CreateIndex
CREATE INDEX "tickets_customer_id_idx" ON "tickets"("customer_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_owner_user_id_key" ON "ledger_accounts"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_reference_type_reference_id_idx" ON "ledger_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_holds_payment_id_key" ON "escrow_holds"("payment_id");

-- CreateIndex
CREATE INDEX "escrow_holds_order_id_idx" ON "escrow_holds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "feedback_order_id_idx" ON "feedback"("order_id");

-- CreateIndex
CREATE INDEX "feedback_target_type_target_internal_id_idx" ON "feedback"("target_type", "target_internal_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_idx" ON "notification_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_profiles" ADD CONSTRAINT "executor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_profiles" ADD CONSTRAINT "executor_profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_skills" ADD CONSTRAINT "executor_skills_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_skills" ADD CONSTRAINT "executor_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_capacity_snapshots" ADD CONSTRAINT "staff_capacity_snapshots_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_performance_snapshots" ADD CONSTRAINT "staff_performance_snapshots_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executor_onboardings" ADD CONSTRAINT "executor_onboardings_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_form_fields" ADD CONSTRAINT "service_form_fields_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_acceptance_criteria" ADD CONSTRAINT "service_acceptance_criteria_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_checklist_templates" ADD CONSTRAINT "qc_checklist_templates_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_checklist_items" ADD CONSTRAINT "qc_checklist_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "qc_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_milestones" ADD CONSTRAINT "order_milestones_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_acceptance_criteria" ADD CONSTRAINT "order_acceptance_criteria_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reports" ADD CONSTRAINT "order_reports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reports" ADD CONSTRAINT "order_reports_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reports" ADD CONSTRAINT "order_reports_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "order_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_attachment_file_id_fkey" FOREIGN KEY ("attachment_file_id") REFERENCES "order_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_public_handlers" ADD CONSTRAINT "order_public_handlers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_public_handlers" ADD CONSTRAINT "order_public_handlers_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_public_handlers" ADD CONSTRAINT "order_public_handlers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_reviews" ADD CONSTRAINT "qc_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_reviews" ADD CONSTRAINT "qc_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_review_items" ADD CONSTRAINT "qc_review_items_qc_review_id_fkey" FOREIGN KEY ("qc_review_id") REFERENCES "qc_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_review_items" ADD CONSTRAINT "qc_review_items_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "qc_checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_escalated_by_user_id_fkey" FOREIGN KEY ("escalated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sla_events" ADD CONSTRAINT "ticket_sla_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "order_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_escrow_hold_id_fkey" FOREIGN KEY ("escrow_hold_id") REFERENCES "escrow_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_executor_profile_id_fkey" FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
