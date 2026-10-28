import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Called only by the isolated PostgreSQL runner. Real login/proxy/API/storage;
// one explicitly injected transport failure is identified in the report.
export async function verifyPublicationBrowser({ db, storage, origin, customer, executor, password, serviceId, noChecklistServiceId, root }) {
  const database = (await db.$queryRaw`SELECT current_database() AS name`)[0].name;
  assert.match(database, /^niazat_z3_qc_\d+_[a-f0-9]{8}$/);
  const output = join(root, '.artifacts/zeus/z3-publication-ui'); mkdirSync(output, { recursive: true });
  const base = 'http://localhost:3110';
  const portProbe = createServer();
  await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(3110, '127.0.0.1', () => portProbe.close(resolve)); });
  const child = spawn(process.execPath, ['apps/web/node_modules/next/dist/bin/next', 'start', 'apps/web', '--port', '3110', '--hostname', '127.0.0.1'], { cwd: root, windowsHide: true, env: { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: origin + '/v1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; child.stdout.on('data', b => serverLog = (serverLog + b).slice(-1500)); child.stderr.on('data', b => serverLog = (serverLog + b).slice(-1500));
  let browser, customerContext, opsContext, sequence = 0;
  const report = { date: '2026-10-28', status: 'running', mainDatabaseConnected: false, realAuthApiDatabaseAndStorage: true, injectedTransportFailure: true, realSessionsReusedAcrossViewportMatrix: true, caseCadenceMs: 13000, results: [] };
  const passwordHash = (await db.user.findUniqueOrThrow({ where: { id: customer.id } })).passwordHash;
  const migration = (await db.$queryRaw`SELECT finished_at FROM _prisma_migrations WHERE migration_name='20261027180000_zeus_output_publications'`)[0];
  const oldDate = new Date(migration.finished_at.getTime() - 1000);
  const hash = b => createHash('sha256').update(b).digest('hex');
  async function account(role) { return db.user.create({ data: { phone: '0919901' + String(++sequence).padStart(4, '0'), fullName: 'کاربر آزمون انتشار', role, status: 'active', passwordHash, ...(role === 'admin' ? { adminScope: 'ops_admin' } : {}) } }); }
  async function fixtureOrder(owner, pending = false, selectedService = serviceId) {
    const order = await db.order.create({ data: { code: 'BROWSER-' + randomUUID(), customerId: owner.id, serviceId: selectedService, title: 'پروندهٔ ایزولهٔ انتشار', briefDescription: 'این سفارش فقط در دیتابیس تصادفی آزمون وجود دارد.', status: pending ? 'qc_in_review' : 'closed' } });
    const review = pending ? await db.qcReview.create({ data: { orderId: order.id } }) : null;
    return { order, review };
  }
  async function fixtureFile(orderId, name, options = {}) {
    const bytes = Buffer.from('Exact browser inspected output: ' + name), key = randomUUID(); await storage.put(key, bytes, 'text/plain');
    const file = await db.orderFile.create({ data: { orderId, uploadedByUserId: executor.id, fileKind: 'output', storageKey: key, originalName: name, mimeType: 'text/plain', sizeBytes: bytes.length, checksum: options.nullChecksum ? null : hash(bytes), scanStatus: 'clean', ...(options.old !== false ? { createdAt: oldDate } : {}), ...(options.purged ? { purgedAt: new Date() } : {}) } });
    return { file, bytes };
  }
  async function login(page, user) {
    await page.goto(base + '/login'); await page.getByLabel('شماره موبایل', { exact: true }).fill(user.phone); await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.getByRole('button', { name: 'ورود', exact: true }).click(); await page.waitForURL(user.role === 'admin' ? '**/admin' : '**/dashboard');
  }
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw new Error(serverLog); try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
    assert(ready, serverLog);
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const owner = await account('customer'), ops = await account('admin'), external = [];
    customerContext = await browser.newContext({ viewport: { width: 320, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    opsContext = await browser.newContext({ viewport: { width: 320, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    for (const context of [customerContext, opsContext]) await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== base) { external.push(url.origin); await route.abort(); } else await route.continue(); });
    const userPage = await customerContext.newPage(), opsPage = await opsContext.newPage();
    await login(userPage, owner); await login(opsPage, ops);
    for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 768, 1280, 1920]) {
      const startedAt = Date.now();
      const item = await fixtureOrder(owner, false, width === 320 ? noChecklistServiceId : serviceId);
      const suffix = `${theme}-${width}`, legacy = await fixtureFile(item.order.id, `old-${suffix}.txt`, { nullChecksum: width === 320 }), awaiting = await fixtureFile(item.order.id, `awaiting-${suffix}.txt`, { old: false }), purged = await fixtureFile(item.order.id, `purged-${suffix}.txt`, { purged: true });
      const pendingItem = await fixtureOrder(owner, true), pendingFile = await fixtureFile(pendingItem.order.id, `bind-${suffix}.txt`);
      const errors = [], writes = [], grants = [];
      const onError = e => errors.push(e.message), onGrant = request => { if (/\/files\/[^/]+\/signed-url/.test(new URL(request.url()).pathname)) grants.push(new URL(request.url()).pathname); };
      try {
        for (const page of [userPage, opsPage]) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => localStorage.setItem('niazat-theme', value), theme); page.on('pageerror', onError); }
        userPage.on('request', onGrant);
        await userPage.goto(`${base}/orders/${item.order.id}`); await userPage.getByRole('tab', { name: 'فایل‌ها', exact: true }).click();
        const oldView = userPage.locator(`[data-output-publication="${legacy.file.id}"]`), waitingView = userPage.locator(`[data-output-publication="${awaiting.file.id}"]`), purgedView = userPage.locator(`[data-output-publication="${purged.file.id}"]`);
        await oldView.getByText(/نسخهٔ قدیمی نیازمند بررسی انسانی/).waitFor(); await waitingView.getByText(/در انتظار کنترل کیفیت/).waitFor(); await purgedView.getByText(/برای دریافت در دسترس نیست/).waitFor();
        assert.equal(await oldView.getByRole('button', { name: legacy.file.originalName, exact: true }).count(), 0); assert.equal(grants.length, 0);
        let axe = await new AxeBuilder({ page: userPage }).analyze(); assert.deepEqual(axe.violations, []);
        await userPage.screenshot({ path: join(output, `${suffix}-customer-held.png`), fullPage: true });
        await opsPage.goto(base + '/admin/qc'); await opsPage.getByRole('link', { name: 'بررسی انسانی نسخه‌های قدیمیِ بدون مدرک انتشار' }).click();
        await opsPage.getByRole('button', { name: `بررسی ${legacy.file.originalName}`, exact: true }).click();
        let panel = opsPage.locator('[data-legacy-inspection]'), publish = panel.getByRole('button', { name: 'بررسی و انتشار همین نسخه', exact: true });
        await publish.waitFor(); assert(await publish.isDisabled()); assert.equal(await db.outputPublication.count({ where: { fileId: legacy.file.id } }), 0);
        const inspectedDownload = opsPage.waitForEvent('download'); await panel.getByRole('button', { name: 'دریافت نسخه برای بازبینی و محاسبهٔ checksum' }).click();
        const inspected = await inspectedDownload; assert.deepEqual(readFileSync(await inspected.path()), legacy.bytes);
        const human = panel.getByRole('checkbox', { name: /محتوای همین نسخه/ }); await human.check();
        if (width !== 320) { assert(await publish.isDisabled()); await panel.getByRole('checkbox', { name: 'Content reviewed', exact: true }).check(); }
        assert(await publish.isEnabled());
        await publish.click(); let dialog = opsPage.getByRole('alertdialog'); await dialog.getByRole('button', { name: 'انصراف' }).click(); assert.equal(await db.outputPublication.count({ where: { fileId: legacy.file.id } }), 0);
        let injectOnce = true;
        await opsPage.route(`**/api/backend/admin/output-publications/${legacy.file.id}/review`, async route => { writes.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() }); if (injectOnce) { injectOnce = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'خطای گذرای تزریق‌شدهٔ آزمون؛ ورودی حفظ شود.' }) }); } else await route.continue(); });
        await publish.click(); await dialog.getByLabel('علت و مستند بررسی همین نسخه').fill('محتوای همین نسخه در آزمون ایزوله بازبینی شد');
        await dialog.getByRole('button', { name: 'تأیید انتشار همین نسخه', exact: true }).click(); await dialog.getByRole('alert').waitFor();
        assert.equal(await db.outputPublication.count({ where: { fileId: legacy.file.id } }), 0); assert.equal(await dialog.getByLabel('علت و مستند بررسی همین نسخه').inputValue(), 'محتوای همین نسخه در آزمون ایزوله بازبینی شد');
        axe = await new AxeBuilder({ page: opsPage }).analyze(); assert.deepEqual(axe.violations, []);
        assert(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
        await opsPage.screenshot({ path: join(output, `${suffix}-human-confirmation.png`), fullPage: true });
        await dialog.getByRole('button', { name: 'تأیید انتشار همین نسخه', exact: true }).click(); await opsPage.getByRole('status').filter({ hasText: 'همین نسخه پس از بررسی انسانی منتشر شد' }).waitFor();
        assert.equal(writes.length, 2); assert.equal(writes[0].key, writes[1].key); assert.equal(writes[1].body.expectedChecksum, hash(legacy.bytes));
        assert.equal(await db.outputPublication.count({ where: { fileId: legacy.file.id, basis: 'manual_qc' } }), 1); assert.equal((await db.order.findUniqueOrThrow({ where: { id: item.order.id } })).status, 'closed');
        await oldView.getByRole('button', { name: 'بازخوانی وضعیت این نسخه' }).click(); await oldView.getByRole('button', { name: legacy.file.originalName, exact: true }).waitFor();
        const statusPath = `**/api/backend/customer/orders/${item.order.id}/output-publications`;
        let failStatusOnce = true;
        await userPage.route(statusPath, async route => { if (failStatusOnce) { failStatusOnce = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Injected read failure' }) }); } else await route.continue(); });
        const grantsBeforeReadFailure = grants.length;
        await waitingView.getByRole('button', { name: 'بازخوانی وضعیت این نسخه' }).click(); await oldView.getByText(/وضعیت انتشار قابل دریافت نیست/).waitFor();
        assert.equal(await oldView.getByRole('button', { name: legacy.file.originalName, exact: true }).count(), 0); assert.equal(grants.length, grantsBeforeReadFailure);
        await oldView.getByRole('button', { name: 'بازخوانی وضعیت این نسخه' }).click(); await oldView.getByRole('button', { name: legacy.file.originalName, exact: true }).waitFor(); await userPage.unroute(statusPath);
        const customerDownload = userPage.waitForEvent('download'); await oldView.getByRole('button', { name: legacy.file.originalName, exact: true }).click(); assert.deepEqual(readFileSync(await (await customerDownload).path()), legacy.bytes);
        assert.equal(await waitingView.getByRole('button', { name: awaiting.file.originalName, exact: true }).count(), 0);
        await opsPage.getByRole('button', { name: `بررسی ${pendingFile.file.originalName}`, exact: true }).click(); panel = opsPage.locator('[data-legacy-inspection]');
        const pendingDownload = opsPage.waitForEvent('download'); await panel.getByRole('button', { name: 'دریافت نسخه برای بازبینی و محاسبهٔ checksum' }).click(); assert.deepEqual(readFileSync(await (await pendingDownload).path()), pendingFile.bytes);
        await panel.getByRole('checkbox', { name: /محتوای همین نسخه/ }).check(); await panel.getByRole('button', { name: 'بررسی و اتصال نسخه به پروندهٔ QC' }).click(); dialog = opsPage.getByRole('alertdialog');
        await dialog.getByLabel('علت و مستند بررسی همین نسخه').fill('همان نسخه به پرونده فعال متصل شود؛ هنوز تأیید کیفیت نیست'); await dialog.getByRole('button', { name: 'ثبت اتصال؛ بدون انتشار' }).click();
        await opsPage.getByRole('status').filter({ hasText: 'نسخه فقط به پروندهٔ QC متصل شد' }).waitFor();
        const bound = await db.outputPublication.findFirstOrThrow({ where: { fileId: pendingFile.file.id } }); assert.equal(bound.basis, 'pending_qc'); assert.equal(bound.releasedAt, null);
        await opsPage.getByRole('link', { name: 'ادامهٔ بررسی در پروندهٔ QC' }).click(); await opsPage.getByRole('checkbox', { name: 'Content reviewed', exact: true }).check(); await opsPage.getByLabel('یادداشت کنترل کیفیت').fill('کیفیت همین فهرست نسخه بررسی و تأیید شد');
        await opsPage.getByRole('button', { name: 'تایید برای مشتری', exact: true }).click(); await opsPage.waitForURL('**/admin/qc'); assert.equal((await db.qcReview.findUniqueOrThrow({ where: { id: pendingItem.review.id } })).result, 'passed');
        assert.equal((await db.outputPublication.findUniqueOrThrow({ where: { id: bound.id } })).basis, 'qc_passed');
        assert.deepEqual(errors, []); assert.deepEqual(external, []); assert(await userPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        report.results.push({ theme, width, status: 'passed', customerHeldUntilExactRelease: true, realDownloadedBytesMatch: true, explicitHumanReasonAndChecklist: true, noChecklistStillNeedsHuman: width === 320, cancelDoesNotPublish: true, retryKeyStable: true, pendingBindingDoesNotPublish: true, realQcFinallyPublishes: true, statusReadFailureBlocksPreviouslyReleasedUi: true, modalWithinViewport: true, axeViolations: 0 });
      } finally { for (const page of [userPage, opsPage]) page.off('pageerror', onError); userPage.off('request', onGrant); await opsPage.unroute(`**/api/backend/admin/output-publications/${legacy.file.id}/review`); }
      // Normal QA pacing honors the real 30/minute Ops policy. No clock, guard,
      // identity or header spoofing and no resetting the limiter between cases.
      const remaining = 13000 - (Date.now() - startedAt); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
    report.status = 'passed'; return report;
  } catch (error) { report.status = 'failed'; report.failure = String(error.stack || error).slice(-2500); throw error; }
  finally { await customerContext?.close(); await opsContext?.close(); await browser?.close(); child.kill(); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
}
