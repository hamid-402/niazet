import assert from 'node:assert/strict';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real production browser -> proxy -> API -> random isolated DB. Only the
// explicitly labelled lost-response probe alters transport, never auth/proofs.
const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api'), web = join(root, 'apps/web');
const apiRequire = createRequire(join(api, 'package.json')), webRequire = createRequire(join(web, 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client'), { chromium } = webRequire('playwright'), AxeBuilder = webRequire('@axe-core/playwright').default;
const fileEnv = Object.fromEntries(readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]; }));
const source = new URL(process.env.DATABASE_URL || fileEnv.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname));
const name = `niazat_z3_customer_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(name, /^niazat_z3_customer_\d+_[a-f0-9]{8}$/); assert.notEqual(source.pathname, '/' + name);
const maintenance = new URL(source); maintenance.pathname = '/postgres';
const target = new URL(source); target.pathname = '/' + name;
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const output = join(root, '.artifacts/zeus/z3-customer-runtime'); mkdirSync(output, { recursive: true });
const apiPort = randomInt(35001, 40000), webPort = randomInt(40001, 45000), apiOrigin = `http://127.0.0.1:${apiPort}`, base = `http://127.0.0.1:${webPort}`;
const pathKey = Object.keys(process.env).find(k => k.toLowerCase() === 'path') ?? 'PATH';
const env = { ...fileEnv, ...process.env, DATABASE_URL: target.toString(), NODE_ENV: 'development', [pathKey]: join(api, 'node_modules/.bin') + delimiter + process.env[pathKey], LIVE_PROVIDERS_ENABLED: 'false', BACKGROUND_JOBS_ENABLED: 'false', PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local', ZEUS_WALLET_ENABLED: 'true', APP_PORT: String(apiPort), APP_URL: apiOrigin, WEB_URL: base };
const report = { status: 'running', mainDatabaseConnected: false, liveProvidersUsed: false, realAuthProxyApiDatabase: true, backendEnvironment: 'development-mock-for-explicit-dev-otp', webEnvironment: 'production-build', lostResponseProbeExplicit: true, phaseAccepted: false, results: [], temporaryDatabaseRemoved: false };
let db, created = false, apiProcess, webProcess, browser, failure, diagnosticPage;
const redact = value => String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<database URL>');
function launch(entry, args, cwd, environment) {
  const child = spawn(process.execPath, [entry, ...args], { cwd, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); child.log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { child.log = (child.log + b).slice(-6000); }); return child;
}
async function stop(child) { if (!child || child.exitCode !== null) return; child.kill(); await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5000))]); assert(child.exitCode !== null || child.signalCode !== null); }
async function ready(child, url) { for (const deadline = Date.now() + 45000; Date.now() < deadline;) { assert.equal(child.exitCode, null, redact(child.log)); try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); } throw new Error('Isolated server did not start: ' + redact(child.log)); }
async function checkAxe(page) { const result = await new AxeBuilder({ page }).analyze(); assert.deepEqual(result.violations, []); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  for (const args of [['migrate', 'deploy'], ['db', 'seed']]) { const result = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), ...args], { cwd: api, env, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, redact(result.stdout + result.stderr).slice(-2000)); }
  db = new PrismaClient({ datasources: { db: { url: target.toString() } } }); assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, name);
  const owner = await db.user.findUniqueOrThrow({ where: { phone: '09120000009' } });
  const service = await db.serviceLine.create({ data: { slug: 'z3-registration-browser', title: 'خدمت قطعی آزمون زئوس', category: 'test', description: 'فقط برای پذیرش ایزوله', pricingModel: 'fixed', basePrice: 100 } });
  const manual = await db.serviceLine.create({ data: { slug: 'z3-manual-browser', title: 'خدمت توافقی آزمون زئوس', category: 'test', description: 'مسیر بررسی انسانی محفوظ است', pricingModel: 'manual_quote' } });
  await db.commercialPolicy.create({ data: { serviceId: service.id, version: 1, config: { calendar: { version: 1, timezone: 'Asia/Tehran', workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] }, normalMinutes: 1440, urgentMinutes: 480, sameDayEnabled: false, quoteTtlMinutes: 30, requiredSkills: [], formula: null } } });
  apiProcess = launch(join(api, 'dist/main.js'), [], output, env); await ready(apiProcess, apiOrigin + '/health');
  webProcess = launch(join(web, 'node_modules/next/dist/bin/next'), ['start', '--hostname', '127.0.0.1', '--port', String(webPort)], web, { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: apiOrigin + '/v1' }); await ready(webProcess, base + '/login');
  const executablePath = [process.env.PLAYWRIGHT_EXECUTABLE_PATH, chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync); assert(executablePath);
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await context.newPage(), errors = [], external = [];
  diagnosticPage = page;
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => { if (new URL(route.request().url()).origin !== base) { external.push(route.request().url()); await route.abort(); } else await route.continue(); });
  // Independent OTP route, actual mock OTP and real session (no token injection).
  await page.goto(base + '/login/otp'); await page.locator('input[autocomplete="tel"]').fill(owner.phone);
  const otpResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/backend/auth/otp/request' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click();
  const otp = await (await otpResponse).json(); assert.match(otp.devOtp, /^\d{6}$/);
  await page.getByLabel('کد تأیید', { exact: true }).fill(otp.devOtp); await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).click(); await page.waitForURL('**/dashboard');
  // Fund through existing mock wallet UI; never edit a wallet balance directly.
  await page.goto(base + '/wallet?tab=wallet'); await page.getByLabel('مبلغ شارژ به تومان').fill('100000');
  await page.getByRole('button', { name: 'ایجاد درخواست شارژ آزمایشی', exact: true }).click();
  await page.getByRole('button', { name: 'بررسی و تأیید شارژ', exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'ثبت اعتبار آزمایشی', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  const { LedgerService } = apiRequire('./dist/finance/ledger.service.js'), ledger = new LedgerService(db);
  assert.equal((await ledger.verifyWalletConsistency(owner.id)).consistent, true);
  async function navigateWorkspace(path) {
    let link = page.locator(`a[href="${path}"]:visible`).first();
    if (!await link.count()) { await page.getByRole('button', { name: 'باز کردن منو', exact: true }).click(); link = page.locator(`a[href="${path}"]:visible`).first(); }
    await link.click(); await page.waitForURL(url => url.pathname === path);
  }
  async function compose(selected, title) {
    // Use the real client navigation, not dozens of artificial full reloads
    // that exhaust the unchanged refresh guard. Delivery deep links below do
    // still exercise a real reload/session restoration for each viewport.
    await navigateWorkspace('/orders/new');
    await page.getByRole('combobox', { name: /^نوع خدمت/ }).selectOption(selected.id);
    await page.getByLabel('عنوان درخواست', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'ادامه به نیازها و فایل‌ها', exact: true }).click();
    await page.getByLabel(/^شرح نیاز/).fill('شرح کامل نیاز و خروجی واقعی برای پذیرش ایزولهٔ مرورگر');
    await page.getByRole('button', { name: 'مرور و ثبت نهایی', exact: true }).click();
  }
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 768, 1280, 1920]) {
    const started = Date.now(), suffix = theme + '-' + width; await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(t => { localStorage.setItem('niazat-theme', t); document.documentElement.dataset.theme = t; }, theme);
    const countBefore = await db.order.count({ where: { customerId: owner.id } });
    await compose(service, 'ثبت قطعی ' + suffix);
    await page.getByLabel('مسیر قیمت‌گذاری هنگام ثبت').selectOption('normal');
    await page.getByRole('button', { name: 'ثبت و دریافت قرارداد پرداخت', exact: true }).click();
    await page.waitForURL(/\/orders\/[^/?]+\?submitted=1&tab=payments$/);
    const orderId = new URL(page.url()).pathname.split('/').at(-1);
    const panel = page.locator('[data-commercial-order]'); await panel.getByRole('button', { name: 'بررسی و پذیرش این قیمت و مهلت', exact: true }).waitFor();
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'quoted');
    assert.equal(await db.payment.count({ where: { orderId } }), 0);
    assert.equal(await page.getByRole('tab').count(), 8);
    await page.getByRole('tab', { name: 'تاریخچه', exact: true }).click(); assert.equal(new URL(page.url()).searchParams.get('tab'), 'history');
    assert.equal(new URL(page.url()).searchParams.get('submitted'), '1');
    await page.goBack(); await page.getByRole('tab', { name: 'پرداخت‌ها', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'پرداخت‌ها', exact: true }).getAttribute('aria-selected'), 'true');
    await page.goForward(); assert.equal(new URL(page.url()).searchParams.get('tab'), 'history');
    await page.goto(base + '/orders/' + orderId + '?tab=delivery'); await page.getByRole('tab', { name: 'فایل‌ها', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'فایل‌ها', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'پرداخت‌ها', exact: true }).click();
    await panel.getByRole('button', { name: 'بررسی و پذیرش این قیمت و مهلت', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'انصراف', exact: true }).click(); assert.equal(await db.payment.count({ where: { orderId } }), 0);
    await panel.getByRole('button', { name: 'بررسی و پذیرش این قیمت و مهلت', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'پذیرش همین نسخه', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /پرداخت .* از موجودی/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'تأیید و پرداخت از موجودی', exact: true }).click(); await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'paid'); assert.equal(await db.payment.count({ where: { orderId, status: 'succeeded' } }), 1);
    assert.equal((await ledger.verifyWalletConsistency(owner.id)).consistent, true);
    await checkAxe(page); await page.screenshot({ path: join(output, suffix + '-paid.png'), fullPage: true });
    // Successful server commit with deliberately lost/invalid response: exactly
    // one registered order and quote survive, no automatic payment or retry.
    await compose(service, 'پاسخ نامعلوم ' + suffix); await page.getByLabel('مسیر قیمت‌گذاری هنگام ثبت').selectOption('normal');
    let lost = 0; const pattern = '**/api/backend/customer/orders/*/commercial/registration-offer';
    await page.route(pattern, async route => { lost++; const response = await route.fetch(); assert.equal(response.status(), 201); await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }); });
    await page.getByRole('button', { name: 'ثبت و دریافت قرارداد پرداخت', exact: true }).click(); await page.waitForURL(/checkout=check/); await page.unroute(pattern);
    const ambiguousId = new URL(page.url()).pathname.split('/').at(-1); assert.equal(lost, 1);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: ambiguousId } })).status, 'quoted'); assert.equal(await db.payment.count({ where: { orderId: ambiguousId } }), 0);
    await checkAxe(page); await page.screenshot({ path: join(output, suffix + '-unknown.png'), fullPage: true });
    // Negotiated service retains default submission and never calls the new API.
    await compose(manual, 'توافقی ' + suffix); assert.equal(await page.getByLabel('مسیر قیمت‌گذاری هنگام ثبت').count(), 0);
    await page.getByRole('button', { name: 'تأیید و ارسال برای بررسی', exact: true }).click(); await page.waitForURL(/\/orders\/[^/?]+\?submitted=1$/);
    const manualId = new URL(page.url()).pathname.split('/').at(-1); assert.equal((await db.order.findUniqueOrThrow({ where: { id: manualId } })).status, 'pending_triage');
    assert.equal(await db.commercialRevision.count({ where: { orderId: manualId } }), 0); assert.equal(await db.order.count({ where: { customerId: owner.id } }), countBefore + 3);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    report.results.push({ theme, width, status: 'passed', realThreeStepRegistrationAndExplicitAcceptancePayment: true, eightTabsAndHistoryNavigation: true, ambiguousResponsePreservesExactlyOneOrderAndQuote: true, negotiatedPathRetained: true, balancedWallet: true, axeViolations: 0 });
    console.log('Z3 customer runtime: ' + suffix + ' passed');
    await new Promise(r => setTimeout(r, Math.max(0, 13000 - (Date.now() - started))));
  }
  report.otpIndependentRouteRealSession = true; report.status = 'passed';
  report.sourceHashes = Object.fromEntries(['apps/web/src/app/(customer)/orders/new/page.tsx', 'apps/web/src/app/(customer)/orders/[id]/page.tsx', 'apps/web/src/components/customer-navigation.ts', 'apps/web/src/components/login-screen.tsx'].map(p => [p, createHash('sha256').update(readFileSync(join(root, p), 'utf8').replaceAll('\r\n', '\n')).digest('hex')]));
} catch (error) {
  failure = error; report.status = 'failed'; report.failure = redact(error.stack ?? error);
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    report.page = { url: diagnosticPage.url(), text: (await diagnosticPage.locator('body').innerText()).slice(0, 4000) };
    await diagnosticPage.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  }
  report.serverDiagnostic = { api: redact(apiProcess?.log ?? '').slice(-1500), web: redact(webProcess?.log ?? '').slice(-1500) };
}
finally {
  await browser?.close(); await stop(webProcess); await stop(apiProcess); await db?.$disconnect();
  if (created) { assert.match(name, /^niazat_z3_customer_\d+_[a-f0-9]{8}$/); assert.notEqual(source.pathname, '/' + name); await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', name); await control.$executeRawUnsafe(`DROP DATABASE "${name}"`); report.temporaryDatabaseRemoved = true; }
  await control.$disconnect(); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw new Error(report.failure);
