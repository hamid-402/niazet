ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'dead_letter';

CREATE TYPE "BackgroundJobStatus" AS ENUM ('running', 'succeeded', 'failed');

ALTER TABLE "outbox_events"
  ADD COLUMN "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_by" TEXT,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "dead_lettered_at" TIMESTAMP(3);

CREATE INDEX "outbox_events_status_available_at_idx"
  ON "outbox_events"("status", "available_at");

CREATE TABLE "outbox_deliveries" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "consumer_name" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_deliveries_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "outbox_deliveries_event_id_consumer_name_key"
  ON "outbox_deliveries"("event_id", "consumer_name");

CREATE TABLE "background_job_runs" (
  "id" TEXT NOT NULL,
  "job_name" TEXT NOT NULL,
  "run_key" TEXT NOT NULL,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'running',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "result" JSONB,
  "last_error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "background_job_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "background_job_runs_job_name_run_key_key"
  ON "background_job_runs"("job_name", "run_key");
CREATE INDEX "background_job_runs_status_started_at_idx"
  ON "background_job_runs"("status", "started_at");

CREATE TABLE "signed_url_grants" (
  "id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signed_url_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "signed_url_grants_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "order_files"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "signed_url_grants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "signed_url_grants_token_hash_key"
  ON "signed_url_grants"("token_hash");
CREATE INDEX "signed_url_grants_expires_at_revoked_at_idx"
  ON "signed_url_grants"("expires_at", "revoked_at");

CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "orders_service_id_status_idx" ON "orders"("service_id", "status");
CREATE INDEX "order_assignments_order_id_unassigned_at_idx"
  ON "order_assignments"("order_id", "unassigned_at");
CREATE INDEX "tickets_status_sla_due_at_idx" ON "tickets"("status", "sla_due_at");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

ALTER TABLE "notification_logs" ADD COLUMN "outbox_event_id" TEXT;
CREATE UNIQUE INDEX "notification_logs_outbox_event_id_key"
  ON "notification_logs"("outbox_event_id");
ALTER TABLE "notification_logs"
  ADD CONSTRAINT "notification_logs_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
