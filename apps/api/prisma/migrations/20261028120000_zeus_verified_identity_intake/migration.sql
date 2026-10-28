-- Additive only. No UPDATE, backfill, role/financial change or old-column edit.
CREATE TABLE "email_login_identities" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email_normalized" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_login_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_login_identity_version" CHECK ("revision" > 0),
  CONSTRAINT "email_login_identity_address" CHECK (length("email_normalized") BETWEEN 3 AND 254 AND "email_normalized" = lower(btrim("email_normalized"))),
  CONSTRAINT "email_login_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "email_login_identities_user_id_key" ON "email_login_identities"("user_id");
CREATE UNIQUE INDEX "email_login_identities_email_normalized_key" ON "email_login_identities"("email_normalized");

CREATE TABLE "email_login_challenges" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email_normalized" TEXT NOT NULL,
  "expected_profile_email" TEXT,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "verified_identity_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_login_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_login_challenge_hash" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "email_login_challenge_expiry" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "email_login_challenge_receipt" CHECK ("verified_identity_id" IS NULL OR "consumed_at" IS NOT NULL),
  CONSTRAINT "email_login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "email_login_challenges_token_hash_key" ON "email_login_challenges"("token_hash");
CREATE INDEX "email_login_challenges_user_id_consumed_at_expires_at_idx" ON "email_login_challenges"("user_id", "consumed_at", "expires_at");

