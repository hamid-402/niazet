-- Phase 2: durable request idempotency, optimistic order concurrency,
-- package snapshots, financial transition context and append-only ledger.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE "EscrowStatus" ADD VALUE IF NOT EXISTS 'settled';

ALTER TABLE "orders"
  ADD COLUMN "package_snapshot" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "executor_profiles"
  ADD COLUMN "shaba_number" TEXT,
  ADD COLUMN "shaba_verified_at" TIMESTAMP(3);

ALTER TABLE "order_status_history"
  ADD COLUMN "financial_effect_type" TEXT,
  ADD COLUMN "financial_effect_amount" INTEGER,
  ADD COLUMN "context" JSONB;

ALTER TABLE "order_milestones"
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3);

ALTER TABLE "ledger_entries"
  ADD COLUMN "correction_of_id" TEXT;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_correction_of_id_fkey"
  FOREIGN KEY ("correction_of_id") REFERENCES "ledger_entries"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withdrawals"
  ADD COLUMN "shaba_verified_at" TIMESTAMP(3),
  ADD COLUMN "processed_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "withdrawals_idempotency_key_key"
  ON "withdrawals"("idempotency_key");
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_ledger_entry_id_key"
  ON "wallet_transactions"("wallet_id", "ledger_entry_id");
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

DROP INDEX IF EXISTS "idempotency_keys_key_key";
ALTER TABLE "idempotency_keys"
  ADD COLUMN "request_hash" TEXT,
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "idempotency_keys"
SET "request_hash" = encode(digest("scope" || ':' || "key", 'sha256'), 'hex'),
    "expires_at" = "created_at" + INTERVAL '24 hours';

ALTER TABLE "idempotency_keys"
  ALTER COLUMN "request_hash" SET NOT NULL,
  ALTER COLUMN "expires_at" SET NOT NULL;

CREATE UNIQUE INDEX "idempotency_keys_scope_key_key"
  ON "idempotency_keys"("scope", "key");
CREATE INDEX "idempotency_keys_expires_at_idx"
  ON "idempotency_keys"("expires_at");

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "ledger_entries_accounts_distinct" CHECK ("debit_account_id" <> "credit_account_id");

ALTER TABLE "withdrawals"
  ADD CONSTRAINT "withdrawals_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "order_milestones"
  ADD CONSTRAINT "order_milestones_amount_positive" CHECK ("amount" > 0);

-- Ledger and its projection history are immutable. Corrections are new entries.
CREATE OR REPLACE FUNCTION reject_financial_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a correction entry instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();

CREATE TRIGGER wallet_transactions_append_only
BEFORE UPDATE OR DELETE ON "wallet_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();
