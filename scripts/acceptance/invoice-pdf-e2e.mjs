import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url)), apiRoot = join(repo, 'apps/api');
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const { InvoicesService } = apiRequire('./dist/finance/invoices.service.js');
const artifactRoot = join(repo, '.artifacts/acceptance/invoice-review');
const environmentFile = join(apiRoot, '.env');
const fileEnv = existsSync(environmentFile) ? Object.fromEntries(readFileSync(environmentFile, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
  const separator = line.indexOf('='); return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
})) : {};
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnv.DATABASE_URL;
assert.ok(sourceUrl);
const parsed = new URL(sourceUrl); assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
const databaseName = `niazat_invoice_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_invoice_[a-z0-9_]+$/); assert.notEqual(databaseName, sourceDatabaseName);
const maintenance = new URL(parsed); maintenance.pathname = '/postgres'; maintenance.searchParams.set('schema', 'public');
const isolated = new URL(parsed); isolated.pathname = `/${databaseName}`; isolated.searchParams.set('schema', 'public');
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const db = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'pending', access: [] };
let created = false, apiProcess, serverOutput = '', failure;
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
const port = randomInt(33001, 39000), origin = `http://127.0.0.1:${port}`;
const env = { ...fileEnv, ...process.env, NODE_ENV: 'test', DATABASE_URL: isolated.toString(),
  [pathKey]: [join(apiRoot, 'node_modules/.bin'), process.env[pathKey] ?? ''].join(delimiter),
  LIVE_PROVIDERS_ENABLED: 'false', BACKGROUND_JOBS_ENABLED: 'false', PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local',
  APP_PORT: String(port), APP_URL: origin, WEB_URL: 'http://localhost:3002' };
const redact = value => String(value).replaceAll(sourceUrl, '<DATABASE_URL redacted>').replaceAll(isolated.toString(), '<ISOLATED_DATABASE_URL redacted>');
async function login(phone) {
  const response = await fetch(`${origin}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password: 'Passw0rd!123' }) });
  assert.equal(response.status, 200); return (await response.json()).accessToken;
}
async function financialSnapshot(orderId) {
  return JSON.stringify({
    order: await db.order.findUniqueOrThrow({ where: { id: orderId } }),
    invoice: await db.invoice.findUniqueOrThrow({ where: { orderId } }),
    payments: await db.payment.findMany({ orderBy: { id: 'asc' } }),
    escrows: await db.escrowHold.findMany({ orderBy: { id: 'asc' } }),
    wallets: await db.wallet.findMany({ orderBy: { id: 'asc' } }),
    entries: await db.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
  });
}
try {
  mkdirSync(artifactRoot, { recursive: true });
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true;
  const prisma = join(apiRoot, 'node_modules/prisma/build/index.js');
  for (const args of [['migrate', 'deploy'], ['db', 'seed']]) {
    const result = spawnSync(process.execPath, [prisma, ...args], { cwd: apiRoot, env, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, redact(`${result.stdout}\n${result.stderr}`).slice(-4000));
  }
  apiProcess = spawn(process.execPath, [join(apiRoot, 'dist/main.js')], { cwd: artifactRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [apiProcess.stdout, apiProcess.stderr]) stream.on('data', chunk => { serverOutput = `${serverOutput}${chunk}`.slice(-8000); });
  let healthy = false;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    assert.equal(apiProcess.exitCode, null, redact(serverOutput));
    try { if ((await fetch(`${origin}/health`)).ok) { healthy = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(healthy);
  const customer = await db.user.findUniqueOrThrow({ where: { phone: '09120000009' } });
  await db.user.create({ data: { phone: '09120000019', fullName: 'مشتری دیگر آزمون', role: 'customer', status: 'active', passwordHash: customer.passwordHash } });
  const service = await db.serviceLine.findUniqueOrThrow({ where: { slug: 'website-design-development' } });
  const order = await db.order.create({ data: { code: `INV-QA-${randomUUID().slice(0, 8)}`, title: 'پذیرش ایزوله رندر فاکتور', briefDescription: 'بدون داده واقعی مشتری', customerId: customer.id, serviceId: service.id, status: 'paid', finalPrice: 250000, paidAt: new Date() } });
  const invoices = new InvoicesService(db);
  const invoice = await invoices.issueForOrder(order.id, customer.id, 250000);
  assert.deepEqual(await invoices.issueForOrder(order.id, customer.id, 1), invoice, 'Existing issue/upsert must never reprice an invoice.');
  const before = await financialSnapshot(order.id);
  const tokens = {};
  for (const [role, phone] of Object.entries({ owner: '09120000009', other: '09120000019', finance: '09120000003', super: '09120000001', ops: '09120000002', executor: '09120000005', support: '09120000004' })) tokens[role] = await login(phone);
  const customerPath = `/customer/invoices/${invoice.id}/pdf`, financePath = `/admin/finance/invoices/${invoice.id}/pdf`;
  for (const [role, path, status] of [['guest', customerPath, 401], ['owner', customerPath, 200], ['other', customerPath, 404], ['owner', `/customer/invoices/${randomUUID()}/pdf`, 404], ['finance', financePath, 200], ['super', financePath, 200], ['ops', financePath, 403], ['executor', customerPath, 403], ['support', financePath, 403], ['owner', financePath, 403]]) {
    const response = await fetch(`${origin}/v1${path}`, { headers: tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {} });
    assert.equal(response.status, status, `${role} ${path}`);
    if (status === 200) {
      assert.ok(response.headers.get('content-type')?.includes('application/pdf'));
      assert.equal(response.headers.get('content-disposition'), `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4');
      assert.ok(bytes.toString().includes(invoice.invoiceNumber) && bytes.toString().includes('250,000 IRT'));
      assert.ok(bytes.toString().includes('/FontFile2'));
      writeFileSync(join(artifactRoot, `http-${role}.pdf`), bytes);
    }
    report.access.push({ role, expected: status, actual: response.status });
  }
  assert.equal(await financialSnapshot(order.id), before, 'Downloading must not change invoice, order, money, wallet or Ledger.');
  assert.equal(await db.auditLog.count({ where: { entityId: invoice.id, action: 'invoice.download' } }), 2, 'Finance/Super Admin downloads keep the existing audit.');
  report.status = 'passed'; report.financialStateUnchanged = true; report.auditDownloads = 2;
  console.log('Invoice HTTP acceptance passed: 10 ownership/role cases, unchanged issuance/upsert/financial state, embedded fonts, PDF attachments and audited finance downloads.');
} catch (error) {
  failure = error; report.status = 'failed'; report.failure = redact(error instanceof Error ? error.message : error);
} finally {
  if (apiProcess && apiProcess.exitCode == null) { apiProcess.kill(); await Promise.race([once(apiProcess, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  await db.$disconnect();
  if (created) {
    assert.match(databaseName, /^niazat_invoice_[a-z0-9_]+$/); assert.notEqual(databaseName, sourceDatabaseName);
    await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', databaseName);
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect(); report.completedAt = new Date().toISOString();
  writeFileSync(join(artifactRoot, 'http-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (failure) throw new Error(report.failure);
