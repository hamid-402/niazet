import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesZ3OutputApproval } from '../orbit-z3-output-approval.mjs';

if (process.argv.includes('--old-client-probe')) {
  const target = new URL(process.env.ZEUS_Z2_TEST_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(target.pathname, /^\/niazat_zeus_z2_\d+_[a-f0-9]{8}$/);
  const runtime = resolve(fileURLToPath(new URL('../../_runtime/apps/api/', import.meta.url)));
  const clientPath = resolve(process.env.ZEUS_Z2_OLD_CLIENT);
  assert(clientPath.startsWith(runtime + '\\') || clientPath.startsWith(runtime + '/'));
  const loader = createRequire(join(runtime, 'package.json'));
  const { PrismaClient: OldClient } = loader(clientPath);
  const client = new OldClient({ datasources: { db: { url: target.toString() } } });
  try {
    const before = await client.user.findUniqueOrThrow({ where: { id: process.env.ZEUS_Z2_OLD_USER } });
    assert.equal((await client.order.findUniqueOrThrow({ where: { id: process.env.ZEUS_Z2_OLD_ORDER } })).finalPrice, 123);
    await client.user.update({ where: { id: before.id }, data: { fullName: before.fullName + ' probe' } });
    await client.user.update({ where: { id: before.id }, data: { fullName: before.fullName, updatedAt: before.updatedAt } });
    assert.equal((await client.user.findUniqueOrThrow({ where: { id: before.id } })).fullName, before.fullName);
  } finally { await client.$disconnect(); }
  console.log(JSON.stringify({ previousGeneratedClientReadWriteAfterUpgrade: true }));
  process.exit(0);
}

const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api');
const req = createRequire(join(api, 'package.json'));
const { PrismaClient } = req('@prisma/client');
const { ConfigService } = req('@nestjs/config');
const load = path => req('./dist/' + path + '.js');
const { CommercialService } = load('pricing/commercial.service');
const { FixedRegistrationService } = load('pricing/fixed-registration.service');
const { CommercialClock } = load('pricing/commercial-clock');
const { CommercialReviewService } = load('finance/commercial-review.service');
const { OrderWorkflowService } = load('orders/domain/order-workflow.service');
const { IdempotencyService } = load('finance/idempotency.service');
const { LedgerService } = load('finance/ledger.service');
const { PaymentsService } = load('finance/payments.service');
const { WalletPaymentsService } = load('finance/wallet-payments.service');
const { PaymentGatewayService } = load('finance/zarinpal.gateway');
const { MockPaymentGateway } = load('finance/payment-gateway');
const sourceLine = (existsSync(join(api, '.env')) ? readFileSync(join(api, '.env'), 'utf8') : '').split(/\r?\n/).find(line => /^DATABASE_URL=/.test(line));
const source = new URL(process.env.DATABASE_URL || sourceLine?.slice(sourceLine.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2'));
assert(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname));
assert(['postgresql:', 'postgres:'].includes(source.protocol));
const name = `niazat_zeus_z2_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(name, /^niazat_zeus_z2_\d+_[a-f0-9]{8}$/);
assert.notEqual('/' + name, source.pathname);
const target = new URL(source); target.pathname = '/' + name;
const maintenance = new URL(source); maintenance.pathname = '/postgres';
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const runtime = resolve(root, '_runtime/apps/api');
const temp = mkdtempSync(join(runtime, 'z2-upgrade-'));
const registrationMode = process.argv.includes('--with-registration');
const output = join(root, registrationMode ? '.artifacts/zeus/z3-registration' : '.artifacts/zeus/z3-historical-z2'); mkdirSync(output, { recursive: true });
const report = { date: registrationMode ? '2026-10-28' : '2026-10-27', status: 'running', mainDatabaseConnected: false, liveProvidersUsed: false, cases: [] };
const redact = value => String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<database URL>');
const key = () => randomUUID();
const reject = (work, status = 409) => assert.rejects(work, e => e.getStatus?.() === status);
const digest = value => createHash('sha256').update(value).digest('hex');
const inputFiles = ['apps/api/prisma/schema.prisma', 'apps/api/prisma/migrations/20261027120000_zeus_commercial_capacity/migration.sql', 'apps/api/src/pricing/commercial.service.ts', 'apps/api/src/pricing/commercial-policy.ts', 'apps/api/src/pricing/commercial-clock.ts', 'apps/api/src/pricing/commercial.controller.ts', 'apps/api/src/pricing/commercial.dto.ts', 'apps/api/src/pricing/commercial.module.ts', 'apps/api/src/finance/commercial-review.service.ts', 'apps/api/src/finance/commercial-review.controller.ts', 'apps/api/src/finance/finance.module.ts', 'apps/api/src/finance/payments.service.ts', 'apps/api/src/finance/wallet-payments.service.ts'];
const compiledFiles = ['pricing/commercial.service.js', 'pricing/commercial-policy.js', 'pricing/commercial-clock.js', 'pricing/commercial.controller.js', 'pricing/commercial.dto.js', 'pricing/commercial.module.js', 'finance/commercial-review.service.js', 'finance/commercial-review.controller.js', 'finance/finance.module.js', 'finance/payments.service.js', 'finance/wallet-payments.service.js'].map(file => 'apps/api/dist/' + file);
if (registrationMode) {
  inputFiles.push('apps/api/src/orders/order-state-machine.ts', 'apps/api/src/orders/domain/order-workflow.service.ts', 'apps/api/src/orders/domain/fixed-registration-eligibility.ts', 'apps/api/src/orders/domain/fixed-registration-eligibility.spec.ts', 'apps/api/src/pricing/fixed-registration.service.ts', 'scripts/acceptance/zeus-z3-registration-cases.mjs');
  compiledFiles.push(...['orders/order-state-machine.js', 'orders/domain/order-workflow.service.js', 'orders/domain/fixed-registration-eligibility.js', 'pricing/fixed-registration.service.js'].map(file => 'apps/api/dist/' + file));
  report.currentAcceptance = { feature: 'Z3 fixed registration', historicalReceiptIsCurrentAcceptance: false, completePhaseAccepted: false };
}
const fileHashes = paths => Object.fromEntries(paths.map(path => [path, digest(readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n'))]));
report.sourceHashes = fileHashes(inputFiles); report.compiledHashes = fileHashes(compiledFiles);
const customerContractPath = 'apps/web/src/components/commercial-order-contract.ts';
const customerContractSource = readFileSync(join(root, customerContractPath), 'utf8');
report.customerUiContractHash = digest(customerContractSource.replaceAll('\r\n', '\n'));
const customerContractJs = req('typescript').transpileModule(customerContractSource, { compilerOptions: { target: req('typescript').ScriptTarget.ES2023, module: req('typescript').ModuleKind.ESNext } }).outputText;
const { readCommercialRevision, readCommercialState } = await import('data:text/javascript;base64,' + Buffer.from(customerContractJs).toString('base64'));
const cli = args => {
  const result = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), ...args], { cwd: api, env: { ...process.env, DATABASE_URL: target.toString(), NODE_ENV: 'test' }, encoding: 'utf8', windowsHide: true, timeout: 90000 });
  assert.equal(result.status, 0, redact(result.stdout + '\n' + result.stderr).slice(-2500));
};
let db, app, created = false;
let now = new Date('2026-10-27T09:00:00+03:30');
const clock = { now: async () => new Date(now) };
async function snapshot(client, tables) {
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    const rows = await client.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM "${table}" t ORDER BY row_to_json(t)::text`);
    result[table] = { count: rows.length, hash: digest(rows.map(r => r.value).join('\n')) };
  }
  return result;
}
try {
  const prior = execFileSync('git', ['show', '4945367:apps/api/prisma/schema.prisma'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const oldSchema = prior.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = ' + JSON.stringify(join(temp, 'client').replaceAll('\\', '/')));
  assert.notEqual(oldSchema, prior);
  writeFileSync(join(temp, 'schema.prisma'), oldSchema);
  mkdirSync(join(temp, 'migrations'));
  const migrations = join(api, 'prisma/migrations');
  cpSync(join(migrations, 'migration_lock.toml'), join(temp, 'migrations/migration_lock.toml'));
  const allNames = readdirSync(migrations).filter(n => /^\d/.test(n)).sort();
  const names = allNames.filter(n => n <= '20261027120000_zeus_commercial_capacity');
  for (const later of allNames.filter(n => !names.includes(n))) assert(matchesZ3OutputApproval(`apps/api/prisma/migrations/${later}/migration.sql`, readFileSync(join(migrations, later, 'migration.sql'))), 'Unapproved later migration in historical Z2 rehearsal');
  assert.equal(names.length, 26);
  for (const entry of names.slice(0, -1)) cpSync(join(migrations, entry), join(temp, 'migrations', entry), { recursive: true });
  const configPath = join(temp, 'prisma.config.ts');
  writeFileSync(configPath, `import { defineConfig } from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(join(temp, 'schema.prisma'))},migrations:{path:${JSON.stringify(join(temp, 'migrations'))}},datasource:{url:process.env.DATABASE_URL!}});\n`);
  const acceptedTarget = join(temp, 'accepted-z2-target'); mkdirSync(acceptedTarget); mkdirSync(join(acceptedTarget, 'migrations'));
  const acceptedSchema = execFileSync('git', ['show', '166804b:apps/api/prisma/schema.prisma'], { cwd: root, encoding: 'utf8', windowsHide: true });
  writeFileSync(join(acceptedTarget, 'schema.prisma'), acceptedSchema);
  cpSync(join(migrations, 'migration_lock.toml'), join(acceptedTarget, 'migrations/migration_lock.toml'));
  for (const entry of names) cpSync(join(migrations, entry), join(acceptedTarget, 'migrations', entry), { recursive: true });
  const acceptedConfig = join(acceptedTarget, 'prisma.config.ts');
  writeFileSync(acceptedConfig, `import {defineConfig} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(join(acceptedTarget, 'schema.prisma'))},migrations:{path:${JSON.stringify(join(acceptedTarget, 'migrations'))}},datasource:{url:process.env.DATABASE_URL!}});`);
  report.historicalTarget = { phase: 'Z2', migrationCount: 26, schemaRef: '166804b', schemaHash: digest(acceptedSchema.replaceAll('\r\n', '\n')), currentPhaseAccepted: false };
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  cli(['migrate', 'deploy', '--config', configPath]);
  cli(['generate', '--config', configPath]);
  db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, name);
  let phone = 9132000000;
  const user = (role = 'customer', adminScope = null) => db.user.create({ data: { phone: String(++phone), fullName: 'Isolated Z2 fixture', role, adminScope, status: 'active' } });
  const owner = await user(), other = await user(), ops = await user('admin', 'ops_admin'), finance = await user('admin', 'finance_admin'), support = await user('support'), executor = await user('executor'), superAdmin = await user('admin', 'super_admin');
  const service = await db.serviceLine.create({ data: { slug: 'z2-' + key(), title: 'Isolated commercial fixture', category: 'fixture', description: 'No main database connection', pricingModel: 'fixed', basePrice: 100000 } });
  const oldOrder = await db.order.create({ data: { code: 'TEST-' + key(), customerId: owner.id, serviceId: service.id, title: 'Historic quote fixture', briefDescription: 'Retain old amount and identifier', status: 'pending_payment', finalPrice: 123 } });
  const oldTables = (await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map(r => r.tablename);
  const before = await snapshot(db, oldTables);
  cli(['migrate', 'deploy', '--config', acceptedConfig]);
  const oldClientProbe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--old-client-probe'], { cwd: root, env: { ...process.env, ZEUS_Z2_TEST_URL: target.toString(), ZEUS_Z2_OLD_CLIENT: join(temp, 'client'), ZEUS_Z2_OLD_USER: owner.id, ZEUS_Z2_OLD_ORDER: oldOrder.id }, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  assert.equal(oldClientProbe.status, 0, redact(oldClientProbe.stdout + '\n' + oldClientProbe.stderr).slice(-2000));
  assert.deepEqual(await snapshot(db, oldTables), before);
  cli(['migrate', 'deploy', '--config', acceptedConfig]);
  assert.equal(await db.commercialState.count(), 0);
  assert.equal((await db.order.findUnique({ where: { id: oldOrder.id } })).finalPrice, 123);
  report.upgrade = { previousTablesPreserved: oldTables.length, oldRowsAndColumnsUnchanged: true, previousGeneratedClientReadWriteAfterUpgrade: true, migrationCount: 26, noHistoricBackfill: true };
  report.cases.push('populated_additive_upgrade_preserves_every_old_table_and_unknown_contract');

  const idempotency = new IdempotencyService(db), ledger = new LedgerService(db), workflow = new OrderWorkflowService(db);
  const commercial = new CommercialService(db, idempotency, workflow, clock);
  const registration = new FixedRegistrationService(db, idempotency, workflow, commercial);
  const config = new ConfigService({ NODE_ENV: 'test', ZEUS_WALLET_ENABLED: true, PAYMENT_GATEWAY_DRIVER: 'mock', JWT_ACCESS_SECRET: key() + key(), WEB_URL: 'http://127.0.0.1:3002' });
  const mock = new MockPaymentGateway(config), gateway = new PaymentGatewayService(config, mock);
  const wallets = new WalletPaymentsService(db, ledger, idempotency, gateway, config, workflow, commercial);
  const payments = new PaymentsService(db, ledger, gateway, idempotency, workflow, commercial);
  const reviews = new CommercialReviewService(db, ledger, idempotency, clock);
  for (const accountType of ['payment_gateway_clearing', 'platform_escrow', 'platform_commission']) await db.ledgerAccount.create({ data: { accountType } });
  const topup = await wallets.initiate(owner.id, 5_000_000, key()); await wallets.verify(owner.id, topup.id, key());
  const policy = { calendar: { version: 1, timezone: 'Asia/Tehran', workDays: [6, 0, 1, 2, 3, 4], holidays: [] }, normalMinutes: 1440, urgentMinutes: 480, sameDayEnabled: true, quoteTtlMinutes: 30, requiredSkills: ['design'], formula: null };
  const admin = { id: ops.id, role: 'admin' }, customer = { id: owner.id, role: 'customer' };
  await commercial.setPolicy(admin, service.id, { version: 1, config: policy, reason: 'Isolated approved policy' }, key());
  for (const skill of ['*', 'design']) await commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill, limit: 1, reason: 'Isolated last capacity slot' }, key());
  const order = (serviceId = service.id) => db.order.create({ data: { code: 'TEST-' + key(), customerId: owner.id, serviceId, title: 'Isolated order', briefDescription: 'Valid isolated customer requirements', status: 'triaging' } });
  const offered = async (priority = 'normal', serviceId = service.id, extra = {}) => {
    const o = await order(serviceId);
    const r = await commercial.offer(admin, o.id, { priority, reason: 'Isolated operational review', ...extra }, key());
    return { o, r };
  };
  const accept = ({ o, r }, requestKey = key()) => commercial.accept(owner.id, o.id, r.id, r.fingerprint, requestKey);
  const balance = async () => (await ledger.verifyWalletConsistency(owner.id)).walletBalance;
  await wallets.payOrder(owner.id, oldOrder.id, key());
  assert.equal(await db.commercialRevision.count({ where: { orderId: oldOrder.id } }), 0);
  report.cases.push('legacy_order_retains_original_price_and_payment_without_backfilled_contract');
  for (const [priority, amount] of [['normal', 100000], ['urgent', 130000], ['same_day', 180000]]) {
    const item = await offered(priority); assert.equal(item.r.final_price, amount);
    const accepted = await accept(item); assert(accepted.deadlineAt); assert(accepted.payableUntil);
    assert.equal(new Date(accepted.deadlineAt).toISOString(), item.r.proposedDeadlineAt);
    await wallets.payOrder(owner.id, item.o.id, key());
    assert.equal((await db.order.findUnique({ where: { id: item.o.id } })).status, 'paid');
    assert.equal((await db.invoice.findUnique({ where: { orderId: item.o.id } })).amount, amount);
  }
  assert.equal(await db.capacityReservation.count({ where: { status: 'committed' } }), 1);
  report.cases.push('all_three_rates_bound_customer_acceptance_wallet_escrow_invoice_and_deadline');

  for (const skill of ['*', 'design']) await commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill, limit: 2, reason: 'One additional isolated slot' }, key());
  const a = await offered('same_day'), b = await offered('same_day');
  const race = await Promise.allSettled([accept(a), accept(b)]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.capacityReservation.count({ where: { status: 'held' } }), 1);
  const winner = race[0].status === 'fulfilled' ? a : b;
  const expires = (await db.capacityReservation.findUnique({ where: { revisionId: winner.r.id } })).expiresAt;
  await accept(winner); assert.equal((await db.capacityReservation.findUnique({ where: { revisionId: winner.r.id } })).expiresAt.getTime(), expires.getTime());
  await commercial.release(customer, winner.o.id, 'Customer explicitly releases unpaid slot', key());
  await reject(() => commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill: '*', limit: 0, reason: 'Cannot erase existing commitment' }, key()));
  report.cases.push('last_slot_race_atomic_day_and_skill_capacity_retry_without_ttl_extension');

  for (const skill of ['*', 'design']) await commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill, limit: 4, reason: 'Isolated rollback test capacity' }, key());
  const rollback = await offered('same_day'); await accept(rollback);
  const walletBeforeRollback = await balance(), ledgerBeforeRollback = await db.ledgerEntry.count();
  const brokenLedger = Object.create(ledger); brokenLedger.postEntry = async () => { throw new Error('INTENTIONAL_TEST_ROLLBACK'); };
  const rollbackWallet = new WalletPaymentsService(db, brokenLedger, idempotency, gateway, config, workflow, commercial);
  await assert.rejects(() => rollbackWallet.payOrder(owner.id, rollback.o.id, key()), /INTENTIONAL_TEST_ROLLBACK/);
  assert.equal(await balance(), walletBeforeRollback); assert.equal(await db.ledgerEntry.count(), ledgerBeforeRollback);
  assert.equal(await db.payment.count({ where: { orderId: rollback.o.id } }), 0);
  assert.equal((await db.capacityReservation.findUnique({ where: { revisionId: rollback.r.id } })).status, 'held');
  await wallets.payOrder(owner.id, rollback.o.id, key());
  await commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill: 'design', limit: 2, reason: 'Exhausted skill while global pool has room' }, key());
  const noSkill = await offered('same_day'), allocationBefore = await db.capacityAllocation.count();
  await reject(() => accept(noSkill)); assert.equal(await db.capacityAllocation.count(), allocationBefore);
  assert.equal(await db.capacityReservation.count({ where: { revisionId: noSkill.r.id } }), 0);
  await commercial.setBucket(admin, { serviceId: service.id, day: '2026-10-27', skill: 'design', limit: 4, reason: 'Restore isolated capacity' }, key());
  report.cases.push('financial_abort_rolls_back_payment_reservation_ledger_and_wallet_skill_shortage_is_atomic');

  const expiredHold = await offered('same_day'); await accept(expiredHold);
  now = new Date('2026-10-27T09:15:00+03:30');
  await reject(() => accept(expiredHold));
  assert.equal((await commercial.current(owner.id, expiredHold.o.id)).reservation.status, 'expired');
  assert.equal((await commercial.current(owner.id, expiredHold.o.id)).paymentAllowed, false);
  await commercial.release(customer, expiredHold.o.id, 'Release an already expired reservation', key());
  const invalidatedAt = (await db.commercialRevision.findUnique({ where: { id: expiredHold.r.id } })).invalidatedAt;
  const requote = await commercial.offer(admin, expiredHold.o.id, { priority: 'normal', reason: 'Explicitly replace released offer' }, key());
  assert.equal(requote.sequence, 2);
  assert.deepEqual((await db.commercialRevision.findUnique({ where: { id: expiredHold.r.id } })).invalidatedAt, invalidatedAt);
  now = new Date('2026-10-27T09:00:00+03:30');
  report.cases.push('expired_hold_does_not_extend_retry_or_resurrect_when_requoted');

  const stale = await offered();
  await db.serviceLine.update({ where: { id: service.id }, data: { basePrice: 100001 } });
  await reject(() => accept(stale));
  const newer = await commercial.offer(admin, stale.o.id, { priority: 'urgent', reason: 'Explicit new quote revision' }, key());
  await reject(() => accept(stale));
  const next = { o: stale.o, r: newer }; await accept(next);
  await db.serviceLine.update({ where: { id: service.id }, data: { basePrice: 100000 } });
  await wallets.payOrder(owner.id, next.o.id, key());
  assert.equal((await db.invoice.findUnique({ where: { orderId: next.o.id } })).amount, 130001);
  await reject(() => commercial.setPolicy(admin, service.id, { version: 1, config: policy, reason: 'Same policy version rejected' }, key()));
  report.cases.push('stale_catalog_and_revision_rejected_accepted_price_immutable_after_tariff_change');

  const formulaService = await db.serviceLine.create({ data: { slug: 'formula-' + key(), title: 'Formula fixture', category: 'fixture', description: 'Bounded formula', pricingModel: 'formula', basePrice: 999999 } });
  await commercial.setPolicy(admin, formulaService.id, { version: 1, config: { ...policy, formula: { type: 'linear-v1', version: 1, currency: 'IRT', basePrice: 100, maxBasePrice: 1000000, terms: [{ key: 'pages', unitPrice: 101, min: 1, max: 100 }] } }, reason: 'Approved bounded formula' }, key());
  const formula = await offered('urgent', formulaService.id, { inputs: { pages: 2 } }); assert.equal(formula.r.final_price, 392); await accept(formula); await wallets.payOrder(owner.id, formula.o.id, key());
  const invalidFormulaOrder = await order(formulaService.id);
  await reject(() => commercial.offer(admin, invalidFormulaOrder.id, { priority: 'normal', inputs: { pages: 0 }, reason: 'Invalid formula input' }, key()), 400);
  const manualService = await db.serviceLine.create({ data: { slug: 'manual-' + key(), title: 'Manual fixture', category: 'fixture', description: 'No invented negotiated amount', pricingModel: 'manual_quote', basePrice: 999999 } });
  await commercial.setPolicy(admin, manualService.id, { version: 1, config: policy, reason: 'Manual quote policy' }, key());
  const manualOrder = await order(manualService.id);
  await reject(() => commercial.offer(customer, manualOrder.id, { priority: 'normal' }, key()));
  const manualOffer = await commercial.offer(admin, manualOrder.id, { priority: 'normal', quotedBasePrice: 777, reason: 'Human reviewed base quote' }, key());
  await commercial.accept(owner.id, manualOrder.id, manualOffer.id, manualOffer.fingerprint, key()); await wallets.payOrder(owner.id, manualOrder.id, key());
  report.cases.push('formula_and_negotiated_prices_use_real_distinct_behaviour_no_numeric_placeholder');

  const gatewayOrder = await offered('normal'); await accept(gatewayOrder);
  const intent = await payments.initiatePayment({ orderId: gatewayOrder.o.id, customerId: owner.id, amount: gatewayOrder.r.final_price, idempotencyKey: key() });
  const settleParams = { paymentId: intent.payment.id, orderId: gatewayOrder.o.id, customerId: owner.id, idempotencyKey: key() };
  await payments.verifyAndSettlePayment(settleParams); await payments.verifyAndSettlePayment(settleParams);
  assert.equal(await db.escrowHold.count({ where: { paymentId: intent.payment.id } }), 1);
  report.cases.push('gateway_mock_proof_and_escrow_exactly_once');

  now = new Date('2026-10-27T13:59:00+03:30');
  const late = await offered('same_day'); const agreed = await accept(late);
  assert.equal(new Date(agreed.payableUntil).toISOString(), '2026-10-27T10:30:00.000Z');
  const lateIntent = await payments.initiatePayment({ orderId: late.o.id, customerId: owner.id, amount: late.r.final_price, idempotencyKey: key() });
  now = new Date('2026-10-27T14:00:00+03:30');
  const lateParams = { paymentId: lateIntent.payment.id, orderId: late.o.id, customerId: owner.id, idempotencyKey: key() };
  const lateResult = await payments.verifyAndSettlePayment(lateParams); assert.equal(lateResult.requiresFinancialReview, true);
  assert(lateResult.payment.verifiedAt); assert.equal(lateResult.payment.failureReason, 'commercial_verified_payment_requires_review');
  await payments.verifyAndSettlePayment({ ...lateParams, idempotencyKey: key() });
  assert.equal(await db.ledgerEntry.count({ where: { idempotencyKey: `commercial-late:${lateIntent.payment.id}` } }), 1);
  assert.equal(await db.escrowHold.count({ where: { paymentId: lateIntent.payment.id } }), 0);
  assert.equal((await db.order.findUnique({ where: { id: late.o.id } })).status, 'pending_payment');
  await reject(() => reviews.refundToWallet(finance.id, lateIntent.payment.id, 'Explicit financial command', key()));
  await reject(() => commercial.requestRefund(other.id, late.o.id, lateIntent.payment.id, 'Foreign customer denied', key()), 404);
  const beforeRefund = await balance();
  await commercial.requestRefund(owner.id, late.o.id, lateIntent.payment.id, 'Please refund to my wallet', key());
  const refundKey = key(); await reviews.refundToWallet(finance.id, lateIntent.payment.id, 'Approved customer request', refundKey); await reviews.refundToWallet(finance.id, lateIntent.payment.id, 'Approved customer request', refundKey);
  assert.equal(await balance(), beforeRefund + late.r.final_price);
  assert.equal((await ledger.verifyWalletConsistency(owner.id)).consistent, true);
  assert.equal(await db.ledgerAccount.count({ where: { accountType: 'payment_pending_review' } }), 1);
  report.cases.push('exact_cutoff_late_verified_money_balanced_review_no_commitment_explicit_customer_consent_and_finance_refund');

  now = new Date('2026-10-30T10:00:00+03:30'); await reject(() => offered('same_day'));
  now = new Date('2026-10-27T09:00:00+03:30');
  const expiring = await offered('normal'); await accept(expiring);
  now = new Date('2026-10-27T09:31:00+03:30');
  const beforeExpiredWallet = await balance(); await reject(() => wallets.payOrder(owner.id, expiring.o.id, key())); assert.equal(await balance(), beforeExpiredWallet);
  report.cases.push('holiday_and_expired_wallet_payment_fail_without_money_change');

  now = new Date('2026-10-27T10:00:00+03:30');
  const raceService = await db.serviceLine.create({ data: { slug: 'race-' + key(), title: 'Cutoff race fixture', category: 'fixture', description: 'Isolated capacity race', pricingModel: 'fixed', basePrice: 1000 } });
  await commercial.setPolicy(admin, raceService.id, { version: 1, config: policy, reason: 'Isolated race policy' }, key());
  for (const skill of ['*', 'design']) await commercial.setBucket(admin, { serviceId: raceService.id, day: '2026-10-27', skill, limit: 1, reason: 'One atomic race slot' }, key());
  const oldHolder = await offered('same_day', raceService.id); await accept(oldHolder);
  const oldIntent = await payments.initiatePayment({ orderId: oldHolder.o.id, customerId: owner.id, amount: oldHolder.r.final_price, idempotencyKey: key() });
  now = new Date('2026-10-27T10:14:59+03:30');
  const newHolder = await offered('same_day', raceService.id);
  let continueVerification, verificationReached;
  const verificationBarrier = new Promise(resolve => { continueVerification = resolve; });
  const reached = new Promise(resolve => { verificationReached = resolve; });
  const originalVerify = mock.verifyPayment.bind(mock);
  let intercepted = false;
  mock.verifyPayment = async input => {
    if (input.gatewayRef === oldIntent.payment.gatewayRef && !intercepted) { intercepted = true; verificationReached(); await verificationBarrier; }
    return originalVerify(input);
  };
  let verificationResult;
  try {
    const pendingVerification = payments.verifyAndSettlePayment({ paymentId: oldIntent.payment.id, orderId: oldHolder.o.id, customerId: owner.id, idempotencyKey: key() }).then(value => ({ value }), error => ({ error }));
    let timer;
    try { await Promise.race([reached, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Provider barrier not reached')), 5000); })]); } finally { clearTimeout(timer); }
    now = new Date('2026-10-27T10:15:01+03:30');
    await accept(newHolder);
    continueVerification(); verificationResult = await pendingVerification;
    assert.equal(verificationResult.error, undefined, verificationResult.error?.message);
    assert.equal(verificationResult.value.requiresFinancialReview, true);
  } finally { continueVerification(); mock.verifyPayment = originalVerify; }
  assert.equal(await db.escrowHold.count({ where: { paymentId: oldIntent.payment.id } }), 0);
  assert.equal((await db.capacityReservation.findUnique({ where: { revisionId: newHolder.r.id } })).status, 'held');
  await wallets.payOrder(owner.id, newHolder.o.id, key());
  assert.equal(await db.capacityAllocation.count({ where: { bucket: { serviceId: raceService.id, skill: '*' }, reservation: { status: 'committed' } } }), 1);
  await commercial.requestRefund(owner.id, oldHolder.o.id, oldIntent.payment.id, 'Refund late race payment to wallet', key());
  await reviews.refundToWallet(finance.id, oldIntent.payment.id, 'Explicit approved late payment request', key());
  report.cases.push('provider_verification_crossing_expiry_after_slot_reallocation_never_oversells');

  const timeoutOrder = await offered(); await accept(timeoutOrder);
  const timeoutIntent = await payments.initiatePayment({ orderId: timeoutOrder.o.id, customerId: owner.id, amount: timeoutOrder.r.final_price, idempotencyKey: key() });
  const journalBeforeTimeout = await db.ledgerEntry.count();
  mock.verifyPayment = async () => { throw new Error('SIMULATED_PROVIDER_TIMEOUT'); };
  try { await assert.rejects(() => payments.verifyAndSettlePayment({ paymentId: timeoutIntent.payment.id, orderId: timeoutOrder.o.id, customerId: owner.id, idempotencyKey: key() }), /SIMULATED_PROVIDER_TIMEOUT/); } finally { mock.verifyPayment = originalVerify; }
  assert.equal(await db.ledgerEntry.count(), journalBeforeTimeout);
  assert.equal((await db.payment.findUnique({ where: { id: timeoutIntent.payment.id } })).status, 'verifying');
  assert.equal((await db.commercialPaymentLink.findUnique({ where: { paymentId: timeoutIntent.payment.id } })).financialReviewAt, null);
  await payments.verifyAndSettlePayment({ paymentId: timeoutIntent.payment.id, orderId: timeoutOrder.o.id, customerId: owner.id, idempotencyKey: key() });
  report.cases.push('provider_timeout_is_unknown_not_failed_and_retry_preserves_exactly_once_settlement');

  const cancelled = await offered('same_day'); await accept(cancelled);
  const cancelIntent = await payments.initiatePayment({ orderId: cancelled.o.id, customerId: owner.id, amount: cancelled.r.final_price, idempotencyKey: key() });
  await workflow.transition(cancelled.o.id, 'cancelled', 'customer', owner.id, 'Explicit cancellation before verified payment');
  const cancelResult = await payments.verifyAndSettlePayment({ paymentId: cancelIntent.payment.id, orderId: cancelled.o.id, customerId: owner.id, idempotencyKey: key() });
  assert.equal(cancelResult.requiresFinancialReview, true);
  assert.equal((await db.order.findUnique({ where: { id: cancelled.o.id } })).status, 'cancelled');
  assert.equal((await db.capacityReservation.findUnique({ where: { revisionId: cancelled.r.id } })).status, 'released');
  await commercial.requestRefund(owner.id, cancelled.o.id, cancelIntent.payment.id, 'Please refund cancelled payment', key());
  await reviews.refundToWallet(finance.id, cancelIntent.payment.id, 'Explicit cancelled payment refund', key());
  report.cases.push('cancellation_racing_verified_payment_does_not_reopen_order_or_auto_refund');

  const immutablePolicy = await db.commercialPolicy.findFirst({ where: { serviceId: service.id } });
  await assert.rejects(() => db.commercialPolicy.update({ where: { id: immutablePolicy.id }, data: { version: 99 } }));
  await assert.rejects(() => db.commercialRevision.update({ where: { id: formula.r.id }, data: { finalPrice: 1 } }));
  report.cases.push('database_enforces_immutable_policy_and_price_snapshots');
  const committedReservation = await db.capacityReservation.findFirst({ where: { status: 'committed' } });
  await assert.rejects(() => db.capacityReservation.update({ where: { id: committedReservation.id }, data: { expiresAt: new Date(committedReservation.expiresAt.getTime() + 60000) } }));
  const foreignState = await order();
  await assert.rejects(() => db.commercialState.create({ data: { orderId: foreignState.id, revisionId: stale.r.id } }), e => e.code === 'P2003');
  await assert.rejects(() => db.commercialRevision.update({ where: { id: expiredHold.r.id }, data: { invalidatedAt: null } }));
  report.cases.push('database_blocks_reservation_extension_cross_order_pointer_and_reactivation_of_invalidated_revision');
  const promised = await offered('normal');
  assert(promised.r.proposedDeadlineAt); assert(promised.r.deadlineNormal);
  now = new Date(now.getTime() + 60000);
  const acceptedPromise = await accept(promised);
  assert.equal(new Date(acceptedPromise.deadlineAt).toISOString(), promised.r.proposedDeadlineAt);
  await reject(() => commercial.accept(owner.id, promised.o.id, promised.r.id, '0'.repeat(64), key()));
  report.cases.push('exact_deadline_is_visible_before_acceptance_and_fingerprint_bound_not_shifted_on_accept');

  const { Test } = req('@nestjs/testing'), { Reflector } = req('@nestjs/core'), { ValidationPipe } = req('@nestjs/common'), { JwtService } = req('@nestjs/jwt');
  const { AuthSessionService } = load('auth/auth-session.service'), { AuthTokenService } = load('auth/auth-token.service'), { JwtStrategy } = load('auth/strategies/jwt.strategy'), { JwtAuthGuard } = load('common/guards/jwt-auth.guard');
  const { RolesGuard } = load('common/guards/roles.guard'), { AdminScopeGuard } = load('common/guards/admin-scope.guard');
  const { RateLimitGuard } = load('common/guards/rate-limit.guard');
  const { CustomerCommercialController, CommercialAdminController } = load('pricing/commercial.controller'), { CommercialReviewController } = load('finance/commercial-review.controller');
  const { WalletPaymentsController } = load('finance/wallet-payments.controller');
  const sessions = new AuthSessionService(db, new AuthTokenService(new JwtService(), config));
  const mod = await Test.createTestingModule({ controllers: [CustomerCommercialController, CommercialAdminController, CommercialReviewController, WalletPaymentsController], providers: [RolesGuard, AdminScopeGuard, { provide: WalletPaymentsService, useValue: wallets }, { provide: CommercialService, useValue: commercial }, { provide: FixedRegistrationService, useValue: registration }, { provide: CommercialReviewService, useValue: reviews }, { provide: JwtStrategy, useValue: new JwtStrategy(config, sessions) }, { provide: AuthSessionService, useValue: sessions }] }).compile();
  app = mod.createNestApplication({ logger: false }); app.useGlobalGuards(new JwtAuthGuard(new Reflector()), new RateLimitGuard(new Reflector())); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.listen(0, '127.0.0.1');
  const tokens = new Map(); for (const actor of [owner, other, ops, finance, support, executor, superAdmin]) tokens.set(actor.id, (await sessions.issue(actor)).accessToken);
  const http = async (method, path, actor, body, expected, requestKey = key()) => {
    const response = await fetch(await app.getUrl() + path, { method, headers: { ...(actor ? { Authorization: `Bearer ${tokens.get(actor.id)}` } : {}), 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
  };
  const endpoint = `/v1/customer/orders/${formula.o.id}/commercial`;
  await http('GET', endpoint, null, null, 401); await http('GET', endpoint, other, null, 404);
  for (const denied of [ops, finance, support, executor]) await http('GET', endpoint, denied, null, 403);
  assert.equal((await http('GET', endpoint, owner, null, 200)).final_price, 392);
  assert.equal(readCommercialState(await http('GET', endpoint, owner, null, 200)).final_price, 392);
  await http('PUT', `/v1/admin/commercial/services/${service.id}/policy`, finance, { version: 2, config: policy, reason: 'Finance cannot alter rates' }, 403);
  await http('GET', '/v1/admin/commercial/financial-review', ops, null, 403); await http('GET', '/v1/admin/commercial/financial-review', finance, null, 200); await http('GET', '/v1/admin/commercial/financial-review', superAdmin, null, 200);
  const forged = await order();
  await http('POST', `/v1/customer/orders/${forged.id}/commercial/offers`, owner, { priority: 'normal', final_price: 1 }, 400);
  await http('POST', `/v1/customer/orders/${forged.id}/commercial/offers`, owner, { priority: 'normal', now: '2026-10-27T01:00:00Z' }, 400);
  const roundTrip = await http('POST', `/v1/customer/orders/${forged.id}/commercial/offers`, owner, { priority: 'normal' }, 201);
  assert.equal(readCommercialRevision(roundTrip).fingerprint, roundTrip.fingerprint);
  await http('POST', `/v1/customer/orders/${forged.id}/commercial/offers/${roundTrip.id}/accept`, owner, { fingerprint: roundTrip.fingerprint }, 201);
  assert.equal(readCommercialState(await http('GET', `/v1/customer/orders/${forged.id}/commercial`, owner, null, 200)).paymentAllowed, true);
  report.customerUiContractAcceptedAgainstRealHttp = true;
  const getPolicy = await http('GET', `/v1/admin/commercial/services/${service.id}/policy`, ops, null, 200);
  assert.equal(getPolicy.version, 1);
  await http('PUT', `/v1/admin/commercial/services/${service.id}/policy`, ops, { version: 2, config: policy, reason: 'Explicit HTTP policy revision' }, 200);
  const httpPayment = await http('POST', `/v1/customer/orders/${forged.id}/pay-from-wallet`, owner, {}, 201);
  assert.equal(httpPayment.fullyPaid, true);
  const httpLate = await offered(); await accept(httpLate);
  const httpLateIntent = await payments.initiatePayment({ orderId: httpLate.o.id, customerId: owner.id, amount: httpLate.r.final_price, idempotencyKey: key() });
  now = new Date(now.getTime() + 31 * 60000);
  const httpLateResult = await payments.verifyAndSettlePayment({ paymentId: httpLateIntent.payment.id, orderId: httpLate.o.id, customerId: owner.id, idempotencyKey: key() });
  assert.equal(httpLateResult.requiresFinancialReview, true);
  await http('POST', `/v1/customer/orders/${httpLate.o.id}/commercial/payments/${httpLateIntent.payment.id}/refund-request`, owner, { reason: 'Explicit customer HTTP refund request' }, 201);
  await http('POST', `/v1/admin/commercial/financial-review/${httpLateIntent.payment.id}/refund-to-wallet`, ops, { reason: 'Ops cannot move money' }, 403);
  const walletBeforeHttpRefund = await balance();
  await http('POST', `/v1/admin/commercial/financial-review/${httpLateIntent.payment.id}/refund-to-wallet`, finance, { reason: 'Finance approves actual customer HTTP request' }, 201);
  assert.equal(await balance(), walletBeforeHttpRefund + httpLate.r.final_price);
  await http('PUT', '/v1/admin/commercial/capacity', ops, { serviceId: service.id, day: '2026-10-27', skill: '*', limit: -1, reason: 'Invalid negative capacity' }, 400);
  await http('POST', `/v1/customer/orders/${forged.id}/commercial/release`, owner, { reason: '   ' }, 400);
  assert.equal((await http('GET', `/v1/customer/orders/${forged.id}/commercial`, owner, null, 200)).fingerprint, roundTrip.fingerprint);
  report.cases.push('http_real_db_sessions_jwt_roles_scopes_ownership_dto_tampering_and_customer_acceptance');
  if (registrationMode) {
    const { verifyFixedRegistration } = await import('./zeus-z3-registration-cases.mjs');
    report.registration = await verifyFixedRegistration({ db, http, actors: { owner, other, ops, finance, support, executor }, service, policy, commercial, registration, wallets, ledger, snapshotServiceForm: load('orders/service-form').snapshotServiceForm });
  }
  const entryCountBeforeRateLimit = await db.ledgerEntry.count(); let rateLimited = false;
  for (let attempt = 0; attempt < 61; attempt++) {
    const response = await fetch(await app.getUrl() + endpoint, { headers: { Authorization: `Bearer ${tokens.get(owner.id)}` } });
    if (response.status === 429) { assert(Number(response.headers.get('retry-after')) > 0); rateLimited = true; break; }
    assert.equal(response.status, 200);
  }
  assert.equal(rateLimited, true); assert.equal(await db.ledgerEntry.count(), entryCountBeforeRateLimit);
  report.cases.push('new_commercial_http_routes_are_rate_limited_without_financial_side_effects');
  const nativeNow = await new CommercialClock().now(db); assert(Math.abs(nativeNow.getTime() - Date.now()) < 10000);
  assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
  const entries = await db.ledgerEntry.findMany(); assert(entries.every(e => e.amount > 0 && e.debitAccountId !== e.creditAccountId));
  report.cases.push('server_database_clock_and_final_balanced_ledger_projection');
  report.status = 'passed';
  assert.deepEqual(fileHashes(inputFiles), report.sourceHashes, 'Source changed while acceptance was running');
  assert.deepEqual(fileHashes(compiledFiles), report.compiledHashes, 'Compiled code changed while acceptance was running');
  assert.equal(digest(readFileSync(join(root, customerContractPath), 'utf8').replaceAll('\r\n', '\n')), report.customerUiContractHash);
} catch (error) {
  report.status = 'failed'; report.error = redact(error.stack || error.message); process.exitCode = 1;
} finally {
  if (app) await app.close(); if (db) await db.$disconnect();
  if (created) { await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', name); await control.$executeRawUnsafe(`DROP DATABASE "${name}"`); }
  await control.$disconnect();
  const resolved = resolve(temp); assert(resolved.startsWith(runtime + '\\') || resolved.startsWith(runtime + '/')); assert(/^z2-upgrade-[a-zA-Z0-9]+$/.test(resolved.split(/[\\/]/).at(-1)));
  rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  report.temporaryDatabaseRemoved = true; report.generatedMigrationFixtureRemoved = true;
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
