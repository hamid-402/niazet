-- Phase 4: per-user notification channels and multi-channel outbox delivery.
CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
  "email_enabled" BOOLEAN NOT NULL DEFAULT false,
  "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
  "event_overrides" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_key"
  ON "notification_preferences"("user_id");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "notification_logs_outbox_event_id_key";
ALTER TABLE "notification_logs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" TEXT;

CREATE UNIQUE INDEX "notification_logs_outbox_event_id_channel_key"
  ON "notification_logs"("outbox_event_id", "channel");
CREATE INDEX "notification_logs_channel_sent_at_created_at_idx"
  ON "notification_logs"("channel", "sent_at", "created_at");
