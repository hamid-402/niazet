import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';

// UI-only acceptance: ALL API requests are fixtures, including auth, draft,
// upload and submit. No main/test DB, real users, money or provider is touched.
const serve = process.argv.includes('--serve');
const base = new URL(process.env.ZEUS_UI_BASE_URL ?? (serve ? 'http://localhost:3216' : 'http://localhost:3002'));
assert(['localhost', '127.0.0.1'].includes(base.hostname));
const root = new URL('../../../', import.meta.url);
const output = fileURLToPath(new URL('.artifacts/zeus/order-composer/', root));
mkdirSync(output, { recursive: true });
const executablePath = [process.env.PLAYWRIGHT_EXECUTABLE_PATH, chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
assert(executablePath, 'Use installed browser only; do not download one');
const serviceId = '00000000-0000-4000-8000-000000000001', draftId = '00000000-0000-4000-8000-000000000002';
const fields = [
  ['text', 'output', 'خروجی نمونه', null], ['textarea', 'notes', 'جزئیات نمونه', null],
  ['number', 'count', 'تعداد نمونه', { min: 1, max: 10 }], ['email', 'contact', 'ایمیل نمونه', null],
  ['url', 'reference', 'نشانی نمونه', null], ['date', 'date', 'تاریخ نمونه', null],
  ['select', 'format', 'قالب نمونه', ['PDF', 'TXT']], ['radio', 'size', 'اندازه نمونه', ['A4', 'A5']],
  ['checkbox', 'consent', 'تأیید نمونه', null], ['multiselect', 'channels', 'کانال نمونه', ['وب', 'موبایل']],
].map(([fieldType, fieldKey, label, options], index) => ({ id: `field-${index}`, fieldKey, label, fieldType, options, required: true }));
const service = { id: serviceId, slug: 'composer-fixture', title: 'خدمت آزمایشی فرم', category: 'design', isActive: true, pricingModel: 'manual_quote', basePrice: null, packages: [], formFields: fields };
const file = { id: 'file-composer', orderId: draftId, originalName: 'brief.txt', mimeType: 'text/plain', sizeBytes: 12, scanStatus: 'clean', fileKind: 'input' };
let server, browser, serverLogs = '';
const results = [];
try {
  if (serve) {
    assert.equal(base.port, '3216', 'Only the dedicated local acceptance port may be started');
    let occupied = false;
    try { await fetch(base, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
    assert.equal(occupied, false, 'Never replace an unrelated server');
    const require = createRequire(import.meta.url);
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', base.port], { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLogs = (serverLogs + chunk).slice(-3000); });
    let healthy = false;
    for (const deadline = Date.now() + 30000; Date.now() < deadline;) {
      assert.equal(server.exitCode, null, serverLogs);
      try { if ((await fetch(new URL('/orders/new', base), { signal: AbortSignal.timeout(2000) })).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(healthy, serverLogs);
  }
  browser = await chromium.launch({ headless: true, executablePath });
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 768, 1280, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(value => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage(), unexpected = [], errors = [], writes = [], submissions = [];
      let draft = null, version = 0, failSave = false, failSubmit = true, releaseUpload;
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), method = req.method();
        if (!url.pathname.startsWith('/api/backend/')) {
          if (url.origin !== base.origin) { unexpected.push('External ' + url.origin); return route.abort(); }
          return route.continue();
        }
        const path = url.pathname.slice('/api/backend'.length);
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (method === 'GET' && path === '/auth/me') return send({ id: 'composer-customer', role: 'customer', capabilities: [], fullName: 'مشتری آزمون رابط', phone: '09129999999', email: null });
        if (method === 'GET' && path === '/services') return send([service]);
        if (method === 'GET' && path === '/customer/orders') return send(draft ? [{ id: draftId }] : []);
        if (method === 'GET' && path === `/customer/orders/${draftId}`) return send(draft);
        if (method === 'GET' && path === '/notifications') return send([]);
        if (method === 'GET' && path === '/notifications/preferences') return send({ inAppEnabled: true, emailEnabled: false, smsEnabled: false });
        if (method === 'POST' && path === '/pricing/calculate') {
          const body = req.postDataJSON();
          return send({ policy_version: 'zeus-estimate-v1', currency: 'IRT', service_slug: service.slug, package_id: null, priority: body.priority, is_binding: false, payment_allowed: false, availability: 'not_checked', capacity_reserved: false, requires_operational_confirmation: true, status: 'quote_required', base_price: null, surcharge_pct: null, surcharge_amount: null, final_price: null });
        }
        if ((method === 'POST' && path === '/customer/orders') || (method === 'PATCH' && path === `/customer/orders/${draftId}/draft`)) {
          const body = req.postDataJSON(); writes.push({ path, body });
          assert(!('finalPrice' in body) && !('base_price' in body) && !('status' in body));
          if (failSave) { failSave = false; return send({ message: 'خطای آزمایشی ذخیره' }, 409); }
          draft = { ...body, id: draftId, code: 'UI-ONLY', status: 'draft', version: ++version, serviceLine: service, files: draft?.files ?? [], acceptanceCriteria: body.acceptanceCriteria.map(description => ({ description })) };
          return send({ id: draftId, version });
        }
        if (method === 'POST' && path === '/files/upload') {
          assert.match(req.headers()['content-type'], /^multipart\/form-data/);
          assert.match(req.postDataBuffer().toString(), /brief\.txt/);
          await new Promise(resolve => { releaseUpload = resolve; });
          draft.files.push(file); return send(file);
        }
        if (method === 'POST' && path === `/customer/orders/${draftId}/submit`) {
          submissions.push({ key: req.headers()['idempotency-key'], body: req.postData() });
          if (failSubmit) return send({ message: 'خطای آزمایشی ثبت؛ دوباره تلاش کنید.' }, 409);
          await new Promise(resolve => setTimeout(resolve, 800));
          draft = { ...draft, status: 'pending_triage', payments: [], history: [], reports: [], messages: [], tickets: [], milestones: [], assignments: [] };
          return send({ id: draftId });
        }
        unexpected.push(`${method} ${path}`); return route.abort();
      });
      const button = name => page.getByRole('button', { name, exact: true });
      const capture = async step => {
        assert.equal(await page.locator('[aria-current="step"]').count(), 1);
        assert.match(await page.locator('[aria-current="step"]').innerText(), step === 1 ? /اطلاعات/ : step === 2 ? /نیازها/ : /مرور/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations, []);
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
        await page.screenshot({ path: join(output, `${theme}-${width}-step${step}.png`), fullPage: true, animations: 'disabled' });
      };
      await page.goto(new URL('/orders/new', base).href);
      await page.getByLabel('عنوان درخواست', { exact: true }).waitFor();
      assert.equal(await button('ادامه به نیازها و فایل‌ها').isDisabled(), true);
      assert.equal(await page.getByLabel(/^شرح نیاز/).isVisible(), false);
      await page.getByRole('combobox', { name: /^نوع خدمت/ }).selectOption(serviceId);
      await page.getByLabel('عنوان درخواست', { exact: true }).fill('درخواست حفظ همه ورودی‌ها');
      await page.getByLabel(/^بودجه تقریبی/).fill('0');
      await page.getByText('پیش‌نویس ذخیره شد', { exact: true }).waitFor();
      await capture(1);
      failSave = true;
      await button('ادامه به نیازها و فایل‌ها').click();
      await page.getByRole('alert').getByText('خطای آزمایشی ذخیره').waitFor();
      assert.equal(await page.getByLabel('عنوان درخواست', { exact: true }).inputValue(), 'درخواست حفظ همه ورودی‌ها');
      await button('ادامه به نیازها و فایل‌ها').click();
      await page.getByRole('heading', { name: 'نیازها و فایل‌ها', exact: true }).waitFor();
      await button('مرور و ثبت نهایی').click();
      assert.equal(await page.locator('form').evaluate(form => form.checkValidity()), false, 'Required fields still validate; no early review');
      await page.getByLabel(/^شرح نیاز/).fill('شرح کامل نیاز برای آزمون مرورگر و حفظ پیش‌نویس');
      await page.getByLabel('خروجی نمونه', { exact: true }).fill('PDF کامل');
      await page.getByLabel('جزئیات نمونه', { exact: true }).fill('جزئیات تخصصی حفظ شود');
      await page.getByLabel('تعداد نمونه', { exact: true }).fill('2');
      await page.getByLabel('ایمیل نمونه', { exact: true }).fill('fixture@example.test');
      await page.getByLabel('نشانی نمونه', { exact: true }).fill('https://example.test');
      await page.getByLabel('تاریخ نمونه', { exact: true }).fill('2026-11-01');
      await page.getByRole('combobox', { name: /^قالب نمونه/ }).selectOption('PDF');
      await page.getByRole('radio', { name: 'A4', exact: true }).check();
      await page.getByRole('checkbox', { name: 'تأیید نمونه', exact: true }).check();
      await page.getByRole('checkbox', { name: 'وب', exact: true }).check();
      await page.getByLabel(/^معیارهای پذیرش/).fill('معیار یک\nمعیار دو');
      await page.getByText('پیش‌نویس ذخیره شد', { exact: true }).waitFor();
      await page.getByLabel('آپلود فایل ورودی', { exact: true }).setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('input fixture') });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('در حال بررسی و آپلود')));
      assert.equal(await button('مرور و ثبت نهایی').isDisabled(), true);
      assert.equal(await button('بازگشت به اطلاعات').isDisabled(), true, 'Uploading file must not be abandoned on a step change');
      releaseUpload();
      await button('brief.txt').waitFor();
      await capture(2);
      await button('بازگشت به اطلاعات').click();
      assert.equal(await page.getByLabel('عنوان درخواست', { exact: true }).inputValue(), 'درخواست حفظ همه ورودی‌ها');
      assert.equal(await page.getByLabel(/^بودجه تقریبی/).inputValue(), '0');
      await button('ادامه به نیازها و فایل‌ها').click();
      assert.equal(await page.getByLabel('خروجی نمونه', { exact: true }).inputValue(), 'PDF کامل');
      await button('brief.txt').waitFor();
      await page.reload();
      await page.getByText('آخرین پیش‌نویس شما بازیابی شد؛ می‌توانید از همان‌جا ادامه دهید.', { exact: true }).waitFor();
      await button('ادامه به نیازها و فایل‌ها').click();
      assert.equal(await page.getByLabel('خروجی نمونه', { exact: true }).inputValue(), 'PDF کامل');
      assert.equal(await page.getByLabel(/^معیارهای پذیرش/).inputValue(), 'معیار یک\nمعیار دو');
      assert.equal(await page.getByRole('checkbox', { name: 'وب', exact: true }).isChecked(), true);
      await button('brief.txt').waitFor();
      await button('مرور و ثبت نهایی').click();
      await page.getByRole('heading', { name: 'مرور نهایی درخواست', exact: true }).waitFor();
      await page.getByText('۰ تومان', { exact: true }).waitFor();
      await page.getByText('بله', { exact: true }).waitFor();
      await button('brief.txt').waitFor();
      await page.getByText('معیار یک\nمعیار دو', { exact: true }).waitFor();
      await capture(3);
      assert.equal(submissions.length, 0, 'No step, draft, upload or review makes a submit/payment');
      await button('بازگشت و ویرایش').click();
      assert.equal(await page.getByLabel('خروجی نمونه', { exact: true }).inputValue(), 'PDF کامل');
      await button('مرور و ثبت نهایی').click();
      await button('تأیید و ارسال برای بررسی').click();
      await page.getByRole('alert').getByText('خطای آزمایشی ثبت؛ دوباره تلاش کنید.').waitFor();
      assert.equal(submissions.length, 1);
      failSubmit = false;
      await button('تأیید و ارسال برای بررسی').click();
      assert.equal(await button('بازگشت و ویرایش').isDisabled(), true);
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
      await page.waitForURL(url => url.pathname === `/orders/${draftId}` && url.searchParams.get('submitted') === '1');
      assert.equal(submissions.length, 2, 'One failed attempt and one successful retry, never a duplicate in-flight submit');
      assert(submissions[0].key); assert.equal(submissions[0].key, submissions[1].key);
      assert.equal(draft.budgetHint, 0); assert.equal(draft.formResponses.count, 2);
      assert.equal(draft.files.length, 1); assert.deepEqual(draft.formResponses.channels, ['وب']);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      results.push({ theme, width, status: 'passed', steps: 3, axeScans: 3, fixtureDraftWrites: writes.length, fixtureSubmissions: submissions.length, realDbWrites: 0 });
    } catch (error) {
      const failedPage = context.pages()[0];
      if (failedPage) {
        await failedPage.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
        console.error(JSON.stringify({ theme, width, url: failedPage.url(), body: (await failedPage.locator('body').innerText()).slice(-2400) }));
      }
      throw error;
    } finally { await context.close(); }
  }
  const fileHashes = Object.fromEntries(['apps/web/src/app/(customer)/orders/new/page.tsx', 'apps/web/src/components/secure-file.tsx', 'apps/web/src/components/orbit-customer-surface.module.css'].map(path => [path, createHash('sha256').update(readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex')]));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ status: 'passed', mode: serve ? 'production-build' : 'existing-local-server', kind: 'UI-fixture-only-not-auth-or-financial-acceptance', mainDatabaseConnected: false, fullAcceptance: false, results, fileHashes }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', cases: results.length, axeScans: 24, report: join(output, 'report.json') }));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
}
