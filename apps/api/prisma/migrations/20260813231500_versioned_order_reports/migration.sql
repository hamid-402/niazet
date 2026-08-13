-- Phase 4: normalize existing report versions and enforce an immutable sequence per type.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "order_id", "report_type"
    ORDER BY "created_at", "id"
  ) AS next_version
  FROM "order_reports"
)
UPDATE "order_reports" AS report
SET "version" = ranked.next_version
FROM ranked
WHERE report."id" = ranked."id";

CREATE UNIQUE INDEX "order_reports_order_id_report_type_version_key"
  ON "order_reports"("order_id", "report_type", "version");
