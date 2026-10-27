import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// UI-only fixture acceptance. EVERY backend request is intercepted before the
// first navigation; never authenticates/writes to the main DB. Real backend
// JWT/financial acceptance is scripts/acceptance/zeus-wallet-postgres.mjs.
const base = 'http://localhost:3002';
const output = fileURLToPath(new URL('../../../.artifacts/zeus/wallet/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const results = [];
try {
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(value => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage();
      const unexpected = [], errors = [], writes = [];
      let balance = 100, failedVerifications = 2;
      const intents = [];
      const order = { id: 'ui-order', code: 'UI-ONLY', title: 'سفارش آزمون نمایشی', briefDescription: 'این داده فقط fixture مرورگر است.', status: 'pending_payment', finalPrice: 50, revisionsUsed: 0, revisionsAllowed: 2, createdAt: '2026-10-25T08:00:00Z', publicHandlers: [], milestones: [], acceptanceCriteria: [], files: [], reports: [], messages: [], payments: [], escrowHolds: [], tickets: [] };
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (!url.pathname.startsWith('/api/backend/')) { if (url.origin !== base) { unexpected.push('External ' + url.origin); await route.abort(); } else await route.continue(); return; }
        const path = url.pathname.slice('/api/backend'.length), method = request.method();
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (method !== 'GET') writes.push({ path, key: request.headers()['idempotency-key'], body: request.postDataJSON() });
        if (path === '/auth/me') return send({ id: 'ui-only', role: 'customer', capabilities: [], fullName: 'آزمون نمایشی', phone: '09129999999', email: null });
        if (path === '/customer/orders') return send([]);
        if (method === 'GET' && path.endsWith('/commercial')) return send(null);
        if (path === '/notifications') return send([]);
        if (path === '/notifications/preferences') return send({ inAppEnabled: true, emailEnabled: false, smsEnabled: false });
        if (method === 'GET' && path === '/customer/wallet/top-ups') return send(intents);
        if (method === 'GET' && path === '/customer/wallet') return send({ balance, currency: 'IRT', transactions: [] });
        if (path === '/customer/finance/overview') return send({ summary: { walletBalance: balance, totalPaid: 0, totalHeld: 0, totalRefunded: 0, pendingPaymentCount: 1 }, wallet: { balance, currency: 'IRT', transactions: [] }, payments: [], escrows: [], refunds: [], invoices: [], ordersNeedingPayment: [] });
        if (method === 'POST' && path === '/customer/wallet/top-ups') { assert.deepEqual(request.postDataJSON(), { amount: 100 }); intents.push({ id: 'ui-intent', amount: 100, status: 'verifying', createdAt: '2026-10-25T08:00:00Z' }); return send({ id: 'ui-intent', status: 'verifying' }, 201); }
        if (method === 'POST' && path === '/customer/wallet/top-ups/ui-intent/verify') { if (failedVerifications-- > 0) return send({ message: 'خطای آزمایشی قابل تلاش مجدد' }, 500); balance += 100; intents[0].status = 'succeeded'; return send({ status: 'succeeded' }, 201); }
        if (method === 'GET' && path === '/customer/orders/ui-order') return send(order);
        if (method === 'POST' && path === '/customer/orders/ui-order/pay-from-wallet') { assert.deepEqual(request.postDataJSON(), {}); balance -= 50; order.status = 'paid'; return send({ fullyPaid: true }, 201); }
        unexpected.push(method + ' ' + path); await route.abort();
      });
      await page.goto(base + '/wallet');
      const funding = page.getByTestId('zeus-wallet-funding');
      try { await funding.getByRole('button', { name: 'ایجاد درخواست شارژ آزمایشی' }).waitFor({ timeout: 10000 }); }
      catch (cause) { console.error(JSON.stringify({ url: page.url(), errors, unexpected, text: (await page.locator('body').innerText()).slice(0, 1800) })); throw cause; }
      assert.equal(writes.length, 0, 'No credit/verify on render');
      await funding.getByLabel('مبلغ شارژ به تومان').fill('۱۰۰');
      await funding.getByRole('button', { name: 'ایجاد درخواست شارژ آزمایشی' }).click();
      await funding.getByRole('button', { name: 'بررسی و تأیید شارژ' }).click();
      let dialog = page.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'انصراف' }).click();
      assert.equal(writes.filter(w => w.path.endsWith('/verify')).length, 0);
      await funding.getByRole('button', { name: 'بررسی و تأیید شارژ' }).click();
      await dialog.getByRole('button', { name: 'ثبت اعتبار آزمایشی' }).click();
      await dialog.getByRole('alert').waitFor();
      assert.equal(balance, 100); assert.equal(await dialog.count(), 1, 'Error preserves modal');
      await dialog.getByRole('button', { name: 'ثبت اعتبار آزمایشی' }).click();
      await funding.getByRole('status').filter({ hasText: 'با موفقیت' }).waitFor();
      assert.equal(balance, 200);
      const verificationKeys = writes.filter(w => w.path.endsWith('/verify')).map(w => w.key);
      assert.equal(new Set(verificationKeys).size, 1, 'Same key across request retry and error retry');
      let axe = await new AxeBuilder({ page }).include('[data-testid="zeus-wallet-funding"]').analyze(); assert.deepEqual(axe.violations, []);
      await funding.screenshot({ path: `${output}/${theme}-${width}-funding.png` });
      await page.goto(base + '/orders/ui-order');
      const payment = page.getByTestId('zeus-wallet-order-payment');
      await payment.getByRole('button', { name: /از موجودی/ }).click();
      dialog = page.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'انصراف' }).click();
      assert.equal(writes.filter(w => w.path.endsWith('/pay-from-wallet')).length, 0);
      await payment.getByRole('button', { name: /از موجودی/ }).click();
      axe = await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze(); assert.deepEqual(axe.violations, []);
      assert(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().left >= 0));
      await page.screenshot({ path: `${output}/${theme}-${width}-payment.png`, fullPage: true });
      await dialog.getByRole('button', { name: 'تأیید و پرداخت از موجودی' }).click();
      await payment.waitFor({ state: 'detached' });
      assert.equal(balance, 150); assert.equal(writes.filter(w => w.path.endsWith('/pay-from-wallet')).length, 1);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      results.push({ theme, width, status: 'passed', noFinancialWriteOnRenderOrCancel: true, retryKeyStable: true, axeViolations: 0 });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'passed', uiFixturesOnly: true, mainDatabaseTouched: false, results }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', cases: results.length, mainDatabaseTouched: false, realFinancialAuthAcceptance: 'separate isolated Postgres/HTTP runner' }));
