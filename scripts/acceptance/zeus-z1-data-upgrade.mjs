import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inverseZ2CommercialInput, matchesZ2CommercialApproval } from '../orbit-z2-commercial-approval.mjs';
import { matchesZ3OutputApproval } from '../orbit-z3-output-approval.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api'), req = createRequire(join(api, 'package.json'));
const { PrismaClient } = req('@prisma/client');
const migrationName = '20261026100000_zeus_data_contracts';
const migrations = join(api, 'prisma/migrations');
const allNames = readdirSync(migrations, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
const laterMigrations = allNames.filter(name => name > migrationName);
for (const name of laterMigrations) assert(matchesZ2CommercialApproval(`apps/api/prisma/migrations/${name}/migration.sql`, readFileSync(join(migrations, name, 'migration.sql'))) || matchesZ3OutputApproval(`apps/api/prisma/migrations/${name}/migration.sql`, readFileSync(join(migrations, name, 'migration.sql'))), 'Unapproved later migration in historical rehearsal');
assert(!laterMigrations.length || !process.argv.includes('--apply-local'), 'Historical Z1 runner cannot apply a later phase to the main DB');
const names = allNames.filter(name => name <= migrationName);
assert.equal(names.length, 25); assert.equal(names.at(-1), migrationName);
const env = Object.fromEntries(readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const n = l.indexOf('='); return [l.slice(0, n), l.slice(n + 1).replace(/^(['"])(.*)\1$/, '$2')]; }));
const main = new URL(env.DATABASE_URL); assert(['localhost', '127.0.0.1', '[::1]'].includes(main.hostname));
assert.equal(env.NODE_ENV ?? 'development', 'development'); assert.equal(env.PAYMENT_GATEWAY_DRIVER ?? 'mock', 'mock');
const output = join(root, '.artifacts/zeus/z1-phase'); mkdirSync(output, { recursive: true });
const digest = v => createHash('sha256').update(v).digest('hex');
const normalized = v => v.toString('utf8').replaceAll('\r\n', '\n');
const read = p => p === 'apps/api/prisma/schema.prisma' ? inverseZ2CommercialInput(p, readFileSync(join(root, p))) : readFileSync(join(root, p));
const previous = JSON.parse(read('docs/zeus/z1-contract-acceptance.json'));
const redact = error => String(error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<DB URL>');
function oldSchema() {
  const current = normalized(read('apps/api/prisma/schema.prisma'));
  const old = current.replace(/\n  customerRating[^\n]*\n  customerRatedAt[^\n]*\n/, '')
    .replace(/^  phoneVerifiedAt[^\n]*\n/m, '').replace(/^  publicComment[^\n]*\n/m, '')
    .replace(/(model PublicServiceReview \{[\s\S]*?)^  version\s+Int\s+@default\(1\)\n/m, '$1')
    .replace(/^  @@index\(\[customerId, status\]\)\n/m, '');
  assert.equal(digest(old), previous.fileHashes['apps/api/prisma/schema.prisma'], 'Old schema must equal accepted EXEC-009 bytes, not an approximate fixture');
  return old;
}
function cli(args, url) {
  if (laterMigrations.length && args[0] === 'migrate' && args[1] === 'deploy' && !args.includes('--config')) {
    assert(process.argv.includes('--probe-child'), 'Historical target is only used by the disposable rehearsal child');
    const parent = resolve(process.env.ZEUS_DATA_OLD_CLIENT, '..');
    const runtime = resolve(root, '_runtime/apps/api');
    assert(parent.startsWith(runtime + '\\') || parent.startsWith(runtime + '/'));
    const target = join(parent, 'accepted-z1-target'); mkdirSync(target, { recursive: true }); mkdirSync(join(target, 'migrations'), { recursive: true });
    writeFileSync(join(target, 'schema.prisma'), read('apps/api/prisma/schema.prisma'));
    cpSync(join(migrations, 'migration_lock.toml'), join(target, 'migrations/migration_lock.toml'));
    for (const name of names) cpSync(join(migrations, name), join(target, 'migrations', name), { recursive: true });
    const config = join(target, 'prisma.config.ts');
    writeFileSync(config, "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: " + JSON.stringify(join(target, 'schema.prisma')) + ', migrations: { path: ' + JSON.stringify(join(target, 'migrations')) + ' }, datasource: { url: process.env.DATABASE_URL! } });\n');
    args = [...args, '--config', config];
  }
  const r = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), ...args], { cwd: api, env: { ...process.env, DATABASE_URL: url, PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 0, redact(r.stdout + '\n' + r.stderr).slice(-2500));
}
async function history(db, upgraded) {
  const applied = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  assert.deepEqual(applied.map(m => m.migration_name), upgraded ? names : names.slice(0, -1));
  for (const m of applied) {
    assert(m.finished_at && !m.rolled_back_at);
    const bytes = readFileSync(join(migrations, m.migration_name, 'migration.sql')), lf = normalized(bytes);
    assert([digest(bytes), digest(lf), digest(lf.replaceAll('\n', '\r\n'))].includes(m.checksum), 'Migration checksum drift: ' + m.migration_name);
  }
}
async function columns(db) {
  const result = await db.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name, ordinal_position`;
  const tables = {};
  for (const r of result) { assert.match(r.table_name, /^[a-z_]+$/); assert.match(r.column_name, /^[a-z_]+$/); (tables[r.table_name] ??= []).push(r.column_name); }
  return tables;
}
async function snapshot(db, tables) {
  const result = {};
  for (const [table, fields] of Object.entries(tables)) {
    const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM (SELECT ${fields.map(f => '"' + f + '"').join(',')} FROM "${table}") t ORDER BY row_to_json(t)::text`);
    result[table] = { count: rows.length, hash: digest(rows.map(r => r.value).join('\n')) };
  }
  return result;
}
async function checkNewConstraints(db) {
  const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='orders_customer_id_status_idx'`;
  assert.equal(indexes.length, 1);
  const checks = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE conname IN ('tickets_customer_rating_check', 'public_service_reviews_version_check')`;
  assert.equal(checks.length, 2);
}
async function rehearse() {
  const name = `niazat_z1_data_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  assert.match(name, /^niazat_z1_data_\d+_[a-f0-9]{8}$/); assert.notEqual(name, decodeURIComponent(main.pathname.slice(1)));
  const isolated = new URL(main); isolated.pathname = '/' + name;
  const maintenance = new URL(main); maintenance.pathname = '/postgres';
  const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
  const runtime = resolve(root, '_runtime/apps/api'), temp = mkdtempSync(join(runtime, 'z1-data-old-'));
  let created = false, resultReport;
  try {
    const schema = oldSchema().replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = ' + JSON.stringify(join(temp, 'client').replaceAll('\\', '/')));
    writeFileSync(join(temp, 'schema.prisma'), schema); mkdirSync(join(temp, 'migrations'));
    cpSync(join(migrations, 'migration_lock.toml'), join(temp, 'migrations/migration_lock.toml'));
    for (const migration of names.slice(0, -1)) cpSync(join(migrations, migration), join(temp, 'migrations', migration), { recursive: true });
    const config = join(temp, 'prisma.config.ts');
    writeFileSync(config, "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: " + JSON.stringify(join(temp, 'schema.prisma')) + ', migrations: { path: ' + JSON.stringify(join(temp, 'migrations')) + ' }, datasource: { url: process.env.DATABASE_URL! } });\n');
    await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    cli(['migrate', 'deploy', '--config', config], isolated.toString()); cli(['generate', '--config', config], isolated.toString());
    const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--probe-child'], {
      cwd: root, env: { ...process.env, ZEUS_DATA_TEST_URL: isolated.toString(), ZEUS_DATA_OLD_CLIENT: join(temp, 'client') },
      encoding: 'utf8', windowsHide: true, timeout: 60000,
    });
    assert.equal(probe.status, 0, redact(probe.stdout + '\n' + probe.stderr).slice(-2500));
    resultReport = JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1));
  } finally {
    if (created) { await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', name); await control.$executeRawUnsafe(`DROP DATABASE "${name}"`); }
    await control.$disconnect();
    const target = resolve(temp); assert(target.startsWith(runtime + '\\') || target.startsWith(runtime + '/')); assert(/^z1-data-old-[A-Za-z0-9]+$/.test(target.split(/[\\/]/).at(-1))); rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
  resultReport.temporaryDatabaseRemoved = true;
  resultReport.generatedFixtureRemoved = true;
  resultReport.targetMigrationHash = digest(normalized(readFileSync(join(migrations, migrationName, 'migration.sql'))));
  resultReport.schemaHash = digest(normalized(read('apps/api/prisma/schema.prisma')));
  resultReport.previousAcceptedSchemaHash = previous.fileHashes['apps/api/prisma/schema.prisma'];
  writeFileSync(join(output, 'upgrade-rehearsal.json'), JSON.stringify(resultReport, null, 2) + '\n');
  console.log(JSON.stringify(resultReport));
}
async function exercise(isolated, oldClientPath) {
  assert.equal(isolated.hostname, main.hostname); assert.match(isolated.pathname, /^\/niazat_z1_data_\d+_[a-f0-9]{8}$/);
  assert.notEqual(isolated.pathname, main.pathname);
  const runtime = resolve(root, '_runtime/apps/api');
  assert(resolve(oldClientPath).startsWith(runtime + '\\') || resolve(oldClientPath).startsWith(runtime + '/'));
  let old, db;
  try {
    const { PrismaClient: PreviousClient } = req(oldClientPath);
    old = new PreviousClient({ datasources: { db: { url: isolated.toString() } } });
    const user = await old.user.create({ data: { phone: '09129990001', fullName: 'دادهٔ قدیمی آزمون', role: 'customer', status: 'active' } });
    const ticket = await old.ticket.create({ data: { code: 'PRESERVE-TICKET', customerId: user.id, category: 'other', subject: 'تیکت قدیمی بدون snapshot' } });
    await old.userLoginState.create({ data: { userId: user.id, lastSuccessfulLoginAt: new Date('2026-10-25T10:00Z') } });
    db = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
    await history(db, false); const oldColumns = await columns(db), before = await snapshot(db, oldColumns);
    cli(['migrate', 'deploy'], isolated.toString()); await history(db, true); await checkNewConstraints(db);
    assert.deepEqual(await snapshot(db, oldColumns), before, 'An old column or row changed');
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).customerRating, null);
    assert.equal((await db.userLoginState.findUnique({ where: { userId: user.id } })).phoneVerifiedAt, null);
    await old.ticket.update({ where: { id: ticket.id }, data: { subject: 'نوشتن با کلاینت قبلی بعد از ارتقا' } });
    assert.equal((await old.ticket.findUnique({ where: { id: ticket.id } })).subject, 'نوشتن با کلاینت قبلی بعد از ارتقا');
    await assert.rejects(db.$executeRawUnsafe('UPDATE tickets SET customer_rating=6 WHERE id=$1', ticket.id));
    await db.ticket.update({ where: { id: ticket.id }, data: { customerRating: 5, customerRatedAt: new Date() } });
    assert((await old.ticket.findUnique({ where: { id: ticket.id } })).id === ticket.id);
    const report = { status: 'passed', date: '2026-10-26', mainDatabaseConnected: false, migrationCount: 25, previousTablesPreserved: Object.keys(before).length, preservedColumnSnapshot: digest(JSON.stringify(before)), previousClientReadWriteAfterUpgrade: true, oldUnknownValuesRemainNull: true, ratingConstraintRejectedInvalid: true };
    return report;
  } finally { if (old) await old.$disconnect(); if (db) await db.$disconnect(); }
}
async function applyLocal() {
  const rehearsal = JSON.parse(readFileSync(join(output, 'upgrade-rehearsal.json')));
  assert.equal(rehearsal.status, 'passed'); assert.equal(rehearsal.previousClientReadWriteAfterUpgrade, true);
  assert.equal(rehearsal.generatedFixtureRemoved, true);
  assert.equal(rehearsal.targetMigrationHash, digest(normalized(readFileSync(join(migrations, migrationName, 'migration.sql')))));
  assert.equal(rehearsal.schemaHash, digest(normalized(read('apps/api/prisma/schema.prisma'))));
  const evidence = JSON.parse(read('docs/zeus/z1-phase-acceptance.json'));
  assert.equal(evidence.readyForLocalActivation, true);
  for (const [path, expected] of Object.entries(evidence.fileHashes)) assert.equal(digest(normalized(read(path))), expected, 'Current accepted source drift: ' + path);
  const db = new PrismaClient({ datasources: { db: { url: main.toString() } } });
  try {
    await history(db, false); const oldColumns = await columns(db), before = await snapshot(db, oldColumns);
    cli(['migrate', 'deploy'], main.toString()); await history(db, true); await checkNewConstraints(db);
    assert.deepEqual(await snapshot(db, oldColumns), before, 'Local old data changed');
    const report = { status: 'passed', date: '2026-10-26', migrationCount: 25, previousTablesPreserved: Object.keys(before).length, preservedColumnSnapshot: digest(JSON.stringify(before)), mainFinancialAcceptanceWrites: false, seedOrReset: false, providers: 'mock', sourceEvidence: 'docs/zeus/z1-phase-acceptance.json' };
    writeFileSync(join(output, 'local-data-activation.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  } finally { await db.$disconnect(); }
}
try {
  if (process.argv.includes('--probe-child')) console.log(JSON.stringify(await exercise(new URL(process.env.ZEUS_DATA_TEST_URL), process.env.ZEUS_DATA_OLD_CLIENT)));
  else if (process.argv.includes('--rehearse')) await rehearse();
  else if (process.argv.includes('--apply-local')) await applyLocal();
  else if (process.argv.includes('--status-local')) {
    const db = new PrismaClient({ datasources: { db: { url: main.toString() } } });
    try {
      await history(db, true); await checkNewConstraints(db);
      const { LedgerService } = req('./dist/finance/ledger.service.js');
      const ledger = new LedgerService(db), wallets = await db.wallet.findMany({ select: { userId: true } });
      for (const wallet of wallets) assert((await ledger.verifyWalletConsistency(wallet.userId)).consistent);
      console.log(JSON.stringify({ localStatus: 'passed', migrationCount: 25, walletsCheckedReadOnly: wallets.length, allWalletsConsistent: true, financialTransactionExecuted: false, configuredPaymentGateway: env.PAYMENT_GATEWAY_DRIVER ?? 'mock' }));
    } finally { await db.$disconnect(); }
  }
  else throw new Error('Use --rehearse or --apply-local; no implicit main database access.');
} catch (error) { console.error(redact(error.stack ?? error)); process.exitCode = 1; }
