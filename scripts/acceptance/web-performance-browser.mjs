import assert from 'node:assert/strict';
import { profiles, routes, clsWindow, summarize, budgets } from './web-performance-model.mjs';

export async function measureWebPerformance(browser, origin, report, beforeCase, selection = {}) {
  report.profiles = profiles; report.budgets = budgets; report.cases = [];
  report.method = 'Production Chromium lab; three fresh contexts per route/profile; browser cache disabled, server warmed; 3s observation after content/fonts ready. Each case has an independent isolated API process, with real auth/rate limits unchanged; this is not an aggregate auth/load test. Mobile: 4x CPU, 150ms latency, 1.6Mbps download. Median budgets; no field CWV/INP or Lighthouse score claimed.';
  const selectedProfiles = selection.profiles ?? profiles, selectedRoutes = selection.routes ?? routes;
  report.coverage = { routes: selectedRoutes.map(route => route.id), profiles: selectedProfiles.map(profile => profile.id), full: selectedRoutes.length === routes.length && selectedProfiles.length === profiles.length };
  for (const profile of selectedProfiles) for (const route of selectedRoutes) {
    await beforeCase(route, profile);
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
      try {
        await context.addInitScript(theme => { localStorage.setItem('niazat-theme', theme); }, profile.theme);
        const page = await context.newPage();
        if (route.phone) {
          await page.goto(`${origin}/login`);
          await page.locator('input[autocomplete="tel"]').fill(route.phone);
          await page.locator('input[autocomplete="current-password"]').fill('Passw0rd!123');
          await Promise.all([page.waitForURL(url => url.pathname === route.home), page.locator('button[type="submit"]').click()]);
        }
        const errors = [], failedResponses = [];
        let expectedSession401 = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.status() < 400) return;
          const path = new URL(response.url()).pathname;
          if (response.status() === 401 && /\/auth\/(me|refresh)$/.test(path)) { expectedSession401 += 1; return; }
          failedResponses.push({ path, status: response.status() });
        });
        await page.addInitScript(() => {
          const result = { lcp: [], shifts: [], tasks: [], supported: PerformanceObserver.supportedEntryTypes };
          window.__niazatPerf = result;
          for (const [type, key] of [['largest-contentful-paint', 'lcp'], ['layout-shift', 'shifts'], ['longtask', 'tasks']]) {
            if (!result.supported.includes(type)) continue;
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                const value = entry.toJSON();
                if (type === 'layout-shift') value.sources = entry.sources.map(source => ({
                  tag: source.node?.nodeName, id: source.node?.id, className: typeof source.node?.className === 'string' ? source.node.className : '',
                  previousRect: source.previousRect.toJSON(), currentRect: source.currentRect.toJSON(),
                }));
                result[key].push(value);
              }
            }).observe({ type, buffered: true });
          }
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.download, uploadThroughput: profile.upload });
        const response = await page.goto(`${origin}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        assert.equal(response.status(), 200);
        await page.locator('main h1').first().waitFor({ timeout: 20000 });
        await page.locator('[aria-label="در حال آماده‌سازی صفحه"]').waitFor({ state: 'hidden' });
        await page.evaluate(() => document.fonts.ready);
        const readyMs = await page.evaluate(() => performance.now());
        // Bounded observation includes hydration, logo/font decode and post-load layout.
        await page.waitForTimeout(3000);
        assert.equal(new URL(page.url()).pathname, route.path, 'A redirected login is not a performance result.');
        assert.deepEqual(errors, [], `${route.id}: browser errors`);
        assert.deepEqual(failedResponses, [], `${route.id}: unexpected HTTP errors`);
        const raw = await page.evaluate(() => ({
          navigation: performance.getEntriesByType('navigation')[0].toJSON(),
          paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
          resources: performance.getEntriesByType('resource').map(entry => ({ path: new URL(entry.name).pathname, type: entry.initiatorType, transfer: entry.transferSize, decoded: entry.decodedBodySize })),
          observed: window.__niazatPerf,
        }));
        assert.ok(raw.observed.lcp.length && raw.paint > 0, 'Missing paint metrics cannot pass as zero.');
        const scripts = raw.resources.filter(entry => entry.type === 'script');
        samples.push({
          ttfbMs: raw.navigation.responseStart - raw.navigation.startTime,
          fcpMs: raw.paint, lcpMs: raw.observed.lcp.at(-1).startTime,
          cls: clsWindow(raw.observed.shifts), readyMs,
          scriptDecodedBytes: scripts.reduce((sum, entry) => sum + entry.decoded, 0),
          scriptTransferBytes: scripts.reduce((sum, entry) => sum + entry.transfer, 0),
          totalTransferBytes: raw.resources.reduce((sum, entry) => sum + entry.transfer, raw.navigation.transferSize),
          observedBlockingMs: raw.observed.tasks.filter(entry => entry.startTime >= raw.paint).reduce((sum, entry) => sum + Math.max(0, entry.duration - 50), 0),
          expectedSession401, resources: raw.resources, layoutShifts: raw.observed.shifts,
        });
      } finally { await context.close(); }
    }
    const result = { route: route.id, path: route.path, profile: profile.id, samples, ...summarize(samples) };
    report.cases.push(result);
    console.log(`Web performance: ${route.id}/${profile.id}; LCP ${Math.round(result.medians.lcpMs)}ms; CLS ${result.medians.cls.toFixed(3)}; JS ${Math.round(result.medians.scriptDecodedBytes / 1024)}KiB; ${result.breaches.length} budget breaches.`);
  }
  report.status = report.cases.some(result => result.breaches.length) ? 'needs_attention' : 'passed';
}
