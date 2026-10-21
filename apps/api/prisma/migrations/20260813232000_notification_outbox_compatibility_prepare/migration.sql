-- Compatibility bridge for fresh installations.
-- The notification-preferences migration historically referenced this column
-- before the background-contract migration introduced it. Existing databases
-- already have the column, so this statement is intentionally idempotent.
ALTER TABLE "notification_logs"
  ADD COLUMN IF NOT EXISTS "outbox_event_id" TEXT;

