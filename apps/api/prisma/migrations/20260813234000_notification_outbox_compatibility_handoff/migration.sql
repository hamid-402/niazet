-- On a fresh install, preserve and rename the empty compatibility column before
-- the later background-contract migration creates the canonical column. On an
-- already-migrated database this block is a strict no-op and preserves data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260814010000_phase3_background_contract'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
  ) THEN
    ALTER TABLE "notification_logs"
      RENAME COLUMN "outbox_event_id" TO "outbox_event_id_compat";
    ALTER INDEX "notification_logs_outbox_event_id_channel_key"
      RENAME TO "notification_logs_outbox_event_id_compat_channel_key";
  END IF;
END
$$;

