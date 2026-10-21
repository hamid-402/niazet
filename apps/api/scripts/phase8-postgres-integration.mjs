import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LedgerAccountType, LedgerReferenceType, PrismaClient } from '@prisma/client';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const migrationsDirectory = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));

function configuredDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (!existsSync(envPath)) throw new Error('DATABASE_URL is not configured and apps/api/.env was not found.');
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from apps/api/.env.');
  const value = line.slice(line.indexOf('=') + 1).trim();
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function clientFor(url) {
  return new PrismaClient({ datasources: { db: { url } } });
}

async function expectDatabaseRejection(label, operation) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} was accepted by PostgreSQL.`);
}

const sourceUrl = configuredDatabaseUrl();
const parsedUrl = new URL(sourceUrl);
assert.match(parsedUrl.protocol, /^postgres(?:ql)?:$/, 'Integration tests require a PostgreSQL DATABASE_URL.');
const sourceDatabaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
const databaseName = `niazat_it_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_it_[a-z0-9_]+$/);
assert.notEqual(databaseName, sourceDatabaseName, 'Integration database must never equal the configured database.');
const maintenanceUrl = new URL(parsedUrl);
maintenanceUrl.pathname = '/postgres';
maintenanceUrl.searchParams.set('schema', 'public');
const integrationUrl = new URL(parsedUrl);
integrationUrl.pathname = `/${databaseName}`;
integrationUrl.searchParams.set('schema', 'public');

const control = clientFor(maintenanceUrl.toString());
let database;
let databaseCreated = false;

