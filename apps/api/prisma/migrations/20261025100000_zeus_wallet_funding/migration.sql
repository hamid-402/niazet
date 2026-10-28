-- Additive only. No backfill, balance rewrite or alteration of existing orders.
BEGIN;

CREATE TABLE "wallet_funding_intents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "gateway" TEXT NOT NULL,
  "gateway_ref" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at" TIMESTAMP(3),
  CONSTRAINT "wallet_funding_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_funding_intents_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "wallet_funding_intents_currency_check" CHECK ("currency" = 'IRT'),
  CONSTRAINT "wallet_funding_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wallet_funding_intents_idempotency_key_key" ON "wallet_funding_intents"("idempotency_key");
CREATE INDEX "wallet_funding_intents_user_id_created_at_idx" ON "wallet_funding_intents"("user_id", "created_at");

CREATE TABLE "user_login_states" (
  "user_id" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "last_successful_login_at" TIMESTAMP(3)
);
CREATE TABLE "service_contract_policies" (
  "id" TEXT PRIMARY KEY,
  "service_id" TEXT NOT NULL REFERENCES "service_lines"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "normal_rate_bps" INTEGER NOT NULL DEFAULT 0 CHECK ("normal_rate_bps" >= 0),
  "urgent_rate_bps" INTEGER NOT NULL DEFAULT 3000 CHECK ("urgent_rate_bps" >= 0),
  "same_day_rate_bps" INTEGER NOT NULL DEFAULT 8000 CHECK ("same_day_rate_bps" >= 0),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "service_contract_policies_service_id_version_key" ON "service_contract_policies"("service_id", "version");
CREATE TABLE "order_contract_snapshots" (
  "order_id" TEXT PRIMARY KEY REFERENCES "orders"("id") ON DELETE RESTRICT,
  "base_price" INTEGER CHECK ("base_price" >= 0),
  "surcharge_rate_bps" INTEGER CHECK ("surcharge_rate_bps" >= 0),
  "surcharge_amount" INTEGER CHECK ("surcharge_amount" >= 0),
  "deadline_normal" TIMESTAMP(3),
  "deadline_effective" TIMESTAMP(3),
  "internal_note" TEXT,
  "policy_snapshot" JSONB,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ticket_sla_policy_snapshots" (
  "ticket_id" TEXT PRIMARY KEY REFERENCES "tickets"("id") ON DELETE RESTRICT,
  "policy_version" INTEGER NOT NULL CHECK ("policy_version" > 0),
  "first_response_business_minutes" INTEGER NOT NULL CHECK ("first_response_business_minutes" > 0),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
  "calendar" JSONB NOT NULL,
  "first_response_deadline" TIMESTAMP(3),
  "first_meaningful_reply_at" TIMESTAMP(3),
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public_service_reviews" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "customer_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" TEXT,
  "public_consent" BOOLEAN NOT NULL DEFAULT false,
  "moderation_status" TEXT NOT NULL DEFAULT 'pending' CHECK ("moderation_status" IN ('pending','approved','rejected')),
  "reviewed_by_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_service_reviews_publish_check" CHECK ("published_at" IS NULL OR ("public_consent" AND "moderation_status" = 'approved' AND "reviewed_by_user_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "public_service_reviews_order_id_key" ON "public_service_reviews"("order_id");
CREATE INDEX "public_service_reviews_moderation_status_published_at_idx" ON "public_service_reviews"("moderation_status", "published_at");
COMMIT;
