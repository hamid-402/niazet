import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(apiRoot, '../..');
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const apiEntry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const runId = randomUUID();
const profileName = process.argv.find((argument) => argument.startsWith('--profile='))?.split('=')[1] ?? 'smoke';
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length);

const profiles = {
  smoke: {
    authSession: { requests: 40, concurrency: 8, p95Ms: 2_000, minRps: 2 },
    authProtection: { requests: 12, concurrency: 4, p95Ms: 2_500, minRps: 1 },
    orderList: { requests: 80, concurrency: 10, p95Ms: 2_000, minRps: 3 },
    fileDownload: { requests: 20, concurrency: 4, p95Ms: 4_000, minRps: 1 },
    paymentVerify: { requests: 8, concurrency: 4, p95Ms: 4_000, minRps: 0.5 },
    paymentList: { requests: 50, concurrency: 8, p95Ms: 2_500, minRps: 2 },
    workerLock: { requests: 8, concurrency: 4, p95Ms: 5_000, minRps: 0.5 },
  },
  stress: {
    authSession: { requests: 400, concurrency: 40, p95Ms: 4_000, minRps: 8 },
    authProtection: { requests: 12, concurrency: 4, p95Ms: 3_500, minRps: 1 },
    orderList: { requests: 800, concurrency: 50, p95Ms: 4_000, minRps: 10 },
    fileDownload: { requests: 48, concurrency: 12, p95Ms: 6_000, minRps: 2 },
    paymentVerify: { requests: 12, concurrency: 8, p95Ms: 6_000, minRps: 0.5 },
    paymentList: { requests: 400, concurrency: 30, p95Ms: 4_000, minRps: 8 },
    workerLock: { requests: 30, concurrency: 15, p95Ms: 7_000, minRps: 1 },
  },
};

assert.ok(profileName in profiles, `Unknown load profile: ${profileName}`);
const profile = profiles[profileName];

function readEnvironmentFile() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const raw = line.slice(separator + 1).trim();
        return [key, raw.replace(/^(['"])(.*)\1$/, '$2')];
      }),
  );
}

function percentile(values, percentage) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentage / 100) * ordered.length) - 1);
  return ordered[index] ?? 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function call(origin, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${origin}/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? '';
  let payload = new TextDecoder().decode(bytes);
  if (contentType.includes('application/json') && payload) payload = JSON.parse(payload);
  return { status: response.status, headers: response.headers, payload, bytes: bytes.byteLength };
}

async function ok(origin, path, options = {}) {
  const result = await call(origin, path, options);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${options.method ?? 'GET'} ${path} returned HTTP ${result.status}: ${JSON.stringify(result.payload).slice(0, 600)}`,
  );
  return result.payload;
}

async function waitForApi(origin, apiProcess, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode != null) throw new Error(`Isolated API exited during startup.\n${output().slice(-6_000)}`);
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Isolated API did not become healthy.\n${output().slice(-6_000)}`);
}

