ALTER TABLE "escrow_holds"
ADD COLUMN "released_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refunded_amount" INTEGER NOT NULL DEFAULT 0;

UPDATE "escrow_holds" AS escrow
SET "released_amount" = COALESCE((
  SELECT SUM(entry."amount")::INTEGER
  FROM "ledger_entries" AS entry
  WHERE entry."reference_id" = escrow."id"
    AND entry."reference_type" IN ('escrow_release', 'commission')
), 0),
"refunded_amount" = COALESCE((
  SELECT SUM(entry."amount")::INTEGER
  FROM "ledger_entries" AS entry
  WHERE entry."reference_id" = escrow."id"
    AND entry."reference_type" = 'escrow_refund'
), 0);

ALTER TABLE "escrow_holds"
ADD CONSTRAINT "escrow_holds_amount_positive_check"
CHECK ("amount" > 0),
ADD CONSTRAINT "escrow_holds_released_amount_nonnegative_check"
CHECK ("released_amount" >= 0),
ADD CONSTRAINT "escrow_holds_refunded_amount_nonnegative_check"
CHECK ("refunded_amount" >= 0),
ADD CONSTRAINT "escrow_holds_distributed_amount_check"
CHECK ("released_amount" + "refunded_amount" <= "amount");
