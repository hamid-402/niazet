-- Phase 4: customer identity/billing profile, immutable invoice snapshot and privacy requests.
CREATE TYPE "CustomerAccountType" AS ENUM ('individual', 'company');
CREATE TYPE "PrivacyRequestType" AS ENUM ('data_export', 'account_deletion');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('pending', 'completed', 'rejected');

CREATE TABLE "customer_profiles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_type" "CustomerAccountType" NOT NULL DEFAULT 'individual',
  "national_id" TEXT,
  "company_name" TEXT,
  "company_national_id" TEXT,
  "company_registration_number" TEXT,
  "economic_code" TEXT,
  "billing_recipient_name" TEXT,
  "invoice_email" TEXT,
  "province" TEXT,
  "city" TEXT,
  "address_line" TEXT,
  "postal_code" TEXT,
  "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
  "analytics_consent" BOOLEAN NOT NULL DEFAULT false,
  "privacy_policy_accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_profiles_user_id_key"
  ON "customer_profiles"("user_id");
ALTER TABLE "customer_profiles"
  ADD CONSTRAINT "customer_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "privacy_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "decision_note" TEXT,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_user_id_request_type_status_idx"
  ON "privacy_requests"("user_id", "request_type", "status");
ALTER TABLE "privacy_requests"
  ADD CONSTRAINT "privacy_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD COLUMN "billing_snapshot" JSONB;
