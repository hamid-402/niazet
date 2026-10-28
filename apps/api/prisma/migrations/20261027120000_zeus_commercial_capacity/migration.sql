-- Additive only: no historic order, price, wallet or identifier rewrite.
ALTER TYPE "LedgerAccountType" ADD VALUE IF NOT EXISTS 'payment_pending_review';
BEGIN;
CREATE TABLE commercial_policies (
 id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version > 0), config JSONB NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT commercial_policies_service_id_version_key UNIQUE(service_id,version)
);
CREATE TABLE commercial_revisions (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL CHECK(sequence > 0), policy_id TEXT NOT NULL REFERENCES commercial_policies(id) ON DELETE RESTRICT,
 priority TEXT NOT NULL CHECK(priority IN ('normal','urgent','same_day')),
 base_price INTEGER NOT NULL CHECK(base_price >= 0), surcharge_pct INTEGER NOT NULL,
 surcharge_amount INTEGER NOT NULL CHECK(surcharge_amount >= 0), final_price INTEGER NOT NULL CHECK(final_price BETWEEN 1 AND 2000000000),
 fingerprint TEXT NOT NULL, snapshot JSONB NOT NULL, issued_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TIMESTAMP(3) NOT NULL, accepted_at TIMESTAMP(3), invalidated_at TIMESTAMP(3), deadline_at TIMESTAMP(3), payable_until TIMESTAMP(3),
 CONSTRAINT commercial_revisions_order_id_sequence_key UNIQUE(order_id,sequence),
 CONSTRAINT commercial_revisions_id_order_id_key UNIQUE(id,order_id),
 CHECK(expires_at > issued_at),
 CHECK(surcharge_pct = CASE priority WHEN 'normal' THEN 0 WHEN 'urgent' THEN 30 ELSE 80 END),
 CHECK(surcharge_amount::bigint = (base_price::bigint * surcharge_pct::bigint)/100),
 CHECK(final_price::bigint = base_price::bigint + surcharge_amount::bigint),
 CHECK((accepted_at IS NULL AND deadline_at IS NULL AND payable_until IS NULL) OR
       (accepted_at IS NOT NULL AND accepted_at >= issued_at AND deadline_at > accepted_at AND payable_until > accepted_at AND payable_until <= expires_at))
);
CREATE TABLE commercial_states (
 order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 revision_id TEXT NOT NULL UNIQUE,
 FOREIGN KEY(revision_id,order_id) REFERENCES commercial_revisions(id,order_id) ON DELETE RESTRICT,
 CONSTRAINT commercial_states_revision_id_order_id_key UNIQUE(revision_id,order_id)
);
CREATE TABLE capacity_buckets (
 id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE RESTRICT,
 day TEXT NOT NULL CHECK(day ~ '^\d{4}-\d{2}-\d{2}$'), skill TEXT NOT NULL,
 "limit" INTEGER NOT NULL CHECK("limit" BETWEEN 0 AND 1000000),
 CONSTRAINT capacity_buckets_service_id_day_skill_key UNIQUE(service_id,day,skill)
);
CREATE TABLE capacity_reservations (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES commercial_revisions(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','committed','released','expired')),
 created_at TIMESTAMP(3) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, committed_at TIMESTAMP(3),
 CHECK(expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
 CHECK(status <> 'committed' OR committed_at IS NOT NULL)
);
CREATE INDEX capacity_reservations_status_expires_at_idx ON capacity_reservations(status,expires_at);
CREATE TABLE capacity_allocations (
 reservation_id TEXT NOT NULL REFERENCES capacity_reservations(id) ON DELETE RESTRICT,
 bucket_id TEXT NOT NULL REFERENCES capacity_buckets(id) ON DELETE RESTRICT,
 PRIMARY KEY(reservation_id,bucket_id)
);
CREATE TABLE commercial_payment_links (
 payment_id TEXT PRIMARY KEY REFERENCES payments(id) ON DELETE RESTRICT,
 revision_id TEXT NOT NULL REFERENCES commercial_revisions(id) ON DELETE RESTRICT,
 financial_review_at TIMESTAMP(3), review_reason TEXT, refund_requested_at TIMESTAMP(3), resolved_at TIMESTAMP(3)
);
CREATE INDEX capacity_allocations_bucket_id_idx ON capacity_allocations(bucket_id);
-- Accepted money/formula/calendar snapshots are immutable; only lifecycle timestamps can change.
CREATE FUNCTION zeus_immutable_commercial_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'commercial revision is immutable'; END IF;
 IF OLD.invalidated_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'invalidated revision is immutable'; END IF;
 IF (to_jsonb(NEW) - ARRAY['accepted_at','invalidated_at','deadline_at','payable_until']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['accepted_at','invalidated_at','deadline_at','payable_until'])
 THEN RAISE EXCEPTION 'commercial revision snapshot is immutable'; END IF;
 IF OLD.accepted_at IS NOT NULL AND (NEW.accepted_at,NEW.deadline_at,NEW.payable_until) IS DISTINCT FROM
    (OLD.accepted_at,OLD.deadline_at,OLD.payable_until)
 THEN RAISE EXCEPTION 'accepted commercial deadline is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zeus_commercial_revision_immutable BEFORE UPDATE OR DELETE ON commercial_revisions
 FOR EACH ROW EXECUTE FUNCTION zeus_immutable_commercial_revision();
CREATE FUNCTION zeus_immutable_commercial_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'commercial policy versions are append only'; END $$;
CREATE TRIGGER zeus_commercial_policy_immutable BEFORE UPDATE OR DELETE ON commercial_policies
 FOR EACH ROW EXECUTE FUNCTION zeus_immutable_commercial_policy();
CREATE FUNCTION zeus_immutable_capacity_window() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'reservation history is immutable'; END IF;
 IF (NEW.id,NEW.revision_id,NEW.created_at,NEW.expires_at) IS DISTINCT FROM (OLD.id,OLD.revision_id,OLD.created_at,OLD.expires_at)
 THEN RAISE EXCEPTION 'reservation window is immutable'; END IF;
 IF OLD.status IN ('released','expired') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'final reservation is immutable'; END IF;
 IF OLD.status = 'committed' AND NEW.status NOT IN ('committed','released') THEN RAISE EXCEPTION 'committed reservation cannot expire'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zeus_capacity_window_immutable BEFORE UPDATE OR DELETE ON capacity_reservations
 FOR EACH ROW EXECUTE FUNCTION zeus_immutable_capacity_window();
CREATE FUNCTION zeus_commercial_payment_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT order_id FROM payments WHERE id=NEW.payment_id) IS DISTINCT FROM (SELECT order_id FROM commercial_revisions WHERE id=NEW.revision_id)
 THEN RAISE EXCEPTION 'commercial payment order mismatch'; END IF;
 IF TG_OP='UPDATE' AND (NEW.payment_id,NEW.revision_id) IS DISTINCT FROM (OLD.payment_id,OLD.revision_id)
 THEN RAISE EXCEPTION 'commercial payment binding is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zeus_commercial_payment_binding BEFORE INSERT OR UPDATE ON commercial_payment_links
 FOR EACH ROW EXECUTE FUNCTION zeus_commercial_payment_owner();
COMMIT;
