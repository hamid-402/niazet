import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Actual pricing HTTP module + real catalog/guards, with read-only Prisma
// fixtures. All browser auth/order writes are intercepted UI fixtures, never
// real accounts/orders/DB. This is not a real authentication acceptance test.
const api = createRequire(new URL('../../api/package.json', import.meta.url));
api('reflect-metadata');
const { Test } = api('@nestjs/testing');
const { ValidationPipe } = api('@nestjs/common');
const { APP_GUARD } = api('@nestjs/core');
const { PricingModule } = api('./dist/pricing/pricing.module.js');
const { PrismaModule } = api('./dist/prisma/prisma.module.js');
const { PrismaService } = api('./dist/prisma/prisma.service.js');
const { JwtAuthGuard } = api('./dist/common/guards/jwt-auth.guard.js');
const { RateLimitGuard } = api('./dist/common/guards/rate-limit.guard.js');
const base = new URL(process.env.ZEUS_UI_BASE_URL ?? 'http://127.0.0.1:3216');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Local test server only');
const artifacts = fileURLToPath(new URL('../../../.artifacts/zeus/price-estimate/', import.meta.url));
mkdirSync(artifacts, { recursive: true });
const id = '00000000-0000-4000-8000-000000000001';
const packageId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const draftId = '00000000-0000-4000-8000-000000000004';
const services = [
  { id, slug: 'design', title: 'خدمت ثابت نمونه', category: 'design', isActive: true, pricingModel: 'fixed', basePrice: 101, packages: [{ id: packageId, serviceId: id, name: 'بسته نمونه', price: 201, isActive: true }], formFields: [{ id: 'field-1', fieldKey: 'output', label: 'خروجی نمونه', fieldType: 'text', required: true, options: null }] },
  { id: otherId, slug: 'negotiated', title: 'خدمت توافقی نمونه', category: 'design', isActive: true, pricingModel: 'manual_quote', basePrice: 999999, packages: [], formFields: [] },
];
const executablePath = [process.env.ZEUS_BROWSER_EXECUTABLE, chromium.executablePath(), process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean).find((path) => existsSync(path));
assert(executablePath, 'No installed browser; this test never downloads one');
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
try {
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 768, 1280, 1920]) {
    const reads = [];
    const testingModule = await Test.createTestingModule({
      imports: [PrismaModule, PricingModule],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RateLimitGuard }],
    }).overrideProvider(PrismaService).useValue({ serviceLine: { findUnique: async (query) => {
      reads.push(query);
      return services.find((service) => service.slug === query.where.slug) ?? null;
    } } }).compile();
    const app = testingModule.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const apiBase = await app.getUrl();
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript((value) => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage();
      const unexpected = [], pageErrors = [], pricingCalls = [], draftWrites = [], submissions = [];
      let failNext = 0, invalidNext = false, version = 1, delayed = false;
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.route('**/*', async (route) => {
        const req = route.request(), url = new URL(req.url());
        if (!url.pathname.startsWith('/api/backend/')) {
          if (url.origin !== base.origin) { unexpected.push(`External ${url.origin}`); await route.abort(); }
          else await route.continue();
          return;
        }
        const path = url.pathname.slice('/api/backend'.length);
        const method = req.method();
        const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/pricing/calculate' && method === 'POST') {
          const body = req.postDataJSON();
          assert.deepEqual(Object.keys(body).sort(), body.packageId ? ['packageId', 'priority', 'serviceSlug'] : ['priority', 'serviceSlug']);
          assert.equal(req.headers().authorization, undefined, 'Public estimate never attaches access token');
          pricingCalls.push(body);
          if (failNext) { const code = failNext; failNext = 0; await fulfill({ message: 'Fixture error' }, code); return; }
          const response = await route.fetch({ url: `${apiBase}/v1/pricing/calculate` });
          assert.equal(response.status(), 200, 'Real pricing HTTP must succeed');
          const data = await response.json();
          if (invalidNext) { invalidNext = false; data.payment_allowed = true; }
          if (delayed) { delayed = false; await new Promise((resolve) => setTimeout(resolve, 1000)); }
          await fulfill(data); return;
        }
        if (method === 'GET' && path === '/auth/me') { await fulfill({ id: 'customer-fixture', role: 'customer', capabilities: [], fullName: 'مشتری نمونه', phone: '09129999999', email: null }); return; }
        if (method === 'GET' && path === '/services') { await fulfill(services); return; }
        if (method === 'GET' && path === '/customer/orders') { await fulfill([]); return; }
        if (method === 'GET' && path === '/notifications') { await fulfill([]); return; }
        if (method === 'GET' && path === '/notifications/preferences') { await fulfill({ inAppEnabled: true, emailEnabled: false, smsEnabled: false }); return; }
        if ((method === 'POST' && path === '/customer/orders') || (method === 'PATCH' && path === `/customer/orders/${draftId}/draft`)) {
          const body = req.postDataJSON();
          draftWrites.push(body);
          assert(!('final_price' in body) && !('base_price' in body) && !('priority' in body) && !('estimate' in body), 'Estimate never contaminates order payload');
          await fulfill({ id: draftId, version: ++version }); return;
        }
        if (method === 'POST' && path === `/customer/orders/${draftId}/submit`) {
          submissions.push({ body: req.postData(), key: req.headers()['idempotency-key'] });
          await fulfill({ id: draftId }); return;
        }
        unexpected.push(`${method} ${path}`); await route.abort();
      });
      await page.goto(new URL('/orders/new', base).href, { waitUntil: 'networkidle', timeout: 120000 });
      const service = page.getByRole('combobox', { name: /^نوع خدمت/ });
      const urgency = page.getByRole('combobox', { name: /^فوریت/ });
      const packages = page.getByRole('combobox', { name: /^پکیج \(اختیاری\)/ });
      await service.waitFor({ timeout: 8000 }).catch(async (error) => {
        console.error(JSON.stringify({ url: page.url(), unexpected, pageErrors, body: (await page.locator('body').innerText()).slice(0, 1800), labels: await page.locator('label').allTextContents() }));
        await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true });
        throw error;
      });
      assert.equal(pricingCalls.length, 0, 'No service means no calculation');
      await service.selectOption(id);
      const estimate = page.locator('[data-price-estimate]');
      const total = estimate.locator('[data-estimate-total]');
      await total.waitFor();
      assert.match(await total.innerText(), /۱۰۱ تومان/);
      await urgency.selectOption('urgent');
      await page.waitForFunction(() => document.querySelector('[data-estimate-total]')?.textContent?.includes('۱۳۱'));
      await packages.selectOption(packageId);
      await page.waitForFunction(() => document.querySelector('[data-estimate-total]')?.textContent?.includes('۲۶۱'));
      assert.equal(await page.getByLabel(/^بودجه تقریبی \(اختیاری\)/).inputValue(), '', 'Estimate never fills budget');
      await page.getByLabel('عنوان درخواست', { exact: true }).fill('درخواست آزمایشی حفظ فرم');
      await page.getByLabel(/^شرح نیاز/).fill('توضیحات کافی برای آزمون فرم واقعی و حفظ جریان ثبت درخواست');
      await page.getByLabel('خروجی نمونه', { exact: true }).fill('PDF');
      const axe = await new AxeBuilder({ page }).include('[data-price-estimate]').analyze();
      assert.deepEqual(axe.violations, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
      await estimate.screenshot({ path: `${artifacts}/${theme}-${width}.png` });

      const callsBeforeUnsupported = pricingCalls.length;
      for (const value of ['high', 'low']) {
        await urgency.selectOption(value);
        await estimate.locator('[data-estimate-state="unsupported"]').waitFor();
        assert.equal(await total.count(), 0, 'No stale numeric price for unsupported urgency');
      }
      assert.equal(pricingCalls.length, callsBeforeUnsupported, 'No invented API priority');
      assert.deepEqual(await urgency.locator('option').evaluateAll((items) => items.map((item) => item.value)), ['low', 'normal', 'high', 'urgent'], 'All existing options preserved, no premature same_day');

      failNext = 503;
      await urgency.selectOption('normal');
      await estimate.locator('[data-estimate-state="error"]').waitFor();
      assert.equal(await total.count(), 0);
      assert.equal(await page.getByLabel('عنوان درخواست', { exact: true }).inputValue(), 'درخواست آزمایشی حفظ فرم');
      assert.equal(await page.getByRole('button', { name: 'مرور و ثبت نهایی', exact: true }).isEnabled(), true);
      await estimate.getByRole('button', { name: 'تلاش دوباره برای برآورد' }).click();
      await total.waitFor();
      failNext = 429;
      await urgency.selectOption('urgent');
      await estimate.getByText('درخواست‌های برآورد زیاد شده است؛ یک دقیقه بعد دوباره تلاش کنید.').waitFor();
      await estimate.getByRole('button', { name: 'تلاش دوباره برای برآورد' }).click();
      await total.waitFor();
      invalidNext = true;
      await packages.selectOption('');
      await estimate.locator('[data-estimate-state="error"]').waitFor();
      assert.equal(await total.count(), 0, 'Inconsistent/binding response must not be shown');
      await estimate.getByRole('button', { name: 'تلاش دوباره برای برآورد' }).click();
      await total.waitFor();

      // Old response must not revive the price after selection is invalidated.
      delayed = true;
      const started = page.waitForRequest((req) => req.url().endsWith('/pricing/calculate'));
      await packages.selectOption(packageId);
      await started;
      await urgency.selectOption('high');
      await estimate.locator('[data-estimate-state="unsupported"]').waitFor();
      await page.waitForTimeout(1200);
      assert.equal(await total.count(), 0, 'Late response cannot restore an obsolete price');

      await urgency.selectOption('normal');
      await total.waitFor();
      await page.getByRole('button', { name: 'مرور و ثبت نهایی', exact: true }).click();
      await page.getByRole('heading', { name: 'مرور نهایی درخواست' }).waitFor();
      await total.waitFor();
      assert.match(await total.innerText(), /۲۰۱ تومان/);
      await page.getByRole('button', { name: 'بازگشت و ویرایش', exact: true }).click();
      await page.getByLabel('عنوان درخواست', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('خروجی نمونه', { exact: true }).inputValue(), 'PDF');

      await service.selectOption(otherId);
      await estimate.getByText('نیازمند بررسی و اعلام قیمت؛ مبلغ قطعی برای این انتخاب موجود نیست.').waitFor();
      assert.equal(await total.count(), 0, 'Negotiated service never shows placeholder price');
      await service.selectOption('');
      assert.equal(await estimate.count(), 0);
      assert.equal(submissions.length, 0, 'Preview/review/retry never submits an order or payment');
      assert(draftWrites.length > 0, 'Existing autosave/review used real form handlers with intercepted writes');
      assert(reads.length > 0, 'Real pricing module used read-only Prisma fixture');
      assert.deepEqual(unexpected, []);
      assert.deepEqual(pageErrors, []);
      results.push({ theme, width, status: 'passed', axeViolations: 0, pricingRequests: pricingCalls.length, catalogReads: reads.length, draftFixtureWrites: draftWrites.length, realDbWrites: 0 });
    } finally { await context.close(); await app.close(); }
  }
  writeFileSync(`${artifacts}/report.json`, JSON.stringify({ status: 'passed', kind: 'real-pricing-http-with-read-only-prisma-and-ui-auth-order-fixtures', fullAcceptance: false, results }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', cases: results.length, axeScans: results.length, report: `${artifacts}/report.json` }));
} finally { await browser.close(); }
