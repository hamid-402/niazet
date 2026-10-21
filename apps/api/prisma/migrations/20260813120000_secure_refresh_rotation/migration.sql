-- Refresh tokens are opaque and rotated. A family groups all rotations so
-- reuse of a revoked token can invalidate the complete session chain.
ALTER TABLE "sessions" ADD COLUMN "family_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN "replaced_by_id" TEXT;

UPDATE "sessions" SET "family_id" = "id" WHERE "family_id" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");
