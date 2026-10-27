import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// Production UI fixtures only. All API traffic is intercepted, never main DB.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('../../../.artifacts/zeus/z3-commercial-ui/', import.meta.url));
mkdirSync(output, { recursive: true });
const base = 'http://localhost:3109';
const child = spawn(process.execPath, ['apps/web/node_modules/next/dist/bin/next', 'start', 'apps/web', '--port', '3109', '--hostname', '127.0.0.1'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; child.stdout.on('data', b => serverLog = (serverLog + b).slice(-2000)); child.stderr.on('data', b => serverLog = (serverLog + b).slice(-2000));
let browser;
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw new Error(serverLog); try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
  assert(ready, serverLog);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 768, 1280, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(value => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage(), unexpected = [], errors = [], writes = [];
      let mode = 'normal';
      const offer = { id: 'revision-1', sequence: 1, fingerprint: 'a'.repeat(64), priority: 'normal', currency: 'IRT', base_price: 101, surcharge_pct: 0, surcharge_amount: 0, final_price: 101, issuedAt: '2026-10-27T09:30:00.000Z', expiresAt: '2026-10-27T09:45:00.000Z', proposedDeadlineAt: '2026-10-28T09:30:00.000Z', deadlineNormal: '2026-10-28T09:30:00.000Z', durationMode: 'elapsed_minutes', acceptedAt: null, deadlineAt: null, payableUntil: null, invalidatedAt: null, paymentAllowed: false, financialReviewRequired: false, reservation: null };
      let commercial = { ...offer };
      const order = { id: 'commercial-order', code: 'UI-ONLY', title: 'آزمون نمایشی قرارداد قیمت و مهلت', briefDescription: 'داده فقط نمایشی است.', status: 'quoted', finalPrice: 101, revisionsUsed: 0, revisionsAllowed: 2, createdAt: '2026-10-27T09:30:00Z', serviceLine: { pricingModel: 'fixed', title: 'خدمت آزمایشی' }, publicHandlers: [], milestones: [], acceptanceCriteria: [], files: [], reports: [], messages: [], payments: [], escrowHolds: [], tickets: [] };
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (!url.pathname.startsWith('/api/backend/')) { if (url.origin !== base) { unexpected.push('External ' + url.origin); await route.abort(); } else await route.continue(); return; }
        const path = url.pathname.slice('/api/backend'.length);
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/me') return send({ id: 'commercial-ui-customer', role: 'customer', capabilities: [], fullName: 'آزمون نمایشی مشتری', phone: '09129999999' });
        if (path === '/notifications') return send([]);
        if (path === '/notifications/preferences') return send({ inAppEnabled: true, emailEnabled: false, smsEnabled: false });
        if (path === '/customer/orders') return send([order]);
        if (path === '/customer/wallet/top-ups' && method === 'GET') return send([]);
        if (path === '/customer/wallet' && method === 'GET') return send({ balance: 1000, currency: 'IRT', transactions: [] });
        if (path === '/customer/orders/commercial-order' && method === 'GET') return send(order);
        if (path === '/customer/orders/commercial-order/commercial' && method === 'GET') return send(mode === 'malformed' ? {} : commercial);
        if (method === 'POST') {
          writes.push({ path, key: request.headers()['idempotency-key'], body: request.postData() ? request.postDataJSON() : null });
          if (path.endsWith('/commercial/offers/revision-1/accept')) {
            assert.deepEqual(request.postDataJSON(), { fingerprint: offer.fingerprint });
            commercial = { ...offer, acceptedAt: '2026-10-27T09:31:00.000Z', deadlineAt: offer.proposedDeadlineAt, payableUntil: offer.expiresAt, paymentAllowed: true };
            order.status = 'pending_payment'; return send(commercial, 201);
          }
          if (path.endsWith('/commercial/offers')) { assert.deepEqual(request.postDataJSON(), { priority: 'same_day' }); return send({ message: 'ظرفیت همان‌روز در دسترس نیست؛ اولویت خودکار عوض نمی‌شود.' }, 409); }
          if (path.endsWith('/pay-from-wallet')) { assert.deepEqual(request.postDataJSON(), {}); order.status = 'paid'; commercial.paymentAllowed = false; return send({ fullyPaid: true }, 201); }
        }
        unexpected.push(method + ' ' + path); await route.abort();
      });
      await page.goto(base + '/orders/commercial-order?submitted=1');
      const panel = page.locator('[data-commercial-order]'); await panel.getByRole('heading', { name: 'قیمت قطعی و مهلت سفارش' }).waitFor();
      assert.equal(writes.length, 0); assert.equal(await page.getByRole('tab').count(), 7);
      assert.equal(await page.getByRole('button', { name: 'تایید قیمت و ادامه به پرداخت', exact: true }).count(), 0);
      assert.equal(await panel.getByRole('button', { name: /از موجودی/ }).count(), 0);
      const accept = panel.getByRole('button', { name: 'بررسی و پذیرش این قیمت و مهلت' });
      await accept.click(); let dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: 'انصراف' }).click(); assert.equal(writes.length, 0);
      await accept.click(); commercial.fingerprint = 'b'.repeat(64);
      await dialog.getByRole('button', { name: 'پذیرش همین نسخه' }).click(); await dialog.getByRole('alert').waitFor(); assert.equal(writes.length, 0, 'Changed fingerprint cannot be accepted');
      await dialog.getByRole('button', { name: 'انصراف' }).click(); commercial.fingerprint = offer.fingerprint;
      await panel.getByRole('button', { name: 'بازخوانی قرارداد' }).click(); await accept.click();
      await dialog.getByRole('button', { name: 'پذیرش همین نسخه' }).click();
      const payment = page.getByTestId('zeus-wallet-order-payment'), walletButton = payment.getByRole('button', { name: /از موجودی/ });
      await walletButton.waitFor(); await walletButton.click(); dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: 'انصراف' }).click(); assert.equal(writes.length, 1);
      let axe = await new AxeBuilder({ page }).analyze(); assert.deepEqual(axe.violations, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${output}/${theme}-${width}-accepted.png`, fullPage: true });
      // Fresh server revocation must block the old open wallet confirmation.
      await walletButton.click(); commercial.paymentAllowed = false;
      await dialog.getByRole('button', { name: 'تأیید و پرداخت از موجودی' }).click(); await dialog.getByRole('alert').waitFor();
      assert.equal(writes.filter(w => w.path.endsWith('/pay-from-wallet')).length, 0);
      await dialog.getByRole('button', { name: 'انصراف' }).click(); commercial.paymentAllowed = true;
      await panel.getByRole('button', { name: 'بازخوانی قرارداد' }).click();
      await walletButton.click(); await dialog.getByRole('button', { name: 'تأیید و پرداخت از موجودی' }).click(); await payment.waitFor({ state: 'detached' });
      assert.equal(writes.filter(w => w.path.endsWith('/pay-from-wallet')).length, 1);
      assert(writes.every(w => typeof w.key === 'string' && w.key.length > 0));
      commercial = { ...offer }; order.status = 'quoted'; await page.reload(); await accept.waitFor();
      await panel.locator('summary').click(); await panel.getByLabel('اولویت پیشنهادی').selectOption('same_day');
      await panel.getByRole('button', { name: 'دریافت پیشنهاد قیمت و مهلت' }).click(); await panel.getByRole('alert').waitFor();
      assert.equal(await panel.getByLabel('اولویت پیشنهادی').inputValue(), 'same_day'); assert.equal(writes.filter(w => w.path.endsWith('/commercial/offers')).length, 1);
      mode = 'malformed'; await panel.getByRole('button', { name: 'بازخوانی قرارداد' }).click(); await panel.getByRole('alert').filter({ hasText: 'اطلاعات قرارداد قیمت معتبر نیست' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'تایید قیمت و ادامه به پرداخت', exact: true }).count(), 0);
      assert(await accept.isDisabled()); assert.equal(writes.length, 3);
      axe = await new AxeBuilder({ page }).analyze(); assert.deepEqual(axe.violations, []); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      results.push({ theme, width, status: 'passed', noWriteOnRenderOrCancel: true, fingerprintBoundAcceptance: true, freshPaymentRevocationBlocksWrite: true, oneExplicitWalletPayment: true, noCapacityFallback: true, malformedContractFailsClosed: true, sevenExistingTabsPreserved: true, axeViolations: 0 });
    } finally { await context.close(); }
  }
} finally { await browser?.close(); child.kill(); }
writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'passed', uiFixturesOnly: true, mainDatabaseTouched: false, results }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', cases: results.length, mainDatabaseTouched: false }));
