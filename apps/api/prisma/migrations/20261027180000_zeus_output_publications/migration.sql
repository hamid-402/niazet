-- Additive only: existing files, reports, reviews, grants and money are untouched.
CREATE UNIQUE INDEX "order_files_id_order_id_key" ON "order_files"("id", "order_id");
CREATE UNIQUE INDEX "order_reports_id_order_id_key" ON "order_reports"("id", "order_id");
CREATE UNIQUE INDEX "qc_reviews_id_order_id_key" ON "qc_reviews"("id", "order_id");

CREATE TABLE "output_publications" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "delivery_report_id" TEXT,
  "qc_review_id" TEXT,
  "checksum" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "basis" TEXT NOT NULL DEFAULT 'pending_qc',
  "binding_actor_user_id" TEXT,
  "reviewer_user_id" TEXT,
  "reason" TEXT,
  "checklist_snapshot" JSONB,
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "output_publications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "output_publications_checksum" CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "output_publications_size" CHECK ("size_bytes" BETWEEN 0 AND 26214400),
  CONSTRAINT "output_publications_basis" CHECK (COALESCE((
    ("basis" = 'pending_qc' AND "qc_review_id" IS NOT NULL AND "released_at" IS NULL AND "reviewer_user_id" IS NULL) OR
    ("basis" = 'qc_passed' AND "qc_review_id" IS NOT NULL AND "released_at" IS NOT NULL AND "reviewer_user_id" IS NOT NULL) OR
    ("basis" = 'manual_qc' AND "qc_review_id" IS NULL AND "released_at" IS NOT NULL AND "reviewer_user_id" IS NOT NULL AND length(btrim("reason")) BETWEEN 3 AND 500 AND "checklist_snapshot" IS NOT NULL)
  ), FALSE)),
  CONSTRAINT "output_publications_manifest_origin" CHECK (COALESCE("delivery_report_id" IS NOT NULL OR ("binding_actor_user_id" IS NOT NULL AND length(btrim("reason")) BETWEEN 3 AND 500), FALSE)),
  CONSTRAINT "output_publications_file_order_fkey" FOREIGN KEY ("file_id", "order_id") REFERENCES "order_files"("id", "order_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "output_publications_report_order_fkey" FOREIGN KEY ("delivery_report_id", "order_id") REFERENCES "order_reports"("id", "order_id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "output_publications_review_order_fkey" FOREIGN KEY ("qc_review_id", "order_id") REFERENCES "qc_reviews"("id", "order_id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "output_publications_qc_review_id_file_id_key" ON "output_publications"("qc_review_id", "file_id");
CREATE INDEX "output_publications_order_id_released_at_idx" ON "output_publications"("order_id", "released_at");
CREATE INDEX "output_publications_file_id_released_at_idx" ON "output_publications"("file_id", "released_at");

CREATE FUNCTION enforce_output_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_file "order_files"%ROWTYPE; source_review "qc_reviews"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."order_id", NEW."file_id", NEW."delivery_report_id", NEW."qc_review_id", NEW."checksum", NEW."storage_key", NEW."size_bytes", NEW."binding_actor_user_id", NEW."reason", NEW."checklist_snapshot", NEW."created_at") IS DISTINCT FROM
       ROW(OLD."id", OLD."order_id", OLD."file_id", OLD."delivery_report_id", OLD."qc_review_id", OLD."checksum", OLD."storage_key", OLD."size_bytes", OLD."binding_actor_user_id", OLD."reason", OLD."checklist_snapshot", OLD."created_at") THEN
      RAISE EXCEPTION 'Output publication version is immutable';
    END IF;
    IF NOT (OLD."basis" = 'pending_qc' AND NEW."basis" = 'qc_passed' AND OLD."released_at" IS NULL AND NEW."released_at" IS NOT NULL) THEN
      RAISE EXCEPTION 'Output publication is append-only except pending QC approval';
    END IF;
  END IF;
  SELECT * INTO source_file FROM "order_files" WHERE "id" = NEW."file_id" AND "order_id" = NEW."order_id";
  IF NOT FOUND OR source_file."scan_status"::text <> 'clean' OR source_file."purged_at" IS NOT NULL OR source_file."file_kind"::text NOT IN ('output', 'revision') OR
     source_file."storage_key" <> NEW."storage_key" OR source_file."size_bytes" <> NEW."size_bytes" OR
     (source_file."checksum" IS NOT NULL AND source_file."checksum" <> NEW."checksum") THEN
    RAISE EXCEPTION 'Output publication does not match a clean immutable file version';
  END IF;
  IF NEW."basis" = 'qc_passed' THEN
    SELECT * INTO source_review FROM "qc_reviews" WHERE "id" = NEW."qc_review_id" AND "order_id" = NEW."order_id";
    IF NOT FOUND OR source_review."result"::text IS DISTINCT FROM 'passed' OR source_review."reviewer_user_id" IS DISTINCT FROM NEW."reviewer_user_id" OR source_review."reviewed_at" IS DISTINCT FROM NEW."released_at" THEN
      RAISE EXCEPTION 'The exact bound QC review has not passed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "output_publications_version_guard" BEFORE INSERT OR UPDATE ON "output_publications" FOR EACH ROW EXECUTE FUNCTION enforce_output_publication();
