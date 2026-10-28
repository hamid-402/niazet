-- Phase 4: trackable, idempotent feedback/complaint/compliment references.
CREATE TYPE "FeedbackStatus" AS ENUM ('submitted', 'in_review', 'resolved', 'closed');

ALTER TABLE "feedback"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "status" "FeedbackStatus" NOT NULL DEFAULT 'submitted',
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" TEXT;

UPDATE "feedback"
SET "code" = 'FBK-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 10));

ALTER TABLE "feedback" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "feedback_code_key" ON "feedback"("code");
CREATE UNIQUE INDEX "feedback_idempotency_key_key" ON "feedback"("idempotency_key");
CREATE INDEX "feedback_customer_id_created_at_idx" ON "feedback"("customer_id", "created_at");
CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at");
