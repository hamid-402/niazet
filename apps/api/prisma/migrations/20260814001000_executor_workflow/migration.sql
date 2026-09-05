ALTER TABLE "order_reports"
ADD COLUMN "progress_percent" INTEGER;

ALTER TABLE "order_assignments"
ADD COLUMN "accepted_at" TIMESTAMP(3);

CREATE TABLE "execution_checklist_items" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "acceptance_criterion_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "execution_checklist_items_assignment_id_acceptance_criterion_id_key"
ON "execution_checklist_items"("assignment_id", "acceptance_criterion_id");

CREATE INDEX "execution_checklist_items_assignment_id_is_completed_idx"
ON "execution_checklist_items"("assignment_id", "is_completed");

ALTER TABLE "execution_checklist_items"
ADD CONSTRAINT "execution_checklist_items_assignment_id_fkey"
FOREIGN KEY ("assignment_id") REFERENCES "order_assignments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
