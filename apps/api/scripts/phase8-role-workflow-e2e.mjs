import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const apiEntry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const runId = randomUUID();

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

const fileEnvironment = readEnvironmentFile();
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnvironment.DATABASE_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required for isolated role/workflow E2E.');
const parsedUrl = new URL(sourceUrl);
assert.match(parsedUrl.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
const databaseName = `niazat_e2e_${Date.now()}_${runId.replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_e2e_[a-z0-9_]+$/);
assert.notEqual(databaseName, sourceDatabaseName);

const maintenanceUrl = new URL(parsedUrl);
maintenanceUrl.pathname = '/postgres';
maintenanceUrl.searchParams.set('schema', 'public');
const isolatedUrl = new URL(parsedUrl);
isolatedUrl.pathname = `/${databaseName}`;
isolatedUrl.searchParams.set('schema', 'public');

const control = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
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

function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function waitForApi(origin) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (apiProcess?.exitCode != null) {
      throw new Error(`Isolated API exited during startup.\n${serverOutput.slice(-6_000)}`);
    }
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Isolated API did not become healthy.\n${serverOutput.slice(-6_000)}`);
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
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, payload };
}

async function ok(origin, path, options = {}) {
  const result = await call(origin, path, options);
  assert.equal(
    result.response.ok,
    true,
    `${options.method ?? 'GET'} ${path} returned HTTP ${result.response.status}: ${JSON.stringify(result.payload).slice(0, 800)}`,
  );
  return result.payload;
}

async function login(origin, phone, password) {
  const payload = await ok(origin, '/auth/login', {
    method: 'POST',
    body: { phone, password },
  });
  assert.ok(payload.accessToken && payload.user?.id, `Login contract failed for ${phone}.`);
  return payload;
}

async function expectStatus(origin, label, path, token, status) {
  const result = await call(origin, path, { token });
  assert.equal(result.response.status, status, `${label}: expected ${status}, received ${result.response.status}.`);
}

