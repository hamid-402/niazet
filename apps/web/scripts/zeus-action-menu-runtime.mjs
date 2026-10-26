import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// UI-only fixtures: no credentials, live API, database or mutations. This does
// not claim that mocked authentication proves any real role/permission policy.
const base = new URL(process.env.ZEUS_UI_BASE_URL ?? 'http://127.0.0.1:3216');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Local test server only');
const artifacts = fileURLToPath(new URL('../../../.artifacts/zeus/action-menu/', import.meta.url));
mkdirSync(artifacts, { recursive: true });
const orders = [1, 2].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  code: `ZEUS-UI-${n}`, title: `سفارش آزمایشی ${n}`, status: 'in_progress',
  finalPrice: 100000 * n, createdAt: '2026-10-24T08:00:00.000Z',
  customer: { fullName: 'مشتری نمونه آزمون' },
}));
const executablePath = [
  process.env.ZEUS_BROWSER_EXECUTABLE,
  chromium.executablePath(),
  process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean).find((path) => existsSync(path));
assert(executablePath, 'No installed Chromium/Chrome/Edge found; no browser is downloaded by this test');
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
try {
  for (const theme of ['simple-light', 'simple-dark']) {
    for (const width of [320, 768, 1280, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      try {
        await context.addInitScript((value) => localStorage.setItem('niazat-theme', value), theme);
        const page = await context.newPage();
        const pageErrors = [], forbiddenRequests = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.route('**/*', async (route) => {
          const request = route.request(), url = new URL(request.url());
          const apiPath = url.pathname.startsWith('/api/backend/')
            ? url.pathname.slice('/api/backend'.length)
            : url.pathname.startsWith('/v1/') ? url.pathname.slice(3) : null;
          if (apiPath !== null) {
            if (request.method() !== 'GET') {
              forbiddenRequests.push(`${request.method()} ${apiPath}`);
              await route.abort(); return;
            }
            let body;
            if (apiPath === '/auth/me') body = { id: 'ui-fixture', role: 'admin', adminScope: 'ops_admin', capabilities: [], fullName: 'مدیر نمونه آزمون', phone: '09129999999', email: null };
            else if (apiPath === '/admin/orders') body = orders;
            else if (apiPath === '/notifications') body = [];
            else if (apiPath === '/notifications/preferences') body = { inAppEnabled: true, emailEnabled: false, smsEnabled: false };
            else { forbiddenRequests.push(`Unexpected API ${apiPath}`); await route.abort(); return; }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); return;
          }
          if (url.origin !== base.origin) {
            forbiddenRequests.push(`External ${url.origin}`); await route.abort(); return;
          }
          await route.continue();
        });
        await page.goto(new URL('/admin/orders', base).href, { waitUntil: 'networkidle', timeout: 120000 });
        const menus = page.locator('details[data-action-menu]');
        await menus.nth(1).waitFor({ state: 'visible' });
        const first = menus.nth(0), second = menus.nth(1);
        const summary = first.locator('summary'), link = first.locator('a');
        const open = (menu) => menu.evaluate((element) => element.open);
        const search = page.getByRole('searchbox');
        await summary.focus(); await summary.press('Enter');
        assert.equal(await open(first), true, 'Enter must open native disclosure');
        await page.waitForFunction(() => document.querySelector('details[data-action-menu][open] [data-action-menu-popup]')?.matches(':popover-open'));
        await summary.press('Tab');
        assert.equal(await link.evaluate((element) => element === document.activeElement), true, 'Tab must enter the real action link');
        await page.keyboard.press('Escape');
        assert.equal(await open(first), false, 'Escape must close');
        assert.equal(await summary.evaluate((element) => element === document.activeElement), true, 'Escape must restore focus');
        await summary.press('Space');
        assert.equal(await open(first), true, 'Space must open');
        await search.click();
        assert.equal(await open(first), false, 'Outside pointer must close');
        assert.equal(await search.evaluate((element) => element === document.activeElement), true, 'Outside pointer must not steal focus');
        // A normal dropdown may cover the next row. Switch with the real
        // keyboard focus path instead of force-clicking through its content.
        await summary.click(); await second.locator('summary').focus();
        await second.locator('summary').press('Enter');
        assert.equal(await open(first), false, 'Moving to another menu closes the first');
        assert.equal(await open(second), true);
        await second.locator('summary').press('Escape');
        await summary.click(); await link.focus(); await page.keyboard.press('Tab');
        assert.equal(await open(first), false, 'Leaving with Tab closes');
        await summary.click();
        assert.equal(await link.getAttribute('href'), `/admin/orders/${orders[0].id}`, 'Original action target retained');
        await page.waitForFunction(() => document.querySelector('details[data-action-menu][open] [data-action-menu-popup]')?.matches(':popover-open'));
        assert.equal(await link.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return box.x >= 0 && box.right <= document.documentElement.clientWidth
            && box.y >= 0 && box.bottom <= innerHeight
            && (hit === element || element.contains(hit));
        }), true, 'Popup link must fit the viewport and be hit-testable, not clipped by a card');
        const axe = await new AxeBuilder({ page }).include('details[data-action-menu]').analyze();
        assert.deepEqual(axe.violations, [], 'Action menu accessibility');
        await page.screenshot({ path: `${artifacts}/${theme}-${width}.png`, fullPage: true });
        await page.reload({ waitUntil: 'networkidle' });
        await menus.nth(1).waitFor({ state: 'visible' });
        assert.equal(await open(first), false, 'Disclosure not unexpectedly persisted');
        await first.locator('summary').click(); await search.click();
        assert.equal(await open(first), false, 'Listener works after remount');
        assert.deepEqual(forbiddenRequests, [], 'No live/external/mutating API calls');
        assert.deepEqual(pageErrors, [], 'No page exceptions');
        results.push({ theme, width, status: 'passed', axeViolations: 0 });
      } finally { await context.close(); }
    }
  }
  writeFileSync(`${artifacts}/report.json`, `${JSON.stringify({ scope: 'UI fixture only; not auth/permission/financial acceptance', results }, null, 2)}\n`);
  console.log(`Zeus ActionMenu passed: ${results.length} theme/viewport cases; keyboard, outside focus, switching, remount and Axe; no live API writes.`);
} finally { await browser.close(); }