try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;

  const migration = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: integrationUrl.toString() },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (migration.status !== 0) {
    const output = `${migration.stdout ?? ''}\n${migration.stderr ?? ''}`
      .replaceAll(sourceUrl, '<DATABASE_URL redacted>')
      .slice(-4_000);
    throw new Error(`Prisma migrate deploy failed for the isolated database.\n${output}`);
  }

  database = clientFor(integrationUrl.toString());
  await database.$connect();

  const expectedMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const appliedMigrations = await database.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  assert.equal(appliedMigrations.length, expectedMigrations.length, 'Every migration directory must be applied.');
  assert.deepEqual(appliedMigrations.map((row) => row.migration_name).sort(), expectedMigrations);
  assert.equal(appliedMigrations.every((row) => row.finished_at && !row.rolled_back_at), true, 'Applied migrations must be finished and not rolled back.');

  const constraints = await database.$queryRawUnsafe(
    `SELECT conname AS name
     FROM pg_constraint
     WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`,
  );
  const constraintNames = new Set(constraints.map((row) => row.name));
  for (const name of [
    'ledger_entries_amount_positive',
    'ledger_entries_accounts_distinct',
    'withdrawals_amount_positive',
    'order_milestones_amount_positive',
  ]) {
    assert.equal(constraintNames.has(name), true, `Missing PostgreSQL constraint: ${name}`);
  }

  const triggers = await database.$queryRawUnsafe(
    `SELECT tgname AS name
     FROM pg_trigger
     WHERE tgrelid IN ('ledger_entries'::regclass, 'wallet_transactions'::regclass)
       AND NOT tgisinternal`,
  );
  const triggerNames = new Set(triggers.map((row) => row.name));
  assert.equal(triggerNames.has('ledger_entries_append_only'), true);
  assert.equal(triggerNames.has('wallet_transactions_append_only'), true);

  const notificationIndexes = await database.$queryRawUnsafe(
    `SELECT indexname AS name, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND tablename = 'notification_logs'`,
  );
  const notificationDeliveryIndex = notificationIndexes.find(
    (row) => row.name === 'notification_logs_outbox_event_id_channel_key',
  );
  assert.ok(notificationDeliveryIndex, 'Notification delivery composite unique index must exist.');
  assert.match(
    notificationDeliveryIndex.definition,
    /UNIQUE INDEX.+\(outbox_event_id, channel\)$/,
    'Notification delivery uniqueness must be scoped by outbox event and channel.',
  );

  const rollbackKey = `integration.rollback.${randomUUID()}`;
  await assert.rejects(
    database.$transaction(async (tx) => {
      await tx.systemSetting.create({ data: { key: rollbackKey, value: { probe: true } } });
      throw new Error('ROLLBACK_PROBE');
    }),
    /ROLLBACK_PROBE/,
  );
  assert.equal(await database.systemSetting.count({ where: { key: rollbackKey } }), 0, 'Thrown transaction must roll back.');

  const debitAccount = await database.ledgerAccount.create({ data: { accountType: LedgerAccountType.payment_gateway_clearing } });
  const creditAccount = await database.ledgerAccount.create({ data: { accountType: LedgerAccountType.platform_escrow } });

  await expectDatabaseRejection('positive ledger amount constraint', () =>
    database.ledgerEntry.create({ data: {
      debitAccountId: debitAccount.id,
      creditAccountId: creditAccount.id,
      amount: 0,
      referenceType: LedgerReferenceType.payment,
      referenceId: 'constraint-amount',
    } }),
  );
  await expectDatabaseRejection('distinct ledger accounts constraint', () =>
    database.ledgerEntry.create({ data: {
      debitAccountId: debitAccount.id,
      creditAccountId: debitAccount.id,
      amount: 100,
      referenceType: LedgerReferenceType.payment,
      referenceId: 'constraint-accounts',
    } }),
  );

  const ledgerEntry = await database.ledgerEntry.create({ data: {
    debitAccountId: debitAccount.id,
    creditAccountId: creditAccount.id,
    amount: 100,
    referenceType: LedgerReferenceType.payment,
    referenceId: 'append-only-probe',
    idempotencyKey: `ledger-${randomUUID()}`,
  } });
  await expectDatabaseRejection('append-only ledger UPDATE trigger', () =>
    database.ledgerEntry.update({ where: { id: ledgerEntry.id }, data: { amount: 101 } }),
  );
  await expectDatabaseRejection('append-only ledger DELETE trigger', () =>
    database.ledgerEntry.delete({ where: { id: ledgerEntry.id } }),
  );

  const idempotencyKey = `request-${randomUUID()}`;
  await database.idempotencyKey.create({ data: {
    scope: 'integration.unique',
    key: idempotencyKey,
    requestHash: randomUUID().replaceAll('-', ''),
    expiresAt: new Date(Date.now() + 60_000),
  } });
  await expectDatabaseRejection('idempotency scope/key unique index', () =>
    database.idempotencyKey.create({ data: {
      scope: 'integration.unique',
      key: idempotencyKey,
      requestHash: randomUUID().replaceAll('-', ''),
      expiresAt: new Date(Date.now() + 60_000),
    } }),
  );

  const constraintRollbackKey = `integration.constraint-rollback.${randomUUID()}`;
  await expectDatabaseRejection('constraint failure transaction rollback', () =>
    database.$transaction(async (tx) => {
      await tx.systemSetting.create({ data: { key: constraintRollbackKey, value: { probe: true } } });
      await tx.ledgerEntry.create({ data: {
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: -1,
        referenceType: LedgerReferenceType.payment,
        referenceId: 'transaction-constraint-probe',
      } });
    }),
  );
  assert.equal(await database.systemSetting.count({ where: { key: constraintRollbackKey } }), 0, 'A database constraint failure must roll back prior writes in the transaction.');

  const commitKeys = [`integration.commit.a.${randomUUID()}`, `integration.commit.b.${randomUUID()}`];
  await database.$transaction(
    commitKeys.map((key) => database.systemSetting.create({ data: { key, value: { committed: true } } })),
  );
  assert.equal(await database.systemSetting.count({ where: { key: { in: commitKeys } } }), 2, 'Successful transaction must commit all writes.');

  console.log(`Phase 8 PostgreSQL integration passed: ${appliedMigrations.length} migrations, ${constraintNames.size} constraints, transaction rollback/commit, unique indexes and append-only triggers verified.`);
} finally {
  if (database) await database.$disconnect();
  if (databaseCreated) {
    await control.$queryRawUnsafe(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      databaseName,
    );
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
}
