import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOutputGate } from './zeus-z3-output-gate.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api');
const digest = value => createHash('sha256').update(value).digest('hex');
export function validateQcLocalTarget(env) {
  assert.equal(env.NODE_ENV ?? 'development', 'development'); assert.notEqual(env.LIVE_PROVIDERS_ENABLED, 'true');
  for (const field of ['PAYMENT_GATEWAY_DRIVER', 'FILE_SCAN_DRIVER', 'SMS_DRIVER', 'EMAIL_DRIVER']) assert.equal(env[field] ?? 'mock', 'mock', field);
  assert.equal(env.STORAGE_DRIVER ?? 'local', 'local');
  const url = new URL(env.DATABASE_URL); assert(['postgresql:', 'postgres:'].includes(url.protocol));
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const name = decodeURIComponent(url.pathname.slice(1)); assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
  assert(!['postgres', 'template0', 'template1', 'niazat_ci'].includes(name)); assert(!/^niazat_(?:zeus|z\d|ui|e2e|perf|invoice)_/.test(name));
  return url;
}
async function snapshot(db) {
  const names = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`;
  const result = {};
  for (const { tablename } of names) { assert.match(tablename, /^[a-z_]+$/); const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM "${tablename}" t ORDER BY row_to_json(t)::text`); result[tablename] = { count: rows.length, hash: digest(rows.map(r => r.value).join('\n')) }; }
  return result;
}
export async function activateQcLocal() {
  assert(process.argv.includes('--apply-local')); assert(!process.env.CI, 'Never a CI activation');
  verifyOutputGate();
  const env = Object.fromEntries(readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1).replace(/^(['"])(.*)\1$/, '$2')]; }));
  const url = validateQcLocalTarget({ ...env, ...process.env });
  let apiRunning = false; try { await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) }); apiRunning = true; } catch {}
  assert.equal(apiRunning, false, 'Stop main API before additive migration');
  const req = createRequire(join(api, 'package.json')), { PrismaClient } = req('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const applied = await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    assert.equal(applied.length, 26); assert(applied.every(r => r.finished_at && !r.rolled_back_at));
    const names = readdirSync(join(api, 'prisma/migrations')).filter(n => /^\d/.test(n)).sort(); assert.equal(names.length, 27);
    assert.equal(names[26], '20261027180000_zeus_output_publications'); assert.deepEqual(applied.map(r => r.migration_name), names.slice(0, 26));
    for (const r of applied) { const bytes = readFileSync(join(api, 'prisma/migrations', r.migration_name, 'migration.sql')), lf = bytes.toString('utf8').replaceAll('\r\n', '\n'); assert([digest(bytes), digest(lf), digest(lf.replaceAll('\n', '\r\n'))].includes(r.checksum), 'Old migration checksum drift'); }
    const before = await snapshot(db); assert.equal(Object.keys(before).length, 77);
    const result = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: api, env: { ...process.env, DATABASE_URL: url.toString() }, windowsHide: true, encoding: 'utf8', timeout: 90000 });
    assert.equal(result.status, 0, String(result.stdout + '\n' + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<database URL>').slice(-2000));
    const after = await snapshot(db); for (const table of Object.keys(before)) assert.deepEqual(after[table], before[table], 'Old data changed: ' + table);
    assert.equal(Object.keys(after).length, 78); assert.equal(await db.outputPublication.count(), 0);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)[0].count, 27);
    const report = { date: '2026-10-27', status: 'passed', packet: 'Z3-QC-01/02', migrationCount: 27, previousTablesPreserved: 77, newTables: 1, previousRowsAndColumnsUnchanged: true, previousSnapshotDigest: digest(JSON.stringify(before)), noAutomaticLegacyApproval: true, mainFinancialAcceptanceWrites: false, seedOrReset: false, providers: 'mock', phaseAccepted: false };
    writeFileSync(join(root, '.artifacts/zeus/z3-file-qc/local-activation.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await activateQcLocal();
