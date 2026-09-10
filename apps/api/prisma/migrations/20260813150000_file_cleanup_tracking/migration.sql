ALTER TABLE "order_files"
ADD COLUMN "purged_at" TIMESTAMP(3);

CREATE INDEX "order_files_scan_status_purged_at_created_at_idx"
ON "order_files"("scan_status", "purged_at", "created_at");
