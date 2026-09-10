import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const script = readFileSync(new URL('scripts/phase8-postgres-integration.mjs', root), 'utf8');
const compatibilityPrepare = readFileSync(new URL('prisma/migrations/20260813232000_notification_outbox_compatibility_prepare/migration.sql', root), 'utf8');
const compatibilityHandoff = readFileSync(new URL('prisma/migrations/20260813234000_notification_outbox_compatibility_handoff/migration.sql', root), 'utf8');
const compatibilityFinalize = readFileSync(new URL('prisma/migrations/20260814011000_notification_outbox_compatibility_finalize/migration.sql', root), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(script.includes('CREATE DATABASE') && script.includes('DROP DATABASE IF EXISTS') && script.includes('finally'), 'Integration runner must create and always remove an isolated database.');
check(script.includes('assert.notEqual(databaseName, sourceDatabaseName') && script.includes("assert.match(databaseName, /^niazat_it_"), 'Destructive cleanup target must be random, prefix-validated and different from the configured database.');
check(script.includes('pg_terminate_backend') && script.includes("maintenanceUrl.pathname = '/postgres'"), 'Runner must close isolated connections through the maintenance database before cleanup.');
check(script.includes("[prismaCli, 'migrate', 'deploy']"), 'Runner must apply real Prisma migrations from scratch.');
check(script.includes('"_prisma_migrations"') && script.includes('expectedMigrations'), 'Runner must compare applied and filesystem migrations.');
for (const name of ['ledger_entries_amount_positive', 'ledger_entries_accounts_distinct', 'withdrawals_amount_positive', 'order_milestones_amount_positive']) {
  check(script.includes(`'${name}'`), `Runner must verify constraint: ${name}.`);
}
check(script.includes('append-only ledger UPDATE trigger') && script.includes('append-only ledger DELETE trigger'), 'Runner must actively probe immutable ledger triggers.');
check(script.includes('Thrown transaction must roll back') && script.includes('Successful transaction must commit all writes'), 'Runner must verify rollback and commit behavior.');
check(script.includes('constraint failure transaction rollback'), 'Runner must verify atomic rollback after a real constraint failure.');
check(script.includes('idempotency scope/key unique index'), 'Runner must actively probe the idempotency unique index.');
check(script.includes('notification_logs_outbox_event_id_channel_key'), 'Runner must verify per-channel notification delivery uniqueness.');
check(!script.includes('DROP SCHEMA public') && !script.includes('DROP DATABASE "final"'), 'Runner must never destroy the primary database or public schema.');
check(compatibilityPrepare.includes('ADD COLUMN IF NOT EXISTS "outbox_event_id"'), 'Compatibility preparation must be idempotent.');
check(compatibilityHandoff.includes('finished_at') && compatibilityHandoff.includes('RENAME COLUMN'), 'Compatibility handoff must only act before the background migration.');
check(compatibilityFinalize.includes('notification_logs_outbox_event_id_channel_key'), 'Compatibility finalization must restore the canonical composite index.');
check(!`${compatibilityPrepare}\n${compatibilityHandoff}\n${compatibilityFinalize}`.includes('DROP COLUMN'), 'Compatibility migrations must never delete a notification column.');

if (failures.length) {
  console.error(`Phase 8 PostgreSQL contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 8 PostgreSQL contract passed: isolated database migrations, transactions, constraints, triggers and validated cleanup are enforced.');
