import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Read-only smoke test against the running local development server.
// Uses a fresh guest context: never imports a real user's cookies or credentials.
const baseURL = process.env.DEV_SMOKE_URL ?? 'http://localhost:3002';
const target = new URL(baseURL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Local server only.');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
try {
  for (const route of ['/', '/services', '/login', '/status']) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      const cssWarnings = [];
      const sockets = [];
      let connections = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.text().includes('[HMR] connected')) connections += 1;
        if (/preloaded.*not used/.test(message.text()) && /\.css/.test(message.text())) {
          cssWarnings.push(message.text());
        }
      });
      page.on('websocket', socket => {
        if (!socket.url().includes('/_next/')) return;
        const state = { closed: false, error: null };
        sockets.push(state);
        socket.on('close', () => { state.closed = true; });
        socket.on('socketerror', error => { state.error = String(error); });
      });
      const response = await page.goto(new URL(route, baseURL).href, {
        waitUntil: 'domcontentloaded', timeout: 60_000,
      });
      assert.equal(response.status(), 200, `${route}: HTTP success`);
      await page.locator('main').first().waitFor({ state: 'visible' });
      // A cold route can compile after the first handshake. Next's development
      // runtime performs a full reload when that compilation hash changes.
      // Allow that single initialization reload, but reject any idle reconnect.
      await page.waitForTimeout(5_000);
      const initializedConnections = connections;
      assert.ok(initializedConnections >= 1 && initializedConnections <= 2, `${route}: bounded initialization`);
      // Explicit bounded observation: networkidle is unsuitable for a dev server.
      await page.waitForTimeout(12_000);
      assert.deepEqual(errors, [], `${route}: no uncaught browser errors`);
      assert.deepEqual(cssWarnings, [], `${route}: no unused CSS preload`);
      assert.equal(connections, initializedConnections, `${route}: no idle HMR reconnect`);
      const activeSockets = sockets.filter(socket => !socket.closed);
      assert.equal(activeSockets.length, 1, `${route}: one active development socket`);
      assert.deepEqual(activeSockets[0], { closed: false, error: null }, `${route}: socket stays open`);
      console.log(`Development smoke passed: ${route}; CSS clean, HMR stable, no page errors.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