try {
  assert.ok(existsSync(apiEntry), 'Build apps/api before running isolated role/workflow E2E.');
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;

  const isolatedEnvironment = {
    ...fileEnvironment,
    ...process.env,
    DATABASE_URL: isolatedUrl.toString(),
    NODE_ENV: 'test',
    FILE_SCAN_DRIVER: 'mock',
    SMS_DRIVER: 'mock',
    EMAIL_DRIVER: 'mock',
  };
  runPrisma(['migrate', 'deploy'], 'Isolated migration deploy', isolatedEnvironment);
  runPrisma(['db', 'seed'], 'Isolated database seed', isolatedEnvironment);

  const port = randomInt(32_000, 39_000);
  const origin = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: apiRoot,
    env: { ...isolatedEnvironment, APP_PORT: String(port), WEB_URL: 'http://localhost:3002' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-12_000);
  };
  apiProcess.stdout.on('data', capture);
  apiProcess.stderr.on('data', capture);
  await waitForApi(origin);

  const password = 'Passw0rd!123';
  const accounts = {
    superAdmin: await login(origin, '09120000001', password),
    ops: await login(origin, '09120000002', password),
    finance: await login(origin, '09120000003', password),
    support: await login(origin, '09120000004', password),
    executor: await login(origin, '09120000005', password),
    customer: await login(origin, '09120000009', password),
  };
  const token = Object.fromEntries(
    Object.entries(accounts).map(([role, account]) => [role, account.accessToken]),
  );

  const positiveRoleCases = [
    ['super admin boundary', '/admin/users', token.superAdmin],
    ['ops boundary', '/admin/orders', token.ops],
    ['finance boundary', '/admin/finance/dashboard', token.finance],
    ['support boundary', '/support/tickets', token.support],
    ['executor boundary', '/executor/dashboard', token.executor],
    ['customer boundary', '/customer/orders', token.customer],
  ];
  for (const [label, path, accessToken] of positiveRoleCases) {
    const result = await call(origin, path, { token: accessToken });
    assert.equal(result.response.ok, true, `${label} was not accessible.`);
  }

  const negativeRoleCases = [
    ['anonymous authentication boundary', '/auth/me', undefined, 401],
    ['customer cannot enter admin', '/admin/users', token.customer, 403],
    ['customer cannot enter support', '/support/tickets', token.customer, 403],
    ['customer cannot enter executor', '/executor/dashboard', token.customer, 403],
    ['executor cannot enter customer', '/customer/orders', token.executor, 403],
    ['executor cannot enter support', '/support/tickets', token.executor, 403],
    ['support cannot enter customer', '/customer/orders', token.support, 403],
    ['support cannot enter executor', '/executor/dashboard', token.support, 403],
    ['ops cannot enter finance', '/admin/finance/dashboard', token.ops, 403],
    ['finance cannot enter operations', '/admin/services', token.finance, 403],
    ['finance cannot enter QC', '/admin/qc/queue', token.finance, 403],
  ];
  for (const [label, path, accessToken, status] of negativeRoleCases) {
    await expectStatus(origin, label, path, accessToken, status);
  }

  const services = list(await ok(origin, '/services'));
  const service = services.find((item) => item.slug === 'website-design-development');
  assert.ok(service?.id, 'Seed website service is missing.');
  const executorProfile = await ok(origin, '/executor/profile', { token: token.executor });
  assert.ok(executorProfile.id, 'Executor profile is missing.');

  const createKey = `e2e-create-${runId}`;
  const createBody = {
    serviceId: service.id,
    title: `E2E managed website ${runId.slice(0, 8)}`,
    urgency: 'normal',
    briefDescription: 'A complete isolated lifecycle probe for the managed service platform.',
    formResponses: { goal: 'Verify the complete production-critical workflow.' },
    acceptanceCriteria: ['Output file is safe and downloadable.', 'QC checklist is fully passed.'],
  };
  const order = await ok(origin, '/customer/orders', {
    method: 'POST',
    token: token.customer,
    headers: { 'Idempotency-Key': createKey },
    body: createBody,
  });
  const replayedOrder = await ok(origin, '/customer/orders', {
    method: 'POST',
    token: token.customer,
    headers: { 'Idempotency-Key': createKey },
    body: createBody,
  });
  assert.equal(replayedOrder.id, order.id, 'Order creation idempotency replay created another order.');

  const submitted = await ok(origin, `/customer/orders/${order.id}/submit`, {
    method: 'POST',
    token: token.customer,
    headers: { 'Idempotency-Key': `e2e-submit-${runId}` },
  });
  assert.equal(submitted.status, 'pending_triage');
  const triaged = await ok(origin, `/admin/orders/${order.id}/triage`, {
    method: 'POST', token: token.ops, body: { decision: 'send_to_quote', note: 'E2E triage' },
  });
  assert.equal(triaged.status, 'pending_quote');
  const quoted = await ok(origin, `/admin/orders/${order.id}/quote`, {
    method: 'POST', token: token.ops, body: { finalPrice: 2_000_000, note: 'E2E quote' },
  });
  assert.equal(quoted.status, 'quoted');
  const paymentReady = await ok(origin, `/customer/orders/${order.id}/accept-quote`, {
    method: 'POST', token: token.customer,
  });
  assert.equal(paymentReady.status, 'pending_payment');
  const paymentIntent = await ok(origin, `/customer/orders/${order.id}/pay`, {
    method: 'POST', token: token.customer,
    headers: { 'Idempotency-Key': `e2e-payment-${runId}` }, body: {},
  });
  assert.ok(paymentIntent.payment?.id && paymentIntent.redirectUrl, 'Payment intent contract is incomplete.');
  const paymentResult = await ok(origin, `/customer/orders/${order.id}/payments/${paymentIntent.payment.id}/verify`, {
    method: 'POST', token: token.customer,
    headers: { 'Idempotency-Key': `e2e-verify-${runId}` },
  });
  assert.equal(paymentResult.payment?.status, 'succeeded');
  assert.ok(paymentResult.escrow?.id, 'Escrow was not created after payment.');
  const paidOrder = await ok(origin, `/customer/orders/${order.id}`, { token: token.customer });
  assert.equal(paidOrder.status, 'paid');

  const financePayments = list(await ok(origin, '/admin/finance/payments?pageSize=100', { token: token.finance }));
  const financeEscrows = list(await ok(origin, '/admin/finance/escrow?pageSize=100', { token: token.finance }));
  const financeInvoices = list(await ok(origin, '/admin/finance/invoices?pageSize=100', { token: token.finance }));
  assert.ok(financePayments.some((item) => item.id === paymentIntent.payment.id), 'Finance cannot see the payment.');
  assert.ok(financeEscrows.some((item) => item.orderId === order.id), 'Finance cannot see the escrow hold.');
  assert.ok(financeInvoices.some((item) => item.orderId === order.id), 'Finance cannot see the invoice.');

  const assigned = await ok(origin, `/admin/orders/${order.id}/assign`, {
    method: 'POST', token: token.ops,
    body: { executorProfileId: executorProfile.id, assignmentRole: 'pursuit_owner', note: 'E2E assignment' },
  });
  assert.equal(assigned.status, 'assigned');
  const accepted = await ok(origin, `/executor/orders/${order.id}/accept`, {
    method: 'POST', token: token.executor,
  });
  assert.ok(accepted.executionChecklistItems?.length, 'Execution checklist was not created.');
  for (const item of accepted.executionChecklistItems) {
    const completed = await ok(origin, `/executor/orders/${order.id}/checklist/${item.id}`, {
      method: 'PATCH', token: token.executor, body: { completed: true },
    });
    assert.equal(completed.isCompleted, true);
  }
  const started = await ok(origin, `/executor/orders/${order.id}/start`, {
    method: 'POST', token: token.executor,
  });
  assert.equal(started.status, 'in_progress');

  const uploadForm = new FormData();
  uploadForm.set('orderId', order.id);
  uploadForm.set('fileKind', 'output');
  uploadForm.set('file', new Blob([`Niazat isolated E2E output ${runId}\n`], { type: 'text/plain' }), `niazat-e2e-${runId}.txt`);
  const outputFile = await ok(origin, '/files/upload', {
    method: 'POST', token: token.executor, form: uploadForm,
  });
  assert.equal(outputFile.scanStatus, 'clean');
  assert.match(outputFile.storageKey, /^[0-9a-f-]{36}$/i);
  uploadedStorageKeys.push(outputFile.storageKey);
  await ok(origin, `/executor/orders/${order.id}/progress-report`, {
    method: 'POST', token: token.executor,
    body: { summary: 'E2E progress report', progressPercent: 100, fileId: outputFile.id },
  });
  const deliveredToQc = await ok(origin, `/executor/orders/${order.id}/deliver`, {
    method: 'POST', token: token.executor,
    body: { summary: 'E2E delivery ready for QC', fileIds: [outputFile.id] },
  });
  assert.equal(deliveredToQc.status, 'qc_in_review');

  const qcQueue = list(await ok(origin, '/admin/qc/queue', { token: token.ops }));
  const queuedReview = qcQueue.find((item) => item.order?.id === order.id);
  assert.ok(queuedReview?.id, 'Delivered order did not enter the QC queue.');
  const review = await ok(origin, `/admin/qc/${queuedReview.id}`, { token: token.ops });
  const checklistIds = review.order.serviceLine.qcChecklistTemplates
    .flatMap((template) => template.items)
    .map((item) => item.id);
  assert.ok(checklistIds.length, 'QC checklist template is empty.');
  const qcApproved = await ok(origin, `/admin/qc/${queuedReview.id}/approve`, {
    method: 'POST', token: token.ops,
    body: {
      comment: 'E2E quality approval',
      items: checklistIds.map((checklistItemId) => ({ checklistItemId, passed: true })),
    },
  });
  assert.equal(qcApproved.status, 'delivered');

  const signed = await ok(origin, `/files/${outputFile.id}/signed-url`, { token: token.customer });
  assert.match(signed.url, /^\/v1\/files\/download\?token=/);
  const downloaded = await fetch(`${origin}${signed.url}`);
  assert.equal(downloaded.status, 200, 'Signed download did not return the output file.');
  assert.match(await downloaded.text(), /Niazat isolated E2E output/);
  const closed = await ok(origin, `/customer/orders/${order.id}/confirm`, {
    method: 'POST', token: token.customer,
    headers: { 'Idempotency-Key': `e2e-confirm-${runId}` },
  });
  assert.equal(closed.status, 'closed');

  const ticket = await ok(origin, '/customer/tickets', {
    method: 'POST', token: token.customer,
    body: {
      subject: 'E2E completed-order support probe', category: 'support', orderId: order.id,
      message: 'Please confirm the support lifecycle.', priority: 'normal',
    },
  });
  assert.ok(ticket.id, 'Customer ticket was not created.');
  const claimedTicket = await ok(origin, `/support/tickets/${ticket.id}/claim`, {
    method: 'POST', token: token.support,
  });
  assert.equal(claimedTicket.assignedToUserId, accounts.support.user.id);
  await ok(origin, `/support/tickets/${ticket.id}/reply`, {
    method: 'POST', token: token.support,
    body: { body: 'E2E support response', visibility: 'customer_visible' },
  });
  const resolvedTicket = await ok(origin, `/support/tickets/${ticket.id}/resolve`, {
    method: 'POST', token: token.support,
  });
  assert.equal(resolvedTicket.status, 'resolved');
  const customerTicket = await ok(origin, `/customer/tickets/${ticket.id}`, { token: token.customer });
  assert.equal(customerTicket.status, 'resolved');
  assert.ok(customerTicket.messages.some((message) => message.body === 'E2E support response'));

  const releasedEscrows = list(await ok(origin, '/admin/finance/escrow?pageSize=100', { token: token.finance }));
  assert.ok(
    releasedEscrows.some((item) => item.orderId === order.id && item.status === 'released'),
    'Customer confirmation did not release escrow.',
  );
  await ok(origin, '/admin/audit-log?pageSize=100', { token: token.superAdmin });

  console.log(
    `Phase 8 role/workflow API E2E passed: ${positiveRoleCases.length} positive role boundaries, ${negativeRoleCases.length} negative boundaries, and complete order/payment/file/QC/delivery/settlement/ticket lifecycle.`,
  );
} finally {
  if (apiProcess && apiProcess.exitCode == null) {
    apiProcess.kill();
    await Promise.race([once(apiProcess, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
  const uploadRoot = join(apiRoot, 'storage', 'uploads');
  for (const storageKey of uploadedStorageKeys) {
    assert.equal(basename(storageKey), storageKey, 'Unsafe storage cleanup key.');
    const storedFile = join(uploadRoot, storageKey);
    assert.equal(storedFile.startsWith(uploadRoot), true, 'Unsafe upload cleanup target.');
    if (existsSync(storedFile)) unlinkSync(storedFile);
  }
  if (databaseCreated) {
    await control.$queryRawUnsafe(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      databaseName,
    );
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
}