CREATE TABLE "email_login_families" (
  "family_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL,
  "identity_revision" INTEGER NOT NULL,
  "email_normalized" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "email_login_families_pkey" PRIMARY KEY ("family_id"),
  CONSTRAINT "email_login_family_revision" CHECK ("identity_revision" > 0),
  CONSTRAINT "email_login_families_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX "email_login_families_user_id_identity_id_idx" ON "email_login_families"("user_id", "identity_id");

CREATE TABLE "customer_onboarding_states" (
  "user_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "purpose" TEXT,
  "skipped" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_onboarding_states_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "customer_onboarding_version" CHECK ("schema_version" = 1 AND "revision" > 0),
  CONSTRAINT "customer_onboarding_choice" CHECK (COALESCE(("skipped" AND "purpose" IS NULL) OR (NOT "skipped" AND "purpose" IN ('request_services', 'track_orders', 'explore', 'interested_in_collaboration')), FALSE)),
  CONSTRAINT "customer_onboarding_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE "order_intakes" (
  "order_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "order_version" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "sealed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_intakes_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "order_intake_version" CHECK ("schema_version" = 1 AND "order_version" >= 0),
  CONSTRAINT "order_intake_document" CHECK (COALESCE(jsonb_typeof("data") = 'object' AND "data"->>'version' = '1' AND octet_length("data"::text) <= 32768, FALSE)),
  CONSTRAINT "order_intakes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE FUNCTION enforce_order_intake_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT; parent_version INTEGER;
BEGIN
  SELECT "status"::text, "version" INTO parent_status, parent_version FROM "orders" WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."order_id" ELSE NEW."order_id" END FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intake owner order is missing'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF parent_status <> 'draft' OR OLD."sealed_at" IS NOT NULL THEN RAISE EXCEPTION 'Submitted intake is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."order_version" <> parent_version THEN RAISE EXCEPTION 'Intake must bind the actual order version'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'draft' OR NEW."sealed_at" IS NOT NULL THEN RAISE EXCEPTION 'Intake must originate in a draft'; END IF;
  ELSE
    IF OLD."sealed_at" IS NOT NULL THEN RAISE EXCEPTION 'Sealed intake is immutable'; END IF;
    IF ROW(NEW."order_id", NEW."created_at") IS DISTINCT FROM ROW(OLD."order_id", OLD."created_at") THEN RAISE EXCEPTION 'Intake ownership is immutable'; END IF;
    IF parent_status = 'draft' THEN
      IF NEW."sealed_at" IS NOT NULL THEN RAISE EXCEPTION 'Do not seal a draft before submission'; END IF;
    ELSIF parent_status IN ('submitted', 'pending_triage') THEN
      IF NEW."sealed_at" IS NULL OR ROW(NEW."data", NEW."schema_version") IS DISTINCT FROM ROW(OLD."data", OLD."schema_version") THEN RAISE EXCEPTION 'Submission may only seal the existing intake'; END IF;
    ELSE RAISE EXCEPTION 'Intake cannot change after submission';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "order_intake_snapshot_guard" BEFORE INSERT OR UPDATE OR DELETE ON "order_intakes" FOR EACH ROW EXECUTE FUNCTION enforce_order_intake_snapshot();

CREATE FUNCTION enforce_email_login_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A verified identity is replaced explicitly, never silently updated'; END;
$$;
CREATE TRIGGER "email_login_identity_immutable" BEFORE UPDATE ON "email_login_identities" FOR EACH ROW EXECUTE FUNCTION enforce_email_login_identity_immutable();

CREATE FUNCTION enforce_email_login_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."user_id", NEW."email_normalized", NEW."expected_profile_email", NEW."token_hash", NEW."expires_at", NEW."created_at") IS DISTINCT FROM
     ROW(OLD."id", OLD."user_id", OLD."email_normalized", OLD."expected_profile_email", OLD."token_hash", OLD."expires_at", OLD."created_at") THEN RAISE EXCEPTION 'Email challenge proof is immutable'; END IF;
  IF OLD."consumed_at" IS NOT NULL OR NEW."consumed_at" IS NULL THEN RAISE EXCEPTION 'Email challenge may only be consumed once'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "email_login_challenge_consume_only" BEFORE UPDATE ON "email_login_challenges" FOR EACH ROW EXECUTE FUNCTION enforce_email_login_challenge();

-- Revocation remains attached to the family even if a concurrent refresh has
-- already created a successor session. Access/refresh must check this marker.
CREATE FUNCTION revoke_deleted_email_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "email_login_families" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "identity_id" = OLD."id" AND "revoked_at" IS NULL;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "email_identity_delete_revokes_families" AFTER DELETE ON "email_login_identities" FOR EACH ROW EXECUTE FUNCTION revoke_deleted_email_identity();

CREATE FUNCTION invalidate_changed_profile_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."password_hash" IS DISTINCT FROM NEW."password_hash" THEN
    UPDATE "email_login_families" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "user_id" = OLD."id" AND "revoked_at" IS NULL;
    UPDATE "email_login_challenges" SET "consumed_at" = CURRENT_TIMESTAMP WHERE "user_id" = OLD."id" AND "consumed_at" IS NULL;
  END IF;
  IF lower(btrim(COALESCE(OLD."email", ''))) IS DISTINCT FROM lower(btrim(COALESCE(NEW."email", ''))) THEN
    DELETE FROM "email_login_identities" WHERE "user_id" = OLD."id";
    UPDATE "email_login_challenges" SET "consumed_at" = CURRENT_TIMESTAMP WHERE "user_id" = OLD."id" AND "consumed_at" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "profile_email_change_invalidates_proof" BEFORE UPDATE OF "email", "password_hash" ON "users" FOR EACH ROW EXECUTE FUNCTION invalidate_changed_profile_email();

CREATE FUNCTION enforce_email_login_family() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."revoked_at" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "email_login_identities" WHERE "id" = NEW."identity_id" AND "user_id" = NEW."user_id" AND "revision" = NEW."identity_revision" AND "email_normalized" = NEW."email_normalized") THEN RAISE EXCEPTION 'Email session family needs the exact current verified identity'; END IF;
  ELSE
    IF ROW(NEW."family_id", NEW."user_id", NEW."identity_id", NEW."identity_revision", NEW."email_normalized", NEW."created_at") IS DISTINCT FROM ROW(OLD."family_id", OLD."user_id", OLD."identity_id", OLD."identity_revision", OLD."email_normalized", OLD."created_at") OR OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL THEN RAISE EXCEPTION 'Email session family is immutable except one-way revocation'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "email_login_family_guard" BEFORE INSERT OR UPDATE ON "email_login_families" FOR EACH ROW EXECUTE FUNCTION enforce_email_login_family();
