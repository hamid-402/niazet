BEGIN;
CREATE TABLE "organization_plans" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL,
 "seats" INTEGER NOT NULL CHECK ("seats" > 0),
 "orders_per_period" INTEGER NOT NULL CHECK ("orders_per_period" > 0),
 "fee_toman" INTEGER NOT NULL CHECK ("fee_toman" >= 0),
 "duration_days" INTEGER NOT NULL CHECK ("duration_days" BETWEEN 1 AND 366),
 "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "organizations" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "requested_plan_id" TEXT REFERENCES "organization_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "organization_teams" (
 "id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "organization_teams_organization_id_name_key" ON "organization_teams"("organization_id", "name");
CREATE UNIQUE INDEX "organization_teams_id_organization_id_key" ON "organization_teams"("id", "organization_id");
CREATE TABLE "organization_members" (
 "id" TEXT PRIMARY KEY,
 "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "role" TEXT NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner', 'manager', 'member')),
 "status" TEXT NOT NULL DEFAULT 'invited' CHECK ("status" IN ('invited', 'active', 'revoked')),
 "team_id" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "organization_members_team_id_organization_id_fkey" FOREIGN KEY ("team_id", "organization_id") REFERENCES "organization_teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "organization_members_user_id_status_idx" ON "organization_members"("user_id", "status");
CREATE UNIQUE INDEX "organization_single_active_owner" ON "organization_members"("organization_id") WHERE "role" = 'owner' AND "status" = 'active';
CREATE TABLE "organization_subscriptions" (
 "id" TEXT PRIMARY KEY,
 "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "plan_id" TEXT NOT NULL REFERENCES "organization_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "plan_name" TEXT NOT NULL,
 "seats" INTEGER NOT NULL CHECK ("seats" > 0),
 "orders_per_period" INTEGER NOT NULL CHECK ("orders_per_period" > 0),
 "fee_toman" INTEGER NOT NULL CHECK ("fee_toman" >= 0),
 "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'cancelled')),
 "contract_reference" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "organization_subscription_period" CHECK ("ends_at" > "starts_at")
);
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");
ALTER TABLE "orders" ADD COLUMN "organization_id" TEXT, ADD COLUMN "organization_team_id" TEXT, ADD COLUMN "organization_attached_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_team_id_organization_id_fkey" FOREIGN KEY ("organization_team_id", "organization_id") REFERENCES "organization_teams"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_team_requires_organization" CHECK ("organization_team_id" IS NULL OR "organization_id" IS NOT NULL);
CREATE INDEX "orders_organization_id_created_at_idx" ON "orders"("organization_id", "created_at");
COMMIT;
