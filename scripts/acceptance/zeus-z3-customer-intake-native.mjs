import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Actual registered modules, guards and transactions. Fixtures only exist in
// the upgrade runner's random DB; no JWTs or authorization decisions are forged.
export async function verifyCustomerIntakeNative({ db, root }) {
  assert.match((await db.$queryRaw`SELECT current_database() AS name`)[0].name, /^niazat_z3_identity_\d+_[a-f0-9]{8}$/);
  const req = createRequire(join(root, 'apps/api/package.json')), load = p => req('./dist/' + p + '.js');
  const { Test } = req('@nestjs/testing'), { ConfigService } = req('@nestjs/config'), { ValidationPipe } = req('@nestjs/common'), bcrypt = req('bcrypt');
  const { AppModule } = load('app.module'), { PrismaService } = load('prisma/prisma.service'), { AuthSessionService } = load('auth/auth-session.service');
  const { CustomerOnboardingService } = load('account/customer-onboarding.service');
  const config = new ConfigService({ NODE_ENV: 'test', DATABASE_URL: 'unused-override-provider', ZEUS_VERIFIED_EMAIL_ENABLED: true, ZEUS_CUSTOMER_INTAKE_ENABLED: true, BACKGROUND_JOBS_ENABLED: false, JWT_ACCESS_SECRET: randomUUID() + randomUUID(), DOWNLOAD_TOKEN_SECRET: randomUUID() + randomUUID(), JWT_ACCESS_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30, PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local', LIVE_PROVIDERS_ENABLED: 'false', FILE_STORAGE_ROOT: join(root, '.artifacts/zeus/z3-customer-intake-native/storage'), WEB_URL: 'http://localhost:3002', APP_URL: 'http://localhost:3001' });
  const cases = [], password = 'Passw0rd!123', passwordHash = await bcrypt.hash(password, 12);
  let app, origin;
  const account = (phone, role = 'customer', adminScope) => db.user.create({ data: { phone, fullName: 'Isolated intake fixture', role, status: 'active', passwordHash, ...(adminScope ? { adminScope } : {}) } });
  async function http(method, path, token, body, expected = 200, key) {
    const response = await fetch(origin + '/v1' + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(), allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(value.message ?? 'unexpected response')}`);
    return { status: response.status, body: value };
  }
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const tableSnapshot = async names => Object.fromEntries(await Promise.all(names.map(async name => { assert.match(name, /^[a-z_]+$/); const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${name}" t ORDER BY row_to_json(t)::text`); return [name, digest(rows)]; })));
  try {
    const owner = await account('09199222001'), other = await account('09199222002'), executor = await account('09199222003', 'executor'), unassigned = await account('09199222004', 'executor'), support = await account('09199222005', 'support'), ops = await account('09199222006', 'admin', 'ops_admin'), finance = await account('09199222007', 'admin', 'finance_admin');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).overrideProvider(ConfigService).useValue(config).compile();
    app = module.createNestApplication({ logger: false }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
    const sessions = app.get(AuthSessionService), onboarding = app.get(CustomerOnboardingService), tokens = {};
    tokens.owner = (await http('POST', '/auth/login', null, { phone: owner.phone, password })).body.accessToken;
    for (const [name, actor] of Object.entries({ other, executor, unassigned, support, ops, finance })) tokens[name] = (await sessions.issue(actor)).accessToken;
    const financialTables = ['wallets', 'wallet_transactions', 'payments', 'escrow_holds', 'refunds', 'ledger_accounts', 'ledger_entries', 'withdrawals'];
    const actualTables = new Set((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).map(row => row.tablename));
    for (const table of financialTables) assert(actualTables.has(table), `Financial table missing: ${table}`);
    const financialBefore = await tableSnapshot(financialTables), rolesBefore = await tableSnapshot(['user_capabilities', 'executor_profiles']);
    const roleBefore = await db.user.findMany({ where: { id: { in: [owner.id, other.id] } }, select: { id: true, role: true, adminScope: true }, orderBy: { id: 'asc' } });
    const endpoint = '/customer/account/onboarding';
    await http('GET', endpoint, null, undefined, 401);
    for (const actor of ['executor', 'support', 'ops', 'finance']) await http('GET', endpoint, tokens[actor], undefined, 403);
    const pending = (await http('GET', endpoint, tokens.owner)).body; assert.equal(pending.state, 'pending'); assert.equal(pending.revision, 0); assert.equal(await db.customerOnboardingState.count({ where: { userId: owner.id } }), 0);
    config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', false); assert.equal((await http('GET', endpoint, tokens.owner)).body.enabled, false);
    await http('PUT', endpoint, tokens.owner, { schemaVersion: 1, expectedRevision: 0, skipped: true }, 503); config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', true);
    cases.push('onboarding_is_optional_owner_scoped_read_only_until_saved_and_explicitly_disabled_without_new_table_reads');
    const choice = { schemaVersion: 1, expectedRevision: 0, skipped: false, purpose: 'interested_in_collaboration' };
    await http('PUT', endpoint, tokens.owner, { ...choice, userId: other.id }, 400);
    await http('PUT', endpoint, tokens.owner, { ...choice, role: 'executor' }, 400);
    await http('PUT', endpoint, tokens.owner, { ...choice, skipped: true }, 400);
    const saved = (await http('PUT', endpoint, tokens.owner, choice)).body; assert.equal(saved.revision, 1); assert.equal(saved.purpose, choice.purpose);
    assert.deepEqual((await http('PUT', endpoint, tokens.owner, choice)).body, saved);
    assert.equal(await db.auditLog.count({ where: { actorUserId: owner.id, action: 'customer.onboarding_recorded' } }), 1);
    assert.equal((await http('GET', endpoint, tokens.other)).body.state, 'pending');
    await http('PUT', endpoint, tokens.owner, { schemaVersion: 1, expectedRevision: 0, skipped: true }, 409);
    const skipped = (await http('PUT', endpoint, tokens.owner, { schemaVersion: 1, expectedRevision: 1, skipped: true })).body; assert.equal(skipped.state, 'skipped'); assert.equal(skipped.purpose, null);
    assert.equal((await http('GET', '/customer/orders', tokens.owner)).status, 200);
    const race = await Promise.allSettled(['explore', 'track_orders'].map(purpose => onboarding.save(other.id, { schemaVersion: 1, expectedRevision: 0, skipped: false, purpose })));
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); assert.equal(race.filter(r => r.status === 'rejected' && r.reason.getStatus?.() === 409).length, 1);
    cases.push('collaboration_interest_grants_nothing_skip_and_replay_are_idempotent_and_concurrent_distinct_choices_use_cas');
    const service = await db.serviceLine.create({ data: { slug: 'intake-' + randomUUID(), title: 'Isolated fixed service', category: 'test', description: 'Isolated only', pricingModel: 'fixed', basePrice: 100, slaHours: 24 } });
    const intake = { version: 1, goal: 'هدف اصلی', brandGuidelines: 'لاجورد و عسل', referenceUrls: ['https://example.test/reference'], constraints: 'بدون داده شخصی در خروجی', confidentialityRequested: 'normal', stagedDeliveryRequested: false, financialNote: 'توضیح خصوصی مالی', addonRequests: [] };
    const create = async (extra = {}, selected = service) => (await http('POST', '/customer/orders', tokens.owner, { serviceId: selected.id, title: 'Native intake request', briefDescription: 'Complete isolated customer requirements', ...extra }, 201, randomUUID())).body;
    const read = async order => (await http('GET', '/customer/orders/' + order.id, tokens.owner)).body;
    const draft = await create({ intake }); assert.deepEqual(draft.intake.data, intake); assert.equal(draft.intake.orderVersion, draft.version);
    assert.deepEqual((await read(draft)).intake.data, intake);
    const legacy = await create(); assert.equal((await read(legacy)).intake, null); assert.equal(await db.orderIntake.count({ where: { orderId: legacy.id } }), 0);
    await http('PATCH', `/customer/orders/${legacy.id}/draft`, tokens.owner, { version: legacy.version, title: 'Legacy remains without speculative intake' }); assert.equal(await db.orderIntake.count({ where: { orderId: legacy.id } }), 0);
    const beforeInvalid = await tableSnapshot(['orders', 'order_intakes', 'order_acceptance_criteria']);
    await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.other, { version: draft.version, intake }, 404);
    await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: 999, intake }, 409);
    for (const bad of [{ version: 2 }, { version: 1, price: 1 }, { version: 1, referenceUrls: ['http://example.test'] }, { version: 1, stagedDeliveryRequested: 'true' }]) await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: draft.version, intake: bad }, 400);
    assert.deepEqual(await tableSnapshot(['orders', 'order_intakes', 'order_acceptance_criteria']), beforeInvalid);
    const changed = { ...intake, goal: 'هدف اصلاح‌شده' };
    const patched = (await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: draft.version, intake: changed })).body;
    const auto = (await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: patched.version, title: 'Autosave retains every intake field' })).body; assert.deepEqual(auto.intake.data, changed); assert.equal(auto.intake.orderVersion, auto.version);
    const cleared = (await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: auto.version, intake: null })).body; assert.equal(cleared.intake, null);
    const restored = (await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: cleared.version, intake: changed })).body;
    cases.push('versioned_intake_roundtrips_all_fields_autosave_clear_and_restore_while_foreign_stale_and_invalid_writes_roll_back');
    const dynamic = await db.serviceLine.create({ data: { slug: 'intake-form-' + randomUUID(), title: 'Isolated dynamic service', category: 'test', description: 'Isolated only', pricingModel: 'manual_quote', formFields: { create: [{ fieldKey: 'project_goal', fieldType: 'textarea', label: 'هدف', required: true }, { fieldKey: 'reference_urls', fieldType: 'url', label: 'نمونه', required: false }] } } });
    const mapped = await create({ intake: { version: 1, constraints: 'ثابت' }, formResponses: { project_goal: 'هدف تخصصی', reference_urls: 'https://example.test/one' } }, dynamic); assert.equal(mapped.intake.data.goal, 'هدف تخصصی');
    const mappedBefore = await tableSnapshot(['orders', 'order_intakes']);
    await http('PATCH', `/customer/orders/${mapped.id}/draft`, tokens.owner, { version: mapped.version, intake: { version: 1, goal: 'متناقض' } }, 400); assert.deepEqual(await tableSnapshot(['orders', 'order_intakes']), mappedBefore);
    const synced = (await http('PATCH', `/customer/orders/${mapped.id}/draft`, tokens.owner, { version: mapped.version, formResponses: { project_goal: 'هدف تازه', reference_urls: 'http://example.test/legacy' } })).body;
    assert.equal(synced.intake.data.goal, 'هدف تازه'); assert.equal(synced.intake.data.constraints, 'ثابت'); assert.equal(synced.intake.data.referenceUrls, undefined); assert(JSON.stringify(synced.formResponses).includes('http://example.test/legacy'));
    cases.push('explicit_semantic_fields_are_not_duplicated_contradictions_roll_back_and_valid_legacy_answers_are_preserved_verbatim');
    const submitKey = randomUUID(), submitted = (await http('POST', `/customer/orders/${draft.id}/submit`, tokens.owner, undefined, 201, submitKey)).body;
    assert.equal(submitted.status, 'pending_triage'); assert.deepEqual((await http('POST', `/customer/orders/${draft.id}/submit`, tokens.owner, undefined, 201, submitKey)).body, submitted);
    const sealed = (await read(draft)).intake; assert(sealed.sealedAt); assert.equal(sealed.orderVersion, submitted.version); assert.deepEqual(sealed.data, changed);
    await http('PATCH', `/customer/orders/${draft.id}/draft`, tokens.owner, { version: submitted.version, intake: { version: 1 } }, 400);
    await assert.rejects(() => db.$executeRaw`UPDATE order_intakes SET data='{"version":1}'::jsonb WHERE order_id=${draft.id}`);
    await assert.rejects(() => db.$executeRaw`DELETE FROM order_intakes WHERE order_id=${draft.id}`);
    assert.deepEqual((await read(draft)).intake, sealed);
    assert.deepEqual((await http('GET', `/admin/orders/${draft.id}/intake`, tokens.ops)).body, sealed);
    for (const actor of ['finance', 'support', 'executor', 'other']) await http('GET', `/admin/orders/${draft.id}/intake`, tokens[actor], undefined, 403);
    const financeOrder = (await http('GET', `/admin/orders/${draft.id}`, tokens.finance)).body; assert.equal(financeOrder.intake, undefined); assert(!JSON.stringify(financeOrder).includes(changed.financialNote));
    await http('GET', `/executor/orders/${draft.id}`, tokens.executor, undefined, 404);
    const profile = await db.executorProfile.create({ data: { userId: executor.id, publicHandlerCode: 'INTAKE-' + randomUUID(), displayAlias: 'Isolated executor' } });
    // Assignment is fixture setup only; this is not acceptance of assignment
    // state transitions. Product reads still run the real assignment gate.
    await db.orderAssignment.create({ data: { orderId: draft.id, executorProfileId: profile.id, assignedByUserId: ops.id } });
    const execution = (await http('GET', `/executor/orders/${draft.id}`, tokens.executor)).body;
    assert.deepEqual(execution.intakeRequirements.requirements, { goal: changed.goal, brandGuidelines: changed.brandGuidelines, referenceUrls: changed.referenceUrls, constraints: changed.constraints });
    assert.equal(execution.intake, undefined); assert(!JSON.stringify(execution).includes(changed.financialNote)); assert.equal(execution.intakeRequirements.requirements.confidentialityRequested, undefined);
    await http('GET', `/executor/orders/${draft.id}`, tokens.unassigned, undefined, 404);
    await db.orderAssignment.updateMany({ where: { orderId: draft.id }, data: { unassignedAt: new Date() } }); await http('GET', `/executor/orders/${draft.id}`, tokens.executor, undefined, 404);
    cases.push('actual_submit_seals_intake_immutably_and_only_owner_ops_or_assigned_execution_projection_can_read_it');
    const policy = { calendar: { version: 1, timezone: 'Asia/Tehran', workDays: [6, 0, 1, 2, 3, 4], holidays: [] }, normalMinutes: 1440, urgentMinutes: 480, sameDayEnabled: false, quoteTtlMinutes: 30, requiredSkills: [], formula: null };
    await db.commercialPolicy.create({ data: { serviceId: service.id, version: 1, config: policy } });
    const offerEndpoint = order => `/customer/orders/${order.id}/commercial/registration-offer`;
    const offer = (await http('POST', offerEndpoint(draft), tokens.owner, { priority: 'normal', version: submitted.version }, 201, randomUUID())).body; assert.equal(offer.final_price, 100);
    for (const terms of [{ confidentialityRequested: 'highly_sensitive' }, { stagedDeliveryRequested: true }, { addonRequests: ['بازبینی افزوده'] }]) {
      const request = await create({ intake: { version: 1, ...terms } }); const registered = (await http('POST', `/customer/orders/${request.id}/submit`, tokens.owner, undefined, 201, randomUUID())).body;
      const before = await tableSnapshot(['orders', 'order_status_history', 'commercial_revisions', ...financialTables]);
      config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', false);
      await http('POST', offerEndpoint(request), tokens.owner, { priority: 'normal', version: registered.version }, 409, randomUUID());
      config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', true); assert.deepEqual(await tableSnapshot(['orders', 'order_status_history', 'commercial_revisions', ...financialTables]), before);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: request.id } })).confidentialityLevel, 'normal'); assert.equal(await db.orderMilestone.count({ where: { orderId: request.id } }), 0);
    }
    cases.push('ordinary_metadata_keeps_fixed_quote_but_extra_privacy_staged_or_addon_terms_require_human_review_even_when_ui_flag_is_off');
    const ownerExport = (await http('POST', '/customer/account/privacy/export', tokens.owner, undefined, 201)).body;
    assert.equal(ownerExport.exportVersion, 1); assert(Array.isArray(ownerExport.orders)); assert(Array.isArray(ownerExport.tickets)); assert(Array.isArray(ownerExport.invoices));
    assert.equal(ownerExport.customerOnboarding.purpose, null); assert.equal(ownerExport.customerOnboarding.skipped, true);
    assert.deepEqual(ownerExport.orderIntakes.find(row => row.orderId === draft.id).data, changed);
    assert.equal(ownerExport.verifiedEmailIdentity, null);
    const otherExport = (await http('POST', '/customer/account/privacy/export', tokens.other, undefined, 201)).body; assert.deepEqual(otherExport.orderIntakes, []);
    const exportedText = JSON.stringify(ownerExport); for (const secret of ['tokenHash', 'passwordHash', 'credentialHash', 'emailLoginChallenges', 'emailLoginFamilies']) assert(!exportedText.includes(secret));
    config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', false); config.set('ZEUS_VERIFIED_EMAIL_ENABLED', false);
    const legacyExport = (await http('POST', '/customer/account/privacy/export', tokens.owner, undefined, 201)).body; assert.equal(legacyExport.orderIntakes, undefined); assert.equal(legacyExport.customerOnboarding, undefined); assert.equal(legacyExport.verifiedEmailIdentity, undefined);
    config.set('ZEUS_CUSTOMER_INTAKE_ENABLED', true); config.set('ZEUS_VERIFIED_EMAIL_ENABLED', true);
    cases.push('existing_privacy_export_keeps_all_old_sections_and_includes_only_owner_new_data_without_proof_or_session_secrets');
    assert.deepEqual(await tableSnapshot(financialTables), financialBefore);
    // The one executor profile above is explicit fixture setup, not onboarding.
    await db.orderAssignment.deleteMany({ where: { executorProfileId: profile.id } }); await db.executorProfile.delete({ where: { id: profile.id } });
    assert.deepEqual(await tableSnapshot(['user_capabilities', 'executor_profiles']), rolesBefore);
    assert.deepEqual(await db.user.findMany({ where: { id: { in: [owner.id, other.id] } }, select: { id: true, role: true, adminScope: true }, orderBy: { id: 'asc' } }), roleBefore);
    cases.push('every_existing_financial_row_and_customer_role_or_capability_is_unchanged');
    const paths = ['account/account.module.ts', 'account/account.service.ts', 'account/customer-private-data.ts', 'account/customer-intake-config.ts', 'account/customer-onboarding.service.ts', 'account/customer-onboarding.controller.ts', 'account/dto/onboarding.dto.ts', 'orders/orders.service.ts', 'orders/orders.admin.controller.ts', 'orders/dto/order.dto.ts', 'orders/order-intake-contract.ts', 'orders/domain/order-intake.ts', 'orders/domain/fixed-registration-eligibility.ts'];
    const hash = p => createHash('sha256').update(readFileSync(join(root, p), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    return { status: 'passed', cases, realNestGuardsAndTransactions: true, mainDatabaseConnected: false, liveProvidersUsed: false, phaseAccepted: false, sourceHashes: Object.fromEntries(paths.map(p => ['apps/api/src/' + p, hash('apps/api/src/' + p)])), compiledHashes: Object.fromEntries(paths.map(p => { const file = 'apps/api/dist/' + p.replace(/\.ts$/, '.js'); return [file, hash(file)]; })) };
  } finally { await app?.close(); }
}
