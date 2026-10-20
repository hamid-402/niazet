import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, delimiter, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { verifyOrderBranches } from './phase8-order-branches.mjs';

// Additive acceptance runner: inherited/protected E2E and application code stay unchanged.
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('../../../.artifacts/acceptance/order-branches-runtime/', import.meta.url));
const prismaCli = join(apiRoot, 'node_modules/prisma/build/index.js');
const apiEntry = join(apiRoot, 'dist/main.js');
const envPath = join(apiRoot, '.env');
const fileEnvironment = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
})) : {};
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnvironment.DATABASE_URL;
assert.ok(sourceUrl, 'DATABASE_URL is required for isolated branch acceptance.');
const parsedUrl = new URL(sourceUrl);
assert.match(parsedUrl.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
const databaseName = `niazat_e2e_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_e2e_[a-z0-9_]+$/);
assert.notEqual(databaseName, sourceDatabaseName);
const maintenanceUrl = new URL(parsedUrl); maintenanceUrl.pathname = '/postgres'; maintenanceUrl.searchParams.set('schema', 'public');
const isolatedUrl = new URL(parsedUrl); isolatedUrl.pathname = `/${databaseName}`; isolatedUrl.searchParams.set('schema', 'public');
const control = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
const uploadedStorageKeys = [];
let databaseCreated = false, apiProcess, serverOutput = '';

async function call(origin, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body = options.form;
  if (!body && options.body !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.body); }
  const response = await fetch(`${origin}/v1${path}`, { method: options.method ?? 'GET', headers, body });
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { response, payload };
}
async function ok(origin, path, options) {
  const result = await call(origin, path, options);
  assert.ok(result.response.ok, `${options?.method ?? 'GET'} ${path}: HTTP ${result.response.status}, ${JSON.stringify(result.payload).slice(0, 800)}`);
  return result.payload;
}
try {
  assert.ok(existsSync(apiEntry), 'Build API before running branch acceptance.');
  mkdirSync(runtimeRoot, { recursive: true });
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const port = randomInt(32000, 39000), origin = `http://127.0.0.1:${port}`;
  const environment = {
    ...fileEnvironment, ...process.env, DATABASE_URL: isolatedUrl.toString(), NODE_ENV: 'test',
    LIVE_PROVIDERS_ENABLED: 'false', BACKGROUND_JOBS_ENABLED: 'false',
    PAYMENT_GATEWAY_DRIVER: 'mock', STORAGE_DRIVER: 'local', FILE_SCAN_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock',
    APP_PORT: String(port), APP_URL: origin, WEB_URL: 'http://localhost:3002',
  };
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  environment[pathKey] = [join(apiRoot, 'node_modules', '.bin'), process.env[pathKey] ?? ''].join(delimiter);
  for (const args of [['migrate', 'deploy'], ['db', 'seed']]) {
    const result = spawnSync(process.execPath, [prismaCli, ...args], { cwd: apiRoot, env: environment, encoding: 'utf8', windowsHide: true });
    const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replaceAll(sourceUrl, '<DATABASE_URL redacted>').replaceAll(isolatedUrl.toString(), '<ISOLATED_DATABASE_URL redacted>');
    assert.equal(result.status, 0, `${args.join(' ')} failed: ${diagnostic.slice(-4000)}`);
  }
  apiProcess = spawn(process.execPath, [apiEntry], { cwd: runtimeRoot, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const capture = chunk => { serverOutput = `${serverOutput}${chunk.toString()}`.slice(-8000); };
  apiProcess.stdout.on('data', capture); apiProcess.stderr.on('data', capture);
  let healthy = false;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    assert.equal(apiProcess.exitCode, null, `Isolated API exited: ${serverOutput}`);
    try { if ((await fetch(`${origin}/health`)).ok) { healthy = true; break; } } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  assert.ok(healthy, 'Isolated API did not become healthy.');
  const accounts = {};
  for (const [role, phone] of Object.entries({ ops: '09120000002', finance: '09120000003', executor: '09120000005', customer: '09120000009' })) {
    accounts[role] = await ok(origin, '/auth/login', { method: 'POST', body: { phone, password: 'Passw0rd!123' } });
  }
  const token = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.accessToken]));
  const response = await ok(origin, '/services');
  const services = Array.isArray(response) ? response : response.items ?? response.data;
  const service = services.find(item => item.slug === 'website-design-development');
  assert.ok(service?.id);
  const executor = await ok(origin, '/executor/profile', { token: token.executor });
  await verifyOrderBranches({ databaseUrl: isolatedUrl.toString(), origin, token, accounts, serviceId: service.id, executorProfileId: executor.id, uploadedStorageKeys, ok, call });
} finally {
  if (apiProcess && apiProcess.exitCode == null) {
    apiProcess.kill();
    await Promise.race([once(apiProcess, 'exit'), new Promise(resolveWait => setTimeout(resolveWait, 5000))]);
  }
  for (const key of uploadedStorageKeys) {
    assert.match(key, /^[0-9a-f-]{36}$/i); assert.equal(basename(key), key);
    const file = join(runtimeRoot, 'storage', 'uploads', key);
    if (existsSync(file)) unlinkSync(file);
  }
  if (databaseCreated) {
    assert.match(databaseName, /^niazat_e2e_[a-z0-9_]+$/); assert.notEqual(databaseName, sourceDatabaseName);
    await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', databaseName);
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
}
