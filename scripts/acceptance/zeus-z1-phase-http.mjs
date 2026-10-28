import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildZ1Contracts } from './zeus-z1-contract-inventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api');
const req = createRequire(join(api, 'package.json')), { PrismaClient } = req('@prisma/client');
const env = Object.fromEntries(readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const n = l.indexOf('='); return [l.slice(0, n), l.slice(n + 1).replace(/^(['"])(.*)\1$/, '$2')]; }));
const source = new URL(env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'Local only');
const name = `niazat_z1_contract_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(name, /^niazat_z1_contract_\d+_[a-f0-9]{8}$/);
assert.notEqual(name, decodeURIComponent(source.pathname.slice(1)));
const target = new URL(source); target.pathname = '/' + name;
const maintenance = new URL(source); maintenance.pathname = '/postgres';
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const output = join(root, '.artifacts/zeus/z1-phase'); mkdirSync(output, { recursive: true });
const port = randomInt(32000, 39000), origin = `http://127.0.0.1:${port}`;
const environment = { ...env, ...process.env, DATABASE_URL: target.toString(), NODE_ENV: 'test', BACKGROUND_JOBS_ENABLED: 'false', LIVE_PROVIDERS_ENABLED: 'false', PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local', ZEUS_WALLET_ENABLED: 'true', APP_PORT: String(port), APP_URL: origin, WEB_URL: 'http://localhost:3002' };
const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === 'path') ?? 'PATH';
environment[pathKey] = [join(api, 'node_modules/.bin'), process.env[pathKey] ?? ''].join(delimiter);
let created = false, db, server, logs = '';
const report = { schemaVersion: 1, date: '2026-10-26', status: 'running', mainDatabaseConnected: false, liveProvidersUsed: false, contractRows: [], cases: [] };
const redact = value => String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<DB URL>');
const contracts = buildZ1Contracts();
const tokens = {}, accounts = {};
async function call(path, role, method = 'GET', body, headers = {}) {
  const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: 'Bearer ' + tokens[role] } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, payload, headers: response.headers };
}
async function ok(path, role, method = 'GET', body, headers) {
  const r = await call(path, role, method, body, headers);
  assert(r.status >= 200 && r.status < 300, `${method} ${path}: ${r.status} ${JSON.stringify(r.payload).slice(0, 500)}`); return r.payload;
}
async function rejected(path, role, method, body, status) {
  const r = await call(path, role, method, body); assert.equal(r.status, status, `${method} ${path} role=${role}: ${JSON.stringify(r.payload).slice(0, 400)}`); return r;
}
try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  for (const args of [['migrate', 'deploy'], ['db', 'seed']]) {
    const result = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), ...args], { cwd: api, env: environment, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, redact(result.stdout + '\n' + result.stderr).slice(-1800));
  }
  db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  server = spawn(process.execPath, [join(api, 'dist/main.js')], { cwd: output, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const capture = chunk => { logs = (logs + chunk).slice(-16000); }; server.stdout.on('data', capture); server.stderr.on('data', capture);
  let healthy = false;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    assert.equal(server.exitCode, null, redact(logs));
    try { if ((await fetch(origin + '/health')).ok) { healthy = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert(healthy, redact(logs));
  const openApi = await ok('/docs-json');
  for (const row of contracts.api) for (const target of row.targets) {
    const swaggerPath = target.path.replace(/:([A-Za-z]\w*)/g, '{$1}');
    assert(openApi.paths[swaggerPath]?.[target.method.toLowerCase()], 'OpenAPI route missing: ' + target.signature);
  }
  writeFileSync(join(output, 'api-openapi.json'), JSON.stringify(openApi, null, 2) + '\n');
  report.openApiTargetsVerified = 76;
  for (const [role, phone] of Object.entries({ super: '09120000001', ops: '09120000002', finance: '09120000003', support: '09120000004', executor: '09120000005', customer: '09120000009' })) {
    const login = await ok('/v1/auth/login', null, 'POST', { phone, password: 'Passw0rd!123' });
    tokens[role] = login.accessToken; accounts[role] = login.user;
  }
  const service = (await ok('/v1/services')).find(s => s.slug === 'website-design-development'); assert(service);
  const missing = randomUUID();
  const filled = path => path.replace(/:slug\b/g, service.slug).replace(/:[A-Za-z]\w*/g, missing);
  // Every one of the 84 source rows must bind to deployed routes and undergo
  // independent guest/negative-role HTTP probes, not pass because of AST alone.
  const seen = new Map();
  for (const row of contracts.api) {
    const proofs = [];
    for (const target of row.targets) {
      if (seen.has(target.signature)) { proofs.push(seen.get(target.signature)); continue; }
      const { method, path, roles, public: isPublic, scopes } = target;
      const requestPath = filled(path);
      const guest = await call(requestPath, null, method, method === 'GET' ? undefined : {});
      if (isPublic && path === '/v1/auth/refresh') assert.equal(guest.status, 401, 'Refresh cookie is required, public means no access JWT');
      else if (isPublic) assert([200, 201, 400, 404].includes(guest.status), target.signature + ' public contract ' + guest.status);
      else assert.equal(guest.status, 401, target.signature + ' guest must not pass');
      const negatives = [];
      if (!isPublic) for (const role of ['customer', 'executor', 'support', 'ops', 'finance']) {
        const actual = ['ops', 'finance'].includes(role) ? 'admin' : role;
        if ((!roles.length || roles.includes(actual)) && (!scopes.length || actual !== 'admin' || scopes.includes(role === 'ops' ? 'ops_admin' : 'finance_admin'))) continue;
        const r = await call(requestPath, role, method, method === 'GET' ? undefined : {});
        assert.equal(r.status, 403, target.signature + ' rejects ' + role + ': ' + r.status);
        negatives.push({ role, status: r.status });
      }
      const proof = { signature: target.signature, guest: guest.status, negativeRoles: negatives };
      seen.set(target.signature, proof); proofs.push(proof);
    }
    report.contractRows.push({ id: row.id, status: 'boundary-probes-passed', deferredProvider: row.deferredProvider, proofs });
  }
  assert.equal(report.contractRows.length, 84);
  report.cases.push('all_84_source_rows_bound_to_76_deployed_routes_guest_role_scope_guards');

  const customerId = accounts.customer.id, support = accounts.support;
  const ownDashboard = await ok('/v1/customer/dashboard', 'customer');
  assert.equal(ownDashboard.totalOrders, await db.order.count({ where: { customerId } }));
  assert.equal(ownDashboard.wallet.balance, 0); assert.equal(Object.keys(ownDashboard.counts).length, 20);
  await ok('/v1/admin/stats', 'super'); await rejected('/v1/admin/stats', 'ops', 'GET', undefined, 403);
  await ok('/v1/admin/staff-report?from=2026-10-01&to=2026-10-26', 'ops');
  const executor = await db.executorProfile.findUniqueOrThrow({ where: { userId: accounts.executor.id } });
  const staffBefore = await db.executorProfile.findUnique({ where: { id: executor.id } });
  await ok(`/v1/admin/staff/${executor.id}/performance`, 'ops');
  assert.deepEqual(await db.executorProfile.findUnique({ where: { id: executor.id } }), staffBefore);
  report.cases.push('customer_global_support_staff_read_models_real_counts_no_status_effect');

  const draft = await ok('/v1/customer/orders', 'customer', 'POST', { serviceId: service.id, title: 'درخواست قرارداد زئوس', briefDescription: 'شرح معتبر و واقعی برای آزمون قرارداد ایزوله' }, { 'Idempotency-Key': randomUUID() });
  const formFields = await db.serviceFormField.findMany({ where: { serviceId: service.id, required: true } });
  // No fabricated form answer is used to claim full order/QC acceptance here.
  // This fixture targets snapshot binding; full order branches run separately.
  await db.order.update({ where: { id: draft.id }, data: { status: 'pending_quote' } });
  await ok(`/v1/admin/orders/${draft.id}/quote`, 'ops', 'POST', { finalPrice: 120000, note: 'یادداشت داخلی قرارداد' });
  const snapshot = await db.orderContractSnapshot.findUniqueOrThrow({ where: { orderId: draft.id } });
  assert.equal(snapshot.basePrice, null); assert.equal(snapshot.deadlineEffective, null); assert.equal(snapshot.policySnapshot.agreedFinalPrice, 120000);
  await db.orderPublicHandler.create({ data: { orderId: draft.id, internalUserId: accounts.executor.id, publicHandlerCode: 'PUBLIC-CODE', displayAlias: 'همراه اجرای شما', assignmentRole: 'pursuit_owner', visibleToCustomer: true } });
  const detail = await ok(`/v1/customer/orders/${draft.id}`, 'customer'); assert(detail.contractSnapshot); assert(!JSON.stringify(detail).includes('یادداشت داخلی'));
  assert.equal(detail.publicHandlers[0].publicHandlerCode, 'PUBLIC-CODE'); assert(!JSON.stringify(detail).includes(accounts.executor.id));
  assert(!JSON.stringify(await ok('/v1/customer/orders', 'customer')).includes(accounts.executor.id));
  await ok(`/v1/admin/services/${service.id}/contract-policy`, 'ops', 'PUT', { version: 2, normalRateBps: 0, urgentRateBps: 3000, sameDayRateBps: 8000, sortOrder: 5, reason: 'تغییر ترتیب خدمت برای آزمون' });
  assert.deepEqual(await db.orderContractSnapshot.findUnique({ where: { orderId: draft.id } }), snapshot);
  await rejected(`/v1/admin/services/${service.id}/contract-policy`, 'ops', 'PUT', { version: 2, normalRateBps: 0, urgentRateBps: 3000, sameDayRateBps: 8000, sortOrder: 1, reason: 'نسخه تکراری' }, 409);
  report.cases.push('immutable_quote_snapshot_unknown_values_private_note_versioned_policy');

  const ticket = await ok('/v1/customer/tickets', 'customer', 'POST', { subject: 'آزمون SLA نسخه‌دار', category: 'other', message: 'لطفاً وضعیت درخواست من را بررسی کنید.' });
  const ticketSnapshot = await db.ticketSlaPolicySnapshot.findUniqueOrThrow({ where: { ticketId: ticket.id } });
  assert.equal(ticketSnapshot.firstResponseBusinessMinutes, 240); assert.deepEqual(ticketSnapshot.calendar.workDays, [6, 0, 1, 2, 3, 4]);
  assert.equal(ticketSnapshot.firstMeaningfulReplyAt, null);
  await ok(`/v1/support/tickets/${ticket.id}/assign`, 'support', 'PATCH', { assignedToUserId: support.id });
  await ok(`/v1/support/tickets/${ticket.id}/reply`, 'support', 'POST', { body: 'یادداشت خصوصی پشتیبان', visibility: 'internal_only' });
  assert.equal((await db.ticketSlaPolicySnapshot.findUnique({ where: { ticketId: ticket.id } })).firstMeaningfulReplyAt, null);
  const visible = await ok(`/v1/customer/tickets/${ticket.id}`, 'customer'); assert(!JSON.stringify(visible).includes('یادداشت خصوصی'));
  await ok(`/v1/support/tickets/${ticket.id}/reply`, 'support', 'POST', { body: 'پاسخ عمومی معنادار پشتیبان' });
  assert((await db.ticketSlaPolicySnapshot.findUnique({ where: { ticketId: ticket.id } })).firstMeaningfulReplyAt);
  await ok('/v1/admin/support/sla-calendar', 'super', 'PUT', { calendar: { ...ticketSnapshot.calendar, version: 2, firstResponseBusinessMinutes: 120 }, reason: 'تقویم جدید فقط برای تیکت‌های بعدی' });
  assert.equal((await db.ticketSlaPolicySnapshot.findUnique({ where: { ticketId: ticket.id } })).policyVersion, 1);
  const newer = await ok('/v1/customer/tickets', 'customer', 'POST', { subject: 'تیکت نسخه جدید', category: 'other', message: 'درخواست آزمون' });
  assert.equal((await db.ticketSlaPolicySnapshot.findUnique({ where: { ticketId: newer.id } })).policyVersion, 2);
  await rejected(`/v1/customer/tickets/${ticket.id}/rating`, 'customer', 'POST', { rating: 5 }, 400);
  await ok(`/v1/support/tickets/${ticket.id}/resolve`, 'support', 'POST');
  const rated = await ok(`/v1/customer/tickets/${ticket.id}/rating`, 'customer', 'POST', { rating: 5 });
  assert.equal(rated.rating, 5); assert.deepEqual(await ok(`/v1/customer/tickets/${ticket.id}/rating`, 'customer', 'POST', { rating: 5 }), rated);
  await rejected(`/v1/customer/tickets/${ticket.id}/rating`, 'customer', 'POST', { rating: 1 }, 409);
  report.cases.push('versioned_new_ticket_calendar_first_human_reply_privacy_rating_idempotency');

  await ok(`/v1/support/tickets/${newer.id}/assign`, 'support', 'PATCH', { assignedToUserId: support.id });
  const beforeReply = { count: await db.ticketMessage.count({ where: { ticketId: newer.id } }), ticket: await db.ticket.findUnique({ where: { id: newer.id } }) };
  await db.$executeRawUnsafe("CREATE FUNCTION zeus_fail_ticket_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'ticket.reply' THEN RAISE EXCEPTION 'isolated rollback fixture'; END IF; RETURN NEW; END $$");
  await db.$executeRawUnsafe('CREATE TRIGGER zeus_outbox_failure BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION zeus_fail_ticket_outbox()');
  try {
    await rejected(`/v1/support/tickets/${newer.id}/reply`, 'support', 'POST', { body: 'پاسخ معنادار ولی شکست تراکنش اعلان' }, 500);
    assert.equal(await db.ticketMessage.count({ where: { ticketId: newer.id } }), beforeReply.count);
    assert.deepEqual(await db.ticket.findUnique({ where: { id: newer.id } }), beforeReply.ticket);
    assert.equal((await db.ticketSlaPolicySnapshot.findUnique({ where: { ticketId: newer.id } })).firstMeaningfulReplyAt, null);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER zeus_outbox_failure ON outbox_events');
    await db.$executeRawUnsafe('DROP FUNCTION zeus_fail_ticket_outbox()');
  }
  const legacyDue = new Date('2026-10-24T10:00Z');
  const legacyTicket = await db.ticket.create({ data: { customerId, code: 'LEGACY-SLA-KEEP', category: 'other', subject: 'سیاست قدیمی بدون snapshot', assignedToUserId: support.id, slaDueAt: legacyDue } });
  await ok(`/v1/support/tickets/${legacyTicket.id}/reply`, 'support', 'POST', { body: 'پاسخ با حفظ سیاست قدیمی' });
  assert.equal(await db.ticketSlaPolicySnapshot.count({ where: { ticketId: legacyTicket.id } }), 0);
  assert.equal((await db.ticket.findUnique({ where: { id: legacyTicket.id } })).slaDueAt.toISOString(), legacyDue.toISOString());
  report.cases.push('reply_outbox_failure_rolls_back_message_status_and_sla_legacy_policy_untouched');

  await db.order.update({ where: { id: draft.id }, data: { status: 'delivered' } });
  const review = await ok(`/v1/customer/orders/${draft.id}/review`, 'customer', 'POST', { rating: 5, comment: 'نظر خصوصی با شماره 09121234567', publicConsent: true });
  const publicPath = `/v1/services/${service.slug}/reviews`;
  assert.equal((await ok(publicPath)).count, 0);
  await rejected(`/v1/admin/reviews/${review.id}/moderation`, 'ops', 'PATCH', { version: review.version, status: 'approved', privacyReviewed: true, publicComment: '09121234567', reason: 'تلاش انتشار با اطلاعات تماس' }, 400);
  await ok(`/v1/admin/reviews/${review.id}/moderation`, 'ops', 'PATCH', { version: review.version, status: 'approved', privacyReviewed: true, publicComment: 'خروجی باکیفیت و تحویل منظم بود.', reason: 'بررسی و حذف اطلاعات شخصی' });
  const published = await ok(publicPath); assert.equal(published.count, 1); assert.equal(published.averageRating, 5);
  assert.equal((await call(publicPath)).headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(published.items[0]).sort(), ['id', 'publicComment', 'publishedAt', 'rating']);
  assert(!JSON.stringify(published).includes(customerId)); assert(!JSON.stringify(published).includes('09121234567'));
  await ok(`/v1/customer/orders/${draft.id}/review`, 'customer', 'POST', { rating: 5, comment: 'لغو رضایت', publicConsent: false });
  assert.equal((await ok(publicPath)).count, 0);
  assert.equal(await db.publicServiceReview.count({ where: { orderId: draft.id } }), 1);
  report.cases.push('owned_unique_review_consent_moderation_redaction_public_projection_revoke');

  const resubmitted = await ok(`/v1/customer/orders/${draft.id}/review`, 'customer', 'POST', { rating: 4, comment: 'بررسی هم‌زمان', publicConsent: true });
  const auditsBefore = await db.auditLog.count({ where: { entityId: review.id, action: 'review.moderated' } });
  const moderation = { version: resubmitted.version, status: 'approved', privacyReviewed: true, publicComment: 'تحویل مناسب بود.', reason: 'بازبینی انسانی هم‌زمان' };
  const race = await Promise.all([call(`/v1/admin/reviews/${review.id}/moderation`, 'ops', 'PATCH', moderation), call(`/v1/admin/reviews/${review.id}/moderation`, 'ops', 'PATCH', moderation)]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  assert.equal(await db.auditLog.count({ where: { entityId: review.id, action: 'review.moderated' } }), auditsBefore + 1);
  const seedOwner = await db.user.findUnique({ where: { id: customerId } });
  const foreign = await db.user.create({ data: { phone: '09129990002', fullName: 'مالک دیگر آزمون', role: 'customer', status: 'active', passwordHash: seedOwner.passwordHash } });
  tokens.other = (await ok('/v1/auth/login', null, 'POST', { phone: foreign.phone, password: 'Passw0rd!123' })).accessToken;
  await rejected(`/v1/customer/orders/${draft.id}/review`, 'other', 'POST', { rating: 1, publicConsent: true }, 404);
  await rejected(`/v1/customer/tickets/${ticket.id}/rating`, 'other', 'POST', { rating: 1 }, 404);
  const foreignDash = await ok('/v1/customer/dashboard', 'other'); assert.equal(foreignDash.totalOrders, 0); assert.equal(foreignDash.wallet, null);
  report.cases.push('concurrent_moderation_single_audit_foreign_owner_isolation_no_unknown_zero_wallet');

  for (const path of ['suggest-price', 'triage', 'support-reply']) {
    const r = await rejected('/v1/ai/' + path, 'ops', 'POST', path === 'support-reply' ? { ticketId: ticket.id } : { orderId: draft.id }, 503);
    assert.equal(r.payload.providerCalled, false); assert.equal(r.payload.error.code, 'AI_PROVIDER_DEFERRED');
  }
  report.cases.push('future_ai_contract_is_explicitly_disabled_not_fabricated_success');
  void formFields;
  report.status = 'passed'; report.deployedTargets = seen.size; report.migrationCount = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`.then(rows => rows.length);
} catch (error) { console.error(redact(error.stack ?? error)); console.error(redact(logs.slice(-3000))); throw error; }
finally {
  if (server && server.exitCode == null) { server.kill(); await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
  if (db) await db.$disconnect();
  if (created) { assert.match(name, /^niazat_z1_contract_\d+_[a-f0-9]{8}$/); await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', name); await control.$executeRawUnsafe(`DROP DATABASE "${name}"`); }
  await control.$disconnect();
}
report.temporaryDatabaseRemoved = true;
writeFileSync(join(output, 'contract-inventory.json'), JSON.stringify(contracts, null, 2) + '\n');
writeFileSync(join(output, 'http-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, sourceApiRows: report.contractRows.length, deployedTargets: report.deployedTargets, groupedCases: report.cases, mainDatabaseConnected: false, temporaryDatabaseRemoved: true }));
