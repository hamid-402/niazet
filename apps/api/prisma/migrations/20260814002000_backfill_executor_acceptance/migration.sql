UPDATE "order_assignments" AS assignment
SET "accepted_at" = assignment."assigned_at"
FROM "orders" AS orders
WHERE assignment."order_id" = orders."id"
  AND assignment."unassigned_at" IS NULL
  AND assignment."accepted_at" IS NULL
  AND orders."status" NOT IN ('assigned', 'cancelled');

INSERT INTO "execution_checklist_items" (
    "id",
    "assignment_id",
    "acceptance_criterion_id",
    "label",
    "is_completed",
    "completed_at",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid()::text,
    assignment."id",
    criterion."id",
    criterion."description",
    false,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "order_assignments" AS assignment
JOIN "order_acceptance_criteria" AS criterion
  ON criterion."order_id" = assignment."order_id"
WHERE assignment."accepted_at" IS NOT NULL
ON CONFLICT ("assignment_id", "acceptance_criterion_id") DO NOTHING;
