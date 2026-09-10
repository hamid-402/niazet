-- The final schema permits one delivery per channel for each outbox event.
DROP INDEX IF EXISTS "notification_logs_outbox_event_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_outbox_event_id_channel_key"
  ON "notification_logs"("outbox_event_id", "channel");

