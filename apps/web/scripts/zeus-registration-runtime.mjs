import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// UI fixture only: every backend request is intercepted. Real JWT/OTP/DB
// acceptance is separate in zeus-wallet-postgres.mjs; no main DB writes here.
const require = createRequire(import.meta.url);
const web = fileURLToPath(new URL('../', import.meta.url));
const base = 'http://localhost:3216';
const output = fileURLToPath(new URL('../../../.artifacts/zeus/registration/', import.meta.url));
mkdirSync(output, { recursive: true });
let occupied = false;
try { await fetch(base, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
assert.equal(occupied, false, 'Do not replace/reuse an unrelated server on 3216');
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', '3216'], { cwd: web, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser;
server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-4000); });
server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-4000); });
const results = [];
try {
  let healthy = false;
  for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
    assert.equal(server.exitCode, null, logs);
    try { if ((await fetch(base + '/register')).ok) { healthy = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(healthy, logs);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(value => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage(), unexpected = [], errors = [], writes = [];
      let startCount = 0, verifyCount = 0, signedIn = false;
      const attempt = '6c355310-e54c-4b49-8c8d-becb723d7072';
      const phone = '09129999998', password = 'FixtureOnly!123', fullName = 'کاربر آزمون رابط';
      const user = { id: 'ui-registration', role: 'customer', fullName, phone, email: null, capabilities: [] };
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (!url.pathname.startsWith('/api/backend/')) {
          if (url.origin === base) return route.continue();
          unexpected.push('External ' + url.origin); return route.abort();
        }
        const path = url.pathname.slice('/api/backend'.length), method = request.method();
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/me') return signedIn ? send(user) : send({ message: 'guest fixture' }, 401);
        if (path === '/auth/refresh') return send({ message: 'guest fixture' }, 401);
        if (method === 'POST') writes.push({ path, body: request.postDataJSON() });
        if (path === '/auth/register') {
          assert.deepEqual(request.postDataJSON(), { phone, password, fullName });
          startCount++;
          // First response simulates an obsolete server; UI must fail closed.
          return send({ message: 'fixture', ...(startCount > 1 ? { registrationAttemptId: attempt } : {}) }, 201);
        }
        if (path === '/auth/otp/verify') {
          assert.deepEqual(request.postDataJSON(), { phone, password, fullName, code: '123456', purpose: 'register', registrationAttemptId: attempt });
          if (++verifyCount === 1) return send({ message: 'خطای آزمایشی کد' }, 400);
          signedIn = true; return send({ accessToken: 'ui-only-not-a-real-jwt', user }, 201);
        }
        if (path === '/customer/orders' || path === '/notifications') return send([]);
        if (path === '/notifications/preferences') return send({ inAppEnabled: true, emailEnabled: false, smsEnabled: false });
        unexpected.push(method + ' ' + path); return route.abort();
      });
      await page.goto(base + '/register');
      await page.getByLabel('نام نمایشی', { exact: true }).fill(fullName);
      await page.getByLabel('شماره موبایل', { exact: true }).fill(phone);
      await page.getByLabel(/^رمز عبور \(اختیاری\)/).fill(password);
      assert.equal(writes.length, 0, 'No signup on render');
      await page.getByRole('button', { name: 'ادامه', exact: true }).click();
      await page.getByText('شناسهٔ امن ثبت‌نام دریافت نشد؛ دوباره تلاش کنید.').waitFor();
      assert.equal(await page.getByLabel('کد تایید', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'ادامه', exact: true }).click();
      await page.getByLabel('کد تایید', { exact: true }).fill('123456');
      await page.getByRole('button', { name: 'تایید و ورود', exact: true }).click();
      await page.getByText('خطای آزمایشی کد', { exact: true }).waitFor();
      assert.equal(startCount, 2, 'Only two explicit registration submissions before correction');
      await page.getByRole('button', { name: 'اصلاح اطلاعات یا دریافت کد تازه', exact: true }).click();
      assert.equal(await page.getByLabel('نام نمایشی', { exact: true }).inputValue(), fullName);
      assert.equal(startCount, 2, 'Editing does not silently resend: ' + JSON.stringify(writes.map(w => w.path)));
      await page.getByRole('button', { name: 'ادامه', exact: true }).click();
      await page.getByLabel('کد تایید', { exact: true }).fill('123456');
      assert.deepEqual((await new AxeBuilder({ page }).include('#main-content').analyze()).violations, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      const persisted = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert(!persisted.includes(password) && !persisted.includes(attempt), 'No credential/challenge persistence');
      await page.screenshot({ path: `${output}/${theme}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'تایید و ورود', exact: true }).click();
      await page.waitForURL('**/dashboard');
      await page.getByRole('heading', { name: 'میز کار', exact: true }).waitFor();
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      results.push({ theme, width, status: 'passed', failClosedOnMissingChallenge: true, retryAndCorrection: true, proofPayload: true, noCredentialPersistence: true, axeViolations: 0 });
    } finally { await context.close(); }
  }
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { server.kill(); await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
}
writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'passed', uiFixturesOnly: true, mainDatabaseTouched: false, results }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', cases: results.length, axeScans: results.length, uiFixturesOnly: true, mainDatabaseTouched: false }));
