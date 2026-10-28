import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Only invoked by the random-database upgrade runner. Actual Nest guards,
// ValidationPipe, password/session/refresh services and mock email boundary.
export async function verifyEmailNative({ db, root }) {
  assert.match((await db.$queryRaw`SELECT current_database() AS name`)[0].name, /^niazat_z3_identity_\d+_[a-f0-9]{8}$/);
  const req = createRequire(join(root, 'apps/api/package.json')), load = p => req('./dist/' + p + '.js');
  const { Test } = req('@nestjs/testing'), { ConfigService } = req('@nestjs/config'), { ValidationPipe } = req('@nestjs/common'), bcrypt = req('bcrypt');
  const { AppModule } = load('app.module'), { PrismaService } = load('prisma/prisma.service');
  const { AuthService } = load('auth/auth.service'), { AuthSessionService } = load('auth/auth-session.service');
  const { VerifiedEmailService } = load('auth/verified-email.service');
  const { MockEmailProvider } = load('notifications/email.service');
  const password = 'Passw0rd!123', passwordHash = await bcrypt.hash(password, 12), mails = [], cases = [];
  let failSend = false, app, origin, emailService, sessions, auth;
  const config = new ConfigService({ NODE_ENV: 'test', DATABASE_URL: 'unused-override-provider', ZEUS_VERIFIED_EMAIL_ENABLED: true, BACKGROUND_JOBS_ENABLED: false, JWT_ACCESS_SECRET: randomUUID() + randomUUID(), DOWNLOAD_TOKEN_SECRET: randomUUID() + randomUUID(), JWT_ACCESS_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30, OTP_TTL_SECONDS: 120, PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local', LIVE_PROVIDERS_ENABLED: 'false', FILE_STORAGE_ROOT: join(root, '.artifacts/zeus/z3-email-native/storage'), WEB_URL: 'http://localhost:3002', APP_URL: 'http://localhost:3001' });
  async function start() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(ConfigService).useValue(config)
      .overrideProvider(MockEmailProvider).useValue({ send: async (to, subject, body, key) => { mails.push({ to, subject, body, key }); if (failSend) throw new Error('Injected mock send failure'); } }).compile();
    app = module.createNestApplication({ logger: false }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); emailService = app.get(VerifiedEmailService); sessions = app.get(AuthSessionService); auth = app.get(AuthService);
  }
  async function http(method, path, token, body, expected = 200, refreshToken) {
    const response = await fetch(origin + '/v1' + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(refreshToken ? { Cookie: 'niazat_refresh=' + encodeURIComponent(refreshToken) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); const acceptable = Array.isArray(expected) ? expected : [expected];
    assert(acceptable.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(value.message ?? 'unexpected response')}`);
    const setCookie = response.headers.get('set-cookie') ?? '', refresh = /niazat_refresh=([^;]+)/.exec(setCookie)?.[1];
    return { status: response.status, body: value, cookie: setCookie, refresh: refresh ? decodeURIComponent(refresh) : undefined };
  }
  const tokenFromMail = () => { const value = /[a-f0-9]{64}/.exec(mails.at(-1).body)?.[0]; assert(value); return value; };
  const decodeSid = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sid;
  const account = (phone, email) => db.user.create({ data: { phone, email, fullName: 'Isolated verified-email fixture', role: 'customer', status: 'active', passwordHash } });
  try {
    const owner = await account('09199111001', 'Legacy.Owner@example.test'), other = await account('09199111002', 'legacy.owner@EXAMPLE.test');
    await start();
    const mobile = await http('POST', '/auth/login', null, { phone: owner.phone, password });
    const otherSession = await sessions.issue(other);
    await http('GET', '/auth/email/status', null, undefined, 401);
    config.set('ZEUS_VERIFIED_EMAIL_ENABLED', false);
    assert.equal((await http('GET', '/auth/email/status', mobile.body.accessToken)).body.enabled, false);
    await http('POST', '/auth/email/login', null, { email: owner.email, password }, 503);
    assert.equal((await http('GET', '/auth/me', mobile.body.accessToken)).body.id, owner.id);
    config.set('ZEUS_VERIFIED_EMAIL_ENABLED', true);
    cases.push('explicit_schema_flag_fails_closed_and_original_mobile_session_remains_usable');
    const unknown = await http('POST', '/auth/email/login', null, { email: 'unknown@example.test', password }, 401);
    const legacy = await http('POST', '/auth/email/login', null, { email: owner.email, password }, 401);
    assert.equal(unknown.body.message, legacy.body.message); assert.equal(await db.emailLoginIdentity.count({ where: { userId: owner.id } }), 0);
    await http('POST', '/auth/email/request', mobile.body.accessToken, { email: 'legacy.owner@example.test', currentPassword: password }, 409);
    await http('POST', '/auth/email/request', mobile.body.accessToken, { email: 'fresh.owner@example.test', currentPassword: password, userId: other.id }, 400);
    assert.equal(await db.emailLoginIdentity.count({ where: { userId: owner.id } }), 0); assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email, owner.email);
    cases.push('legacy_case_collisions_are_not_merged_or_implicitly_verified_and_dto_rejects_forged_owner');
    const requested = await http('POST', '/auth/email/request', mobile.body.accessToken, { email: ' Fresh.Owner@example.test ', currentPassword: password }, 201);
    assert.equal(requested.body.delivery, 'simulated'); assert.equal(requested.body.devToken, undefined);
    const secret = tokenFromMail(), challengeId = requested.body.challengeId;
    const stored = await db.emailLoginChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    assert.notEqual(stored.tokenHash, secret); assert.equal(stored.tokenHash, createHash('sha256').update(secret).digest('hex'));
    await http('POST', '/auth/email/confirm', otherSession.accessToken, { challengeId, token: secret }, 400);
    await http('POST', '/auth/email/confirm', mobile.body.accessToken, { challengeId, token: '0'.repeat(64) }, 400);
    const confirmed = await http('POST', '/auth/email/confirm', mobile.body.accessToken, { challengeId, token: secret }, 201);
    assert.deepEqual((await http('POST', '/auth/email/confirm', mobile.body.accessToken, { challengeId, token: secret }, 201)).body, confirmed.body);
    assert.equal(await db.emailLoginIdentity.count({ where: { userId: owner.id } }), 1);
    const signedIn = await http('POST', '/auth/email/login', null, { email: 'FRESH.OWNER@EXAMPLE.TEST', password });
    assert.equal(signedIn.body.user.id, owner.id); assert.equal(signedIn.body.user.role, 'customer');
    assert(signedIn.cookie.includes('HttpOnly')); assert(signedIn.cookie.includes('SameSite=Strict')); assert(signedIn.cookie.includes('Path=/v1/auth'));
    await http('GET', '/auth/me', signedIn.body.accessToken);
    const rotated = await http('POST', '/auth/refresh', null, undefined, 200, signedIn.refresh);
    await http('GET', '/auth/me', signedIn.body.accessToken, undefined, 401); await http('GET', '/auth/me', rotated.body.accessToken);
    cases.push('real_http_password_step_up_hash_only_challenge_owner_bound_confirmation_idempotent_receipt_and_refresh_cookie');
    const profile = email => ({ fullName: owner.fullName, email, accountType: 'individual', marketingConsent: false, analyticsConsent: false });
    await http('PUT', '/customer/account/profile', mobile.body.accessToken, profile('changed.owner@example.test'));
    assert.equal(await db.emailLoginIdentity.count({ where: { userId: owner.id } }), 0);
    await http('GET', '/auth/me', rotated.body.accessToken, undefined, 401);
    await http('POST', '/auth/refresh', null, undefined, 401, rotated.refresh);
    const listed = (await http('GET', '/auth/sessions', mobile.body.accessToken)).body;
    assert(!listed.some(row => row.id === decodeSid(rotated.body.accessToken)));
    await http('GET', '/auth/me', mobile.body.accessToken);
    cases.push('profile_email_change_revokes_email_families_across_rotation_without_revoking_original_mobile_session');
    async function bind(email) { const request = await emailService.request(owner.id, { email, currentPassword: password }); const token = tokenFromMail(); return emailService.confirm(owner.id, { challengeId: request.challengeId, token }); }
    for (let i = 0; i < 3; i++) {
      const email = `race${i}@example.test`; await bind(email); const login = await emailService.login({ email, password });
      const [race] = await Promise.all([http('POST', '/auth/refresh', null, undefined, [200, 401], login.refreshToken), http('PUT', '/customer/account/profile', mobile.body.accessToken, profile(`after-race${i}@example.test`))]);
      await http('GET', '/auth/me', login.accessToken, undefined, 401);
      if (race.status === 200) { await http('GET', '/auth/me', race.body.accessToken, undefined, 401); await http('POST', '/auth/refresh', null, undefined, 401, race.refresh); }
    }
    cases.push('three_real_refresh_vs_email_change_races_cannot_leave_a_usable_successor_session');
    failSend = true; await assert.rejects(() => emailService.request(owner.id, { email: 'failed-send@example.test', currentPassword: password }), error => error.getStatus?.() === 503); failSend = false;
    const failedChallengeId = mails.at(-1).key.split(':').at(-1), failedSecret = tokenFromMail();
    await assert.rejects(() => emailService.confirm(owner.id, { challengeId: failedChallengeId, token: failedSecret }));
    const expiredToken = randomBytes(32).toString('hex'), now = Date.now();
    const expired = await db.emailLoginChallenge.create({ data: { userId: owner.id, emailNormalized: 'expired@example.test', expectedProfileEmail: (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email, tokenHash: createHash('sha256').update(expiredToken).digest('hex'), createdAt: new Date(now - 20 * 60 * 1000), expiresAt: new Date(now - 1000) } });
    await assert.rejects(() => emailService.confirm(owner.id, { challengeId: expired.id, token: expiredToken }));
    const first = await emailService.request(owner.id, { email: 'resend@example.test', currentPassword: password }), firstToken = tokenFromMail();
    const second = await emailService.request(owner.id, { email: 'resend@example.test', currentPassword: password }), secondToken = tokenFromMail();
    await assert.rejects(() => emailService.confirm(owner.id, { challengeId: first.challengeId, token: firstToken }));
    await emailService.confirm(owner.id, { challengeId: second.challengeId, token: secondToken });
    cases.push('mock_send_failure_expiry_and_resend_invalidate_old_proof_without_creating_or_merging_an_identity');
    config.set('NODE_ENV', 'development');
    const dev = await emailService.request(owner.id, { email: 'dev-only@example.test', currentPassword: password }); assert.equal(dev.devToken, tokenFromMail());
    config.set('NODE_ENV', 'production');
    await assert.rejects(() => emailService.request(owner.id, { email: 'prod@example.test', currentPassword: password }), error => error.getStatus?.() === 503);
    await assert.rejects(() => emailService.confirm(owner.id, { challengeId: dev.challengeId, token: dev.devToken }), error => error.getStatus?.() === 503);
    assert.equal((await emailService.status(owner.id)).verificationMode, 'unavailable'); config.set('NODE_ENV', 'test');
    const beforeUnlink = await emailService.login({ email: 'resend@example.test', password });
    await http('DELETE', '/auth/email/identity', mobile.body.accessToken, { currentPassword: password });
    await http('GET', '/auth/me', beforeUnlink.accessToken, undefined, 401); await http('GET', '/auth/me', mobile.body.accessToken);
    assert.equal(await db.emailLoginIdentity.count({ where: { userId: owner.id } }), 0);
    cases.push('development_token_is_never_returned_in_test_and_production_mock_verification_is_unavailable_unlink_preserves_phone');
    // Real reset endpoint domain flow, with a deterministic race window only in
    // this isolated fixture: reset after password check, before session issue.
    await bind('reset-race@example.test'); config.set('NODE_ENV', 'development');
    const reset = await auth.requestPasswordReset(owner.phone); assert.match(reset.devOtp, /^\d{6}$/); config.set('NODE_ENV', 'test');
    const originalIssue = sessions.issue.bind(sessions), newPassword = 'ChangedPassw0rd!456'; let resetInjected = false;
    sessions.issue = async (user, context, proof) => { if (proof && !resetInjected) { resetInjected = true; await auth.resetPassword({ phone: owner.phone, code: reset.devOtp, password: newPassword }); } return originalIssue(user, context, proof); };
    try { await assert.rejects(() => emailService.login({ email: 'reset-race@example.test', password }), error => error.getStatus?.() === 401); } finally { sessions.issue = originalIssue; }
    assert(resetInjected); const afterReset = await auth.login({ phone: owner.phone, password: newPassword }); assert.equal(afterReset.user.id, owner.id);
    cases.push('actual_password_reset_between_password_check_and_issue_rejects_stale_email_credential_and_keeps_mobile_recovery');
    const locked = await account('09199111003', 'locked@example.test');
    const lockedRequest = await emailService.request(locked.id, { email: locked.email, currentPassword: password }); await emailService.confirm(locked.id, { challengeId: lockedRequest.challengeId, token: tokenFromMail() });
    await db.loginAttempt.createMany({ data: Array.from({ length: 5 }, () => ({ userId: locked.id, identifier: locked.phone, success: false })) });
    await assert.rejects(() => emailService.login({ email: locked.email, password }), error => error.getStatus?.() === 429);
    await assert.rejects(() => auth.login({ phone: locked.phone, password }), error => error.getStatus?.() === 429);
    const logs = JSON.stringify(await db.auditLog.findMany({ where: { action: { startsWith: 'auth.email_' } } }));
    for (const mail of mails) { const raw = /[a-f0-9]{64}/.exec(mail.body)?.[0]; if (raw) assert(!logs.includes(raw)); } assert(!logs.includes(password));
    cases.push('email_and_phone_share_account_lockout_and_no_password_or_raw_email_proof_is_written_to_audit');
    // A fresh Nest instance isolates this quota test from the functional cases;
    // production RateLimitGuard remains unmodified and both routes share it.
    await app.close(); await start();
    for (let i = 0; i < 10; i++) await http('POST', i % 2 ? '/auth/email/login' : '/auth/login', null, i % 2 ? { email: 'quota-unknown@example.test', password } : { phone: '09198000000', password }, 401);
    await http('POST', '/auth/email/login', null, { email: 'quota-unknown@example.test', password }, 429);
    await http('POST', '/auth/login', null, { phone: '09198000000', password }, 429);
    cases.push('anonymous_password_and_email_routes_share_one_ten_attempt_actor_budget');
    const sourcePaths = ['auth/auth.module.ts', 'auth/verified-identifier-contract.ts', 'auth/verified-email-session.ts', 'auth/verified-email.service.ts', 'auth/verified-email.controller.ts', 'auth/dto/verified-email.dto.ts', 'auth/auth.service.ts', 'auth/auth-session.service.ts'];
    const digest = p => createHash('sha256').update(readFileSync(join(root, p), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    return { status: 'passed', mainDatabaseConnected: false, liveProvidersUsed: false, realNestAuthValidationSessionsAndMockMail: true, passwordResetRaceWindowInjectedOnlyInFixture: true, cases, sourceHashes: Object.fromEntries(sourcePaths.map(p => ['apps/api/src/' + p, digest('apps/api/src/' + p)])), compiledHashes: Object.fromEntries(sourcePaths.map(p => { const file = 'apps/api/dist/' + p.replace(/\.ts$/, '.js'); return [file, digest(file)]; })) };
  } finally { await app?.close(); mails.length = 0; }
}
