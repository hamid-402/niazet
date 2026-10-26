-- Additive only: nullable historic values remain unknown, no backfill.
BEGIN;
ALTER TABLE "user_login_states" ADD COLUMN "phone_verified_at" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "customer_rating" INTEGER,
  ADD COLUMN "customer_rated_at" TIMESTAMP(3),
  ADD CONSTRAINT "tickets_customer_rating_check" CHECK ("customer_rating" IS NULL OR "customer_rating" BETWEEN 1 AND 5);
ALTER TABLE "public_service_reviews" ADD COLUMN "public_comment" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "public_service_reviews_version_check" CHECK ("version" > 0);
CREATE INDEX "orders_customer_id_status_idx" ON "orders"("customer_id", "status");
COMMIT;
