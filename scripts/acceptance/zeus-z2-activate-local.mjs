import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api');
const digest = value => createHash('sha256').update(value).digest('hex');

export function validateLocalActivation(env, proof) {
  assert.equal(env.NODE_ENV ?? 'development', 'development', 'Only development activation');
  assert.equal(env.PAYMENT_GATEWAY_DRIVER ?? 'mock', 'mock');
  assert.notEqual(env.LIVE_PROVIDERS_ENABLED, 'true');
  const url = new URL(env.DATABASE_URL);
  assert(['postgresql:', 'postgres:'].includes(url.protocol));
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const name = decodeURIComponent(url.pathname.slice(1));
  assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
  assert(!['postgres', 'template0', 'template1', 'niazat_ci'].includes(name));
  assert(!/^niazat_(?:zeus|z[12]|ui|e2e|perf)_/.test(name));
  assert.equal(proof.phase, 'Z2'); assert.equal(proof.sourceAccepted, true);
  assert.equal(proof.readyForLocalActivation, true); assert.equal(proof.productAccepted, false);
  return url;
}
async function oldSnapshot(db) {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`;
  const output = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_]+$/);
    const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM "${tablename}" t ORDER BY row_to_json(t)::text`);
    output[tablename] = { count: rows.length, hash: digest(rows.map(row => row.value).join('\n')) };
  }
  return output;
}
export async function activateLocal() {
  assert(process.argv.includes('--apply-local'), 'Explicit local apply flag required');
  const env = Object.fromEntries(readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^(['"])(.*)\1$/, '$2')]; }));
  const proof = JSON.parse(readFileSync(join(root, 'docs/zeus/z2-phase-acceptance.json')));
  const url = validateLocalActivation(env, proof);
  const gate = spawnSync(process.execPath, ['scripts/acceptance/zeus-z2-phase-gate.mjs', '--pre-activation'], { cwd: root, stdio: 'inherit', windowsHide: true });
  assert.equal(gate.status, 0, 'Fresh source and isolated evidence gate required');
  let apiRunning = false;
  try { await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) }); apiRunning = true; } catch { /* Refusal/timeout expected only while the local API is stopped. */ }
  assert.equal(apiRunning, false, 'Stop the main API before additive migration');
  const req = createRequire(join(api, 'package.json')), { PrismaClient } = req('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const applied = await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    assert.equal(applied.length, 25, 'Expected the previously accepted 25-migration main DB, no other target');
    assert(applied.every(row => row.finished_at && !row.rolled_back_at));
    const names = readdirSync(join(api, 'prisma/migrations')).filter(name => /^\d/.test(name)).sort();
    assert.deepEqual(applied.map(row => row.migration_name), names.slice(0,-1));
    for (const row of applied) {
      const bytes = readFileSync(join(api, 'prisma/migrations', row.migration_name, 'migration.sql'));
      const lf = bytes.toString('utf8').replaceAll('\r\n','\n');
      assert([digest(bytes),digest(lf),digest(lf.replaceAll('\n','\r\n'))].includes(row.checksum), 'Old migration checksum drift');
    }
    const before = await oldSnapshot(db);
    assert.equal(Object.keys(before).length, 70);
    const command = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: api, env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8', windowsHide: true, timeout: 90000 });
    assert.equal(command.status, 0, String(command.stdout + '\n' + command.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<DB URL>').slice(-2000));
    const after = await oldSnapshot(db);
    for (const table of Object.keys(before)) assert.deepEqual(after[table], before[table], 'Old data changed: ' + table);
    assert.equal(Object.keys(after).length, 77);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)[0].count, 26);
    assert.equal(await db.commercialPolicy.count(), 0); assert.equal(await db.commercialRevision.count(), 0);
    const report = { date: '2026-10-27', status: 'passed', migrationCount: 26, previousTablesPreserved: 70, newTables: 7, previousRowsAndColumnsUnchanged: true, previousSnapshotDigest: digest(JSON.stringify(before)), mainFinancialAcceptanceWrites: false, seedOrReset: false, operationalCapacityInvented: false, providers: 'mock', schemaHash: digest(readFileSync(join(api, 'prisma/schema.prisma'), 'utf8').replaceAll('\r\n', '\n')), migrationHash: digest(readFileSync(join(api, 'prisma/migrations/20261027120000_zeus_commercial_capacity/migration.sql'), 'utf8').replaceAll('\r\n', '\n')) };
    writeFileSync(join(root, '.artifacts/zeus/z2-phase/local-activation.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await activateLocal();