async function runScenario(report, name, budget, task, allowedStatuses) {
  let cursor = 0;
  const samples = [];
  const startedAt = performance.now();
  const workers = Array.from({ length: Math.min(budget.concurrency, budget.requests) }, async () => {
    while (cursor < budget.requests) {
      const index = cursor;
      cursor += 1;
      const requestStartedAt = performance.now();
      try {
        const result = await task(index);
        samples.push({ status: result.status, latencyMs: performance.now() - requestStartedAt });
      } catch (error) {
        samples.push({
          status: 0,
          latencyMs: performance.now() - requestStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  await Promise.all(workers);
  const durationMs = performance.now() - startedAt;
  const latencies = samples.map((sample) => sample.latencyMs);
  const statusCounts = {};
  for (const sample of samples) statusCounts[sample.status] = (statusCounts[sample.status] ?? 0) + 1;
  const failures = samples.filter((sample) => sample.error || !allowedStatuses.has(sample.status));
  const metric = {
    name,
    requests: samples.length,
    concurrency: budget.concurrency,
    durationMs: round(durationMs),
    requestsPerSecond: round((samples.length * 1_000) / durationMs),
    p50Ms: round(percentile(latencies, 50)),
    p95Ms: round(percentile(latencies, 95)),
    p99Ms: round(percentile(latencies, 99)),
    maxMs: round(Math.max(...latencies)),
    statusCounts,
    thresholds: { p95Ms: budget.p95Ms, minRps: budget.minRps, unexpectedResponses: 0 },
  };
  report.scenarios.push(metric);
  assert.equal(failures.length, 0, `${name} returned unexpected responses: ${JSON.stringify(failures.slice(0, 3))}`);
  assert.ok(metric.p95Ms <= budget.p95Ms, `${name} p95 ${metric.p95Ms}ms exceeded ${budget.p95Ms}ms.`);
  assert.ok(
    metric.requestsPerSecond >= budget.minRps,
    `${name} throughput ${metric.requestsPerSecond} req/s fell below ${budget.minRps} req/s.`,
  );
  return metric;
}

const fileEnvironment = readEnvironmentFile();
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnvironment.DATABASE_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required for the isolated load/stress test.');
const parsedUrl = new URL(sourceUrl);
assert.match(parsedUrl.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
const databaseName = `niazat_load_${Date.now()}_${runId.replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_load_[a-z0-9_]+$/);
assert.notEqual(databaseName, sourceDatabaseName);

const maintenanceUrl = new URL(parsedUrl);
maintenanceUrl.pathname = '/postgres';
maintenanceUrl.searchParams.set('schema', 'public');
const isolatedUrl = new URL(parsedUrl);
isolatedUrl.pathname = `/${databaseName}`;
isolatedUrl.searchParams.set('schema', 'public');
const control = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
let database;
let databaseCreated = false;
let apiProcess;
let serverOutput = '';
const uploadedStorageKeys = [];

function runPrisma(args, label, environment) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: apiRoot,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .replaceAll(sourceUrl, '<DATABASE_URL redacted>')
      .replaceAll(isolatedUrl.toString(), '<ISOLATED_DATABASE_URL redacted>')
      .slice(-6_000);
    throw new Error(`${label} failed.\n${output}`);
  }
}

function orderBody(serviceId, suffix) {
  return {
    serviceId,
    title: `Load-safe managed website ${suffix}`,
    urgency: 'normal',
    briefDescription: 'Isolated performance workload for production-critical paths.',
    formResponses: { goal: 'Measure concurrency without touching persistent environments.' },
    acceptanceCriteria: ['Responses stay correct under bounded concurrency.'],
  };
}

async function login(origin, phone) {
  const payload = await ok(origin, '/auth/login', {
    method: 'POST',
    body: { phone, password: 'Passw0rd!123' },
  });
  assert.ok(payload.accessToken && payload.user?.id, `Login contract failed for ${phone}.`);
  return payload.accessToken;
}

const report = {
  schemaVersion: 1,
  profile: profileName,
  generatedAt: new Date().toISOString(),
  isolation: 'temporary-postgresql-database-and-random-local-api-port',
  scenarios: [],
};

try {
  assert.ok(existsSync(apiEntry), 'Build apps/api before running load/stress tests.');
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const isolatedEnvironment = {
    ...fileEnvironment,
    ...process.env,
    DATABASE_URL: isolatedUrl.toString(),
    NODE_ENV: 'test',
    BACKGROUND_JOBS_ENABLED: 'false',
    PAYMENT_GATEWAY_DRIVER: 'mock',
    FILE_SCAN_DRIVER: 'mock',
    SMS_DRIVER: 'mock',
    EMAIL_DRIVER: 'mock',
  };
  runPrisma(['migrate', 'deploy'], 'Isolated migration deploy', isolatedEnvironment);
  runPrisma(['db', 'seed'], 'Isolated database seed', isolatedEnvironment);
  database = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } } });

  const port = randomInt(40_000, 47_000);
  const origin = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: apiRoot,
    env: { ...isolatedEnvironment, APP_PORT: String(port), APP_URL: origin, WEB_URL: 'http://localhost:3002' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-20_000);
  };
  apiProcess.stdout.on('data', capture);
  apiProcess.stderr.on('data', capture);
  await waitForApi(origin, apiProcess, () => serverOutput);

  const [customerToken, opsToken, financeToken, superAdminToken] = await Promise.all([
    login(origin, '09120000009'),
    login(origin, '09120000002'),
    login(origin, '09120000003'),
    login(origin, '09120000001'),
  ]);
  const services = await ok(origin, '/services');
  const serviceList = Array.isArray(services) ? services : services.items ?? services.data ?? [];
  const service = serviceList.find((item) => item.slug === 'website-design-development');
  assert.ok(service?.id, 'Seed website service is missing.');

  const fileOrder = await ok(origin, '/customer/orders', {
    method: 'POST',
    token: customerToken,
    headers: { 'Idempotency-Key': `load-file-order-${runId}` },
    body: orderBody(service.id, `file-${runId.slice(0, 8)}`),
  });
  const uploadForm = new FormData();
  uploadForm.set('orderId', fileOrder.id);
  uploadForm.set('fileKind', 'input');
  uploadForm.set('file', new Blob([`Niazat load probe ${runId}\n`], { type: 'text/plain' }), `load-${runId}.txt`);
  const uploadedFile = await ok(origin, '/files/upload', {
    method: 'POST', token: customerToken, form: uploadForm,
  });
  assert.equal(uploadedFile.scanStatus, 'clean');
  uploadedStorageKeys.push(uploadedFile.storageKey);

  const paymentOrder = await ok(origin, '/customer/orders', {
    method: 'POST',
    token: customerToken,
    headers: { 'Idempotency-Key': `load-payment-order-${runId}` },
    body: orderBody(service.id, `payment-${runId.slice(0, 8)}`),
  });
  await ok(origin, `/customer/orders/${paymentOrder.id}/submit`, {
    method: 'POST', token: customerToken, headers: { 'Idempotency-Key': `load-submit-${runId}` },
  });
  await ok(origin, `/admin/orders/${paymentOrder.id}/triage`, {
    method: 'POST', token: opsToken, body: { decision: 'send_to_quote', note: 'Load test triage' },
  });
  await ok(origin, `/admin/orders/${paymentOrder.id}/quote`, {
    method: 'POST', token: opsToken, body: { finalPrice: 2_000_000, note: 'Load test quote' },
  });
  await ok(origin, `/customer/orders/${paymentOrder.id}/accept-quote`, {
    method: 'POST', token: customerToken,
  });
  const paymentIntent = await ok(origin, `/customer/orders/${paymentOrder.id}/pay`, {
    method: 'POST',
    token: customerToken,
    headers: { 'Idempotency-Key': `load-payment-${runId}` },
    body: {},
  });
  assert.ok(paymentIntent.payment?.id, 'Payment intent setup failed.');

  await runScenario(report, 'auth-session', profile.authSession, () =>
    call(origin, '/auth/me', { token: customerToken }), new Set([200]));
  const abuseMetric = await runScenario(report, 'auth-abuse-protection', profile.authProtection, () =>
    call(origin, '/auth/login', {
      method: 'POST', body: { phone: '09129999999', password: 'Definitely-Wrong-Password!1' },
    }), new Set([401, 429]));
  assert.ok((abuseMetric.statusCounts[429] ?? 0) >= 2, 'Auth abuse protection did not throttle the burst.');

  await runScenario(report, 'customer-order-list', profile.orderList, () =>
    call(origin, '/customer/orders?pageSize=20', { token: customerToken }), new Set([200]));

  await runScenario(report, 'signed-file-download', profile.fileDownload, async () => {
    const signed = await call(origin, `/files/${uploadedFile.id}/signed-url`, { token: customerToken });
    assert.ok(signed.status >= 200 && signed.status < 300 && typeof signed.payload?.url === 'string');
    const response = await fetch(`${origin}${signed.payload.url}`);
    const content = await response.text();
    assert.match(content, /Niazat load probe/);
    return { status: response.status };
  }, new Set([200]));

  const verifyMetric = await runScenario(report, 'payment-verify-idempotency', profile.paymentVerify, () =>
    call(origin, `/customer/orders/${paymentOrder.id}/payments/${paymentIntent.payment.id}/verify`, {
      method: 'POST',
      token: customerToken,
      headers: { 'Idempotency-Key': `load-verify-${runId}` },
    }), new Set([200, 201, 409]));
  assert.ok(
    (verifyMetric.statusCounts[200] ?? 0) + (verifyMetric.statusCounts[201] ?? 0) >= 1,
    'No payment verification request completed successfully.',
  );
  const [storedPayment, storedOrder, escrowCount, invoiceCount] = await Promise.all([
    database.payment.findUnique({ where: { id: paymentIntent.payment.id } }),
    database.order.findUnique({ where: { id: paymentOrder.id } }),
    database.escrowHold.count({ where: { paymentId: paymentIntent.payment.id } }),
    database.invoice.count({ where: { orderId: paymentOrder.id } }),
  ]);
  assert.equal(storedPayment?.status, 'succeeded', 'Payment did not settle after concurrent verification.');
  assert.equal(storedOrder?.status, 'paid', 'Order did not reach paid state.');
  assert.equal(escrowCount, 1, 'Concurrent verification created duplicate escrow holds.');
  assert.equal(invoiceCount, 1, 'Concurrent verification created duplicate invoices.');

  await runScenario(report, 'finance-payment-list', profile.paymentList, () =>
    call(origin, '/admin/finance/payments?pageSize=100', { token: financeToken }), new Set([200]));

  await runScenario(report, 'worker-single-run-lock', profile.workerLock, () =>
    call(origin, '/admin/jobs/send_outbox_notifications/run', {
      method: 'POST', token: superAdminToken,
    }), new Set([200, 201]));
  const jobRuns = await database.backgroundJobRun.findMany({
    where: { jobName: 'send_outbox_notifications' },
  });
  assert.equal(jobRuns.length, 1, 'Concurrent worker trigger bypassed the unique run lock.');
  assert.equal(jobRuns[0]?.status, 'succeeded', 'The elected worker run did not succeed.');

  if (outputArgument) {
    const outputPath = resolve(apiRoot, outputArgument);
    const outputRelative = relative(repositoryRoot, outputPath);
    assert.ok(outputRelative && !outputRelative.startsWith('..'), 'Load report must stay inside the repository.');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.table(
    report.scenarios.map(({ name, requests, concurrency, requestsPerSecond, p95Ms, statusCounts }) => ({
      name, requests, concurrency, requestsPerSecond, p95Ms, status: JSON.stringify(statusCounts),
    })),
  );
  console.log(`Phase 8 ${profileName} load profile passed with isolated PostgreSQL, real HTTP and bounded cleanup.`);
} finally {
  if (apiProcess && apiProcess.exitCode == null) {
    apiProcess.kill();
    await Promise.race([once(apiProcess, 'exit'), new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
  }
  const uploadRoot = join(apiRoot, 'storage', 'uploads');
  for (const storageKey of uploadedStorageKeys) {
    assert.equal(basename(storageKey), storageKey, 'Unsafe storage cleanup key.');
    const storedFile = join(uploadRoot, storageKey);
    assert.equal(storedFile.startsWith(uploadRoot), true, 'Unsafe upload cleanup target.');
    if (existsSync(storedFile)) unlinkSync(storedFile);
  }
  await database?.$disconnect();
  if (databaseCreated) {
    await control.$queryRawUnsafe(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      databaseName,
    );
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
}
