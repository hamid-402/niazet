import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// Every backend request is intercepted. This validates UI, never the main DB.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('../../../.artifacts/zeus/z3-qc-ui/', import.meta.url));
mkdirSync(output, { recursive: true });
const base = 'http://localhost:3108';
const child = spawn(process.execPath, ['apps/web/node_modules/next/dist/bin/next', 'start', 'apps/web', '--port', '3108', '--hostname', '127.0.0.1'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; child.stdout.on('data', b => serverLog = (serverLog + b).slice(-2000)); child.stderr.on('data', b => serverLog = (serverLog + b).slice(-2000));
let browser;
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw new Error(serverLog); try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
  assert(ready, serverLog);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  for (const theme of ['simple-light', 'simple-dark']) for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(value => localStorage.setItem('niazat-theme', value), theme);
      const page = await context.newPage(), unexpected = [], errors = [], writes = [];
      let failDecision = true;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (!url.pathname.startsWith('/api/backend/')) { if (url.origin !== base) { unexpected.push('External ' + url.origin); await route.abort(); } else await route.continue(); return; }
        const path = url.pathname.slice('/api/backend'.length);
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/auth/me') return send({ id: 'qc-ui-ops', role: 'admin', adminScope: 'ops_admin', capabilities: [], fullName: 'آزمون نمایشی عملیات', phone: '09129999999' });
        if (path === '/notifications') return send([]);
        if (path === '/notifications/preferences') return send({ inAppEnabled: true, emailEnabled: false, smsEnabled: false });
        if (['/admin/qc', '/admin/qc/queue'].includes(path) && method === 'GET') return send([]);
        const detail = path.match(/^\/admin\/qc\/(empty|legacy-fixture|checklist)$/);
        if (detail && method === 'GET') { const id = detail[1]; return send({ id, comment: null, publicationManifest: { fingerprint: 'a'.repeat(64), requiresManualBinding: id === 'legacy-fixture', versions: [] }, order: { code: 'UI-ONLY', title: 'پرونده آزمایشی کنترل کیفیت', briefDescription: 'فقط داده نمایشی مرورگر؛ بدون اتصال به داده اصلی', files: [], serviceLine: { qcChecklistTemplates: id === 'checklist' ? [{ items: [{ id: 'check-1', label: 'کیفیت محتوای خروجی' }] }] : [] } } }); }
        if (method === 'POST' && /^\/admin\/qc\/(empty|checklist)\/approve$/.test(path)) {
          const body = request.postDataJSON(); writes.push({ path, body });
          assert.equal(body.manifestFingerprint, 'a'.repeat(64));
          if (path.includes('/empty/')) { assert.equal(body.outputReviewed, true); assert(body.comment.trim().length >= 3); assert.deepEqual(body.items, []); }
          else { assert.deepEqual(body.items, [{ checklistItemId: 'check-1', passed: true }]); assert.equal(body.outputReviewed, undefined); }
          if (failDecision) return send({ message: 'خطای نمایشی؛ یادداشت و انتخاب بازبین باید حفظ شوند.' }, 400);
          return send({ result: 'passed' }, 201);
        }
        unexpected.push(method + ' ' + path); await route.abort();
      });
      await page.goto(base + '/admin/qc/empty');
      const approve = page.getByRole('button', { name: 'تایید برای مشتری' }), human = page.getByRole('checkbox'), comment = page.getByLabel('یادداشت کنترل کیفیت');
      await approve.waitFor(); assert(await approve.isDisabled()); assert.equal(writes.length, 0);
      await comment.fill('بازبینی واقعی خروجی همین پرونده'); assert(await approve.isDisabled());
      await human.check(); await comment.fill('  '); assert(await approve.isDisabled());
      await comment.fill('بازبینی واقعی خروجی همین پرونده'); assert(await approve.isEnabled());
      await approve.click(); await page.getByRole('alert').waitFor(); assert(await human.isChecked()); assert.equal(await comment.inputValue(), 'بازبینی واقعی خروجی همین پرونده');
      let axe = await new AxeBuilder({ page }).analyze(); assert.deepEqual(axe.violations, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${output}/${theme}-${width}-human.png`, fullPage: true });
      failDecision = false; await approve.click(); await page.waitForURL('**/admin/qc');
      assert.equal(writes.length, 2);
      await page.goto(base + '/admin/qc/legacy-fixture'); await approve.waitFor(); await human.check(); await comment.fill('پرونده قدیمی نیازمند اتصال مدرک نسخه است');
      assert(await approve.isDisabled()); assert(await page.getByRole('button', { name: 'درخواست اصلاح' }).isEnabled());
      axe = await new AxeBuilder({ page }).analyze(); assert.deepEqual(axe.violations, []);
      await page.screenshot({ path: `${output}/${theme}-${width}-legacy.png`, fullPage: true });
      await page.goto(base + '/admin/qc/checklist'); await page.getByRole('checkbox', { name: 'کیفیت محتوای خروجی' }).check(); await comment.fill('چک‌لیست همین نسخه بررسی شد'); await approve.click(); await page.waitForURL('**/admin/qc');
      assert.equal(writes.length, 3); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      results.push({ theme, width, status: 'passed', noChecklistNeedsHumanAndReason: true, errorPreservesInput: true, legacyCannotAutoApprove: true, existingChecklistPreserved: true, axeViolations: 0 });
    } finally { await context.close(); }
  }
} finally { await browser?.close(); child.kill(); }
const report = { status: 'passed', uiFixturesOnly: true, mainDatabaseTouched: false, results };
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, cases: results.length, mainDatabaseTouched: false }));
