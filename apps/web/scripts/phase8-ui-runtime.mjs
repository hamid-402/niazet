import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { scenarios, themes, validateVisualMatrix, viewports } from './phase8-visual-regression-matrix.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(webRoot, '../..');
const apiRoot = resolve(repositoryRoot, 'apps/api');
const apiEnvironmentPath = resolve(apiRoot, '.env');
const prismaCli = resolve(apiRoot, 'node_modules/prisma/build/index.js');
const apiEntry = resolve(apiRoot, 'dist/main.js');
const nextCli = resolve(webRoot, 'node_modules/next/dist/bin/next');
const apiRequire = createRequire(resolve(apiRoot, 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const artifactRoot = resolve(repositoryRoot, '.artifacts/ui-runtime');
const baselinePath = resolve(webRoot, 'tests/phase8-visual-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');
const runId = randomUUID();
const pathEnvironmentKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
const rolePhones = {
  customer: '09120000009',
  ops: '09120000002',
  finance: '09120000003',
  executor: '09120000005',
  support: '09120000004',
};
const roleHomes = {
  customer: '/dashboard',
  ops: '/admin',
  finance: '/admin/finance',
  executor: '/executor',
  support: '/support/tickets',
};

if (updateBaseline) {
  assert.equal(
    process.env.UI_BASELINE_UPDATE_CONFIRM,
    'niazat_update_visual_baseline',
    'Updating the visual baseline requires UI_BASELINE_UPDATE_CONFIRM=niazat_update_visual_baseline.',
  );
}

function readEnvironmentFile() {
  if (!existsSync(apiEnvironmentPath)) return {};
  return Object.fromEntries(
    readFileSync(apiEnvironmentPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const raw = line.slice(separator + 1).trim();
        return [key, raw.replace(/^(['"])(.*)\1$/, '$2')];
      }),
  );
}

function runPrisma(args, label, environment, redactions) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: apiRoot,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    let output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    for (const value of redactions) output = output.replaceAll(value, '<DATABASE_URL redacted>');
    throw new Error(`${label} failed.\n${output.slice(-6_000)}`);
  }
}

function buildWeb(environment) {
  const result = spawnSync(process.execPath, [nextCli, 'build'], {
    cwd: webRoot,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Isolated Web build failed.\n${`${result.stdout ?? ''}\n${result.stderr ?? ''}`.slice(-8_000)}`);
  }
}

async function waitForUrl(url, processRef, output) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode != null) throw new Error(`Process exited while waiting for ${url}.\n${output().slice(-6_000)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${output().slice(-6_000)}`);
}

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    chromium.executablePath(),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function rounded(value, unit = 4) {
  return Math.round(value / unit) * unit;
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  const loadingState = page.locator('[aria-label="در حال آماده‌سازی صفحه"]');
  if (await loadingState.count()) {
    await loadingState.first().waitFor({ state: 'detached', timeout: 15_000 });
  }
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    if (document.querySelector('#ui-runtime-motion-lock')) return;
    const style = document.createElement('style');
    style.id = 'ui-runtime-motion-lock';
    style.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
    document.head.append(style);
  });
  await page.waitForTimeout(100);
}

async function runtimeSnapshot(page, key) {
  const raw = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || !visible(element)) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const text = (value) => value.replace(/\s+/g, ' ').trim();
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .filter(visible)
      .slice(0, 24)
      .map((element) => `${element.tagName}:${text(element.textContent ?? '').slice(0, 100)}`);
    const duplicateIds = [...document.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id, index, ids) => id && ids.indexOf(id) !== index);
    const controls = [...document.querySelectorAll('button,input,select,textarea,[role="button"]')].filter(visible);
    const undersizedControls = controls
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width < 24 || box.height < 24;
      })
      .map((element) => `${element.tagName}:${text(element.getAttribute('aria-label') ?? element.textContent ?? '').slice(0, 60)}`);
    const rootStyle = getComputedStyle(document.body);
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      theme: document.documentElement.dataset.theme,
      title: document.title,
      bodyHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      colors: { background: rootStyle.backgroundColor, foreground: rootStyle.color },
      rects: { main: rect('main'), header: rect('header'), nav: rect('nav'), footer: rect('footer') },
      counts: {
        headings: headings.length,
        links: [...document.querySelectorAll('a[href]')].filter(visible).length,
        controls: controls.length,
        landmarks: [...document.querySelectorAll('main,header,nav,aside,footer,[role="main"],[role="navigation"]')].filter(visible).length,
      },
      headings,
      duplicateIds: [...new Set(duplicateIds)],
      undersizedControls,
    };
  });
  const normalizeRect = (box) => box && Object.fromEntries(Object.entries(box).map(([name, value]) => [name, rounded(value)]));
  return {
    key,
    ...raw,
    bodyHeight: rounded(raw.bodyHeight, 8),
    overflowX: rounded(raw.overflowX),
    rects: Object.fromEntries(Object.entries(raw.rects).map(([name, box]) => [name, normalizeRect(box)])),
  };
}

function compareBaseline(actual, expected) {
  assert.equal(actual.length, expected.length, 'Visual baseline entry count changed.');
  const expectedByKey = new Map(expected.map((entry) => [entry.key, entry]));
  for (const entry of actual) {
    const baseline = expectedByKey.get(entry.key);
    assert.ok(baseline, `Missing visual baseline: ${entry.key}`);
    for (const field of ['lang', 'dir', 'theme', 'title']) assert.equal(entry[field], baseline[field], `${entry.key} changed ${field}.`);
    assert.deepEqual(entry.colors, baseline.colors, `${entry.key} changed theme colors.`);
    assert.deepEqual(entry.counts, baseline.counts, `${entry.key} changed visible semantic counts.`);
    assert.deepEqual(entry.headings, baseline.headings, `${entry.key} changed visible heading structure.`);
    assert.ok(Math.abs(entry.bodyHeight - baseline.bodyHeight) <= 32, `${entry.key} body height drifted beyond 32px.`);
    for (const landmark of ['main', 'header', 'nav', 'footer']) {
      const current = entry.rects[landmark];
      const previous = baseline.rects[landmark];
      assert.equal(Boolean(current), Boolean(previous), `${entry.key} changed ${landmark} visibility.`);
      if (!current || !previous) continue;
      for (const dimension of ['x', 'y', 'width', 'height']) {
        assert.ok(
          Math.abs(current[dimension] - previous[dimension]) <= 16,
          `${entry.key} ${landmark}.${dimension} drifted beyond 16px.`,
        );
      }
    }
  }
}

async function verifyKeyboardFlows(pages, webOrigin) {
  const guest = pages.get('guest');
  await guest.setViewportSize({ width: 320, height: 740 });
  if (new URL(guest.url()).pathname !== '/') {
    await guest.goto(`${webOrigin}/`);
    await settle(guest);
  }
  await guest.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await guest.keyboard.press('Tab');
  const firstFocus = await guest.evaluate(() => ({
    isSkipLink: document.activeElement?.classList.contains('skip-link') ?? false,
    tag: document.activeElement?.tagName ?? 'none',
    text: document.activeElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
  }));
  assert.equal(firstFocus.isSkipLink, true, `Skip link is not the first keyboard target; focused ${firstFocus.tag} "${firstFocus.text}".`);
  await guest.keyboard.press('Enter');
  assert.equal(await guest.evaluate(() => document.activeElement?.id === 'main-content' || location.hash === '#main-content'), true, 'Skip link does not reach main content.');

  const themeTrigger = guest.locator('button[aria-haspopup="listbox"]:visible').first();
  await themeTrigger.focus();
  await guest.keyboard.press('ArrowDown');
  await guest.locator('[role="listbox"]').waitFor({ state: 'visible' });
  await guest.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
  await guest.keyboard.press('End');
  await guest.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
  assert.equal(await guest.evaluate(() => document.activeElement?.getAttribute('role')), 'option', 'Theme listbox does not move focus with End.');
  await guest.keyboard.press('Escape');
  await guest.waitForFunction(() => document.activeElement?.getAttribute('aria-haspopup') === 'listbox');
  assert.equal(await themeTrigger.evaluate((element) => document.activeElement === element), true, 'Theme listbox does not restore trigger focus.');

  const publicDrawerTrigger = guest.locator('[aria-controls="public-mobile-drawer"]');
  await publicDrawerTrigger.click();
  await guest.locator('#public-mobile-drawer').waitFor({ state: 'visible' });
  await guest.keyboard.press('Escape');
  await guest.waitForFunction(() => document.activeElement?.getAttribute('aria-controls') === 'public-mobile-drawer');
  assert.equal(await publicDrawerTrigger.evaluate((element) => document.activeElement === element), true, 'Public drawer does not restore trigger focus.');

  const customer = pages.get('customer');
  await customer.setViewportSize({ width: 320, height: 740 });
  if (new URL(customer.url()).pathname !== '/dashboard') {
    await customer.goto(`${webOrigin}/dashboard`);
    await settle(customer);
  }
  const workspaceDrawerTrigger = customer.locator('[aria-controls="workspace-mobile-drawer"]');
  await workspaceDrawerTrigger.click();
  await customer.locator('#workspace-mobile-drawer').waitFor({ state: 'visible' });
  await customer.keyboard.press('Escape');
  await customer.waitForFunction(() => document.activeElement?.getAttribute('aria-controls') === 'workspace-mobile-drawer');
  assert.equal(await workspaceDrawerTrigger.evaluate((element) => document.activeElement === element), true, 'Workspace drawer does not restore trigger focus.');
}

async function verifyDrawerMotion(pages) {
  for (const [role, id] of [['guest', 'public-mobile-drawer'], ['customer', 'workspace-mobile-drawer']]) {
    const page = pages.get(role);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.querySelector('#ui-runtime-motion-lock')?.remove());
    const trigger = page.locator(`[aria-controls="${id}"]`);
    await trigger.click();
    const drawer = page.locator(`#${id}`);
    await drawer.waitFor({ state: 'visible' });
    assert.equal(await drawer.evaluate(element => element.parentElement.inert), false);
    assert.notEqual(await drawer.evaluate(element => getComputedStyle(element).transitionDuration), '0s', 'Normal motion should animate the drawer.');
    await page.waitForTimeout(350);
    await page.keyboard.press('Escape');
    await page.waitForFunction(drawerId => document.getElementById(drawerId)?.parentElement.inert, id);
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true, 'Animated close must restore trigger focus.');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Animated close must unlock body scroll.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await trigger.click();
    assert.ok(await drawer.evaluate(element => getComputedStyle(element).transitionDuration.split(',').every(value => parseFloat(value) <= 0.001)), 'Reduced motion must neutralize drawer motion (global fallback uses 0.01ms).');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await settle(page);
  }
}

validateVisualMatrix();
assert.ok(existsSync(apiEntry), 'Build apps/api before runtime UI tests.');
mkdirSync(artifactRoot, { recursive: true });

const fileEnvironment = readEnvironmentFile();
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnvironment.DATABASE_URL;
if (!sourceUrl) throw new Error('DATABASE_URL is required for runtime UI tests.');
const parsedUrl = new URL(sourceUrl);
assert.match(parsedUrl.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
const databaseName = `niazat_ui_${Date.now()}_${runId.replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_ui_[a-z0-9_]+$/);
assert.notEqual(databaseName, sourceDatabaseName);
const maintenanceUrl = new URL(parsedUrl);
maintenanceUrl.pathname = '/postgres';
maintenanceUrl.searchParams.set('schema', 'public');
const isolatedUrl = new URL(parsedUrl);
isolatedUrl.pathname = `/${databaseName}`;
isolatedUrl.searchParams.set('schema', 'public');
const control = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } });
let databaseCreated = false;
let apiProcess;
let webProcess;
let browser;
const contexts = [];
let apiOutput = '';
let webOutput = '';
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), snapshots: [], axe: [], keyboard: 'pending' };
let testError;

try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const isolatedEnvironment = {
    ...fileEnvironment,
    ...process.env,
    [pathEnvironmentKey]: `${resolve(apiRoot, 'node_modules/.bin')}${delimiter}${process.env[pathEnvironmentKey] ?? ''}`,
    DATABASE_URL: isolatedUrl.toString(),
    NODE_ENV: 'test',
    LIVE_PROVIDERS_ENABLED: 'false',
    STORAGE_DRIVER: 'local',
    BACKGROUND_JOBS_ENABLED: 'false',
    PAYMENT_GATEWAY_DRIVER: 'mock',
    FILE_SCAN_DRIVER: 'mock',
    SMS_DRIVER: 'mock',
    EMAIL_DRIVER: 'mock',
  };
  runPrisma(['migrate', 'deploy'], 'Isolated migration deploy', isolatedEnvironment, [sourceUrl, isolatedUrl.toString()]);
  runPrisma(['db', 'seed'], 'Isolated database seed', isolatedEnvironment, [sourceUrl, isolatedUrl.toString()]);

  const apiPort = randomInt(47_001, 50_000);
  const webPort = randomInt(50_001, 53_000);
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: apiRoot,
    env: { ...isolatedEnvironment, APP_PORT: String(apiPort), APP_URL: apiOrigin, WEB_URL: webOrigin },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const captureApi = (chunk) => { apiOutput = `${apiOutput}${chunk.toString()}`.slice(-20_000); };
  apiProcess.stdout.on('data', captureApi);
  apiProcess.stderr.on('data', captureApi);
  await waitForUrl(`${apiOrigin}/health`, apiProcess, () => apiOutput);

  const webEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
    API_INTERNAL_URL: `${apiOrigin}/v1`,
    NEXT_PUBLIC_API_URL: `${apiOrigin}/v1`,
    NEXT_PUBLIC_API_BASE_PATH: '/api/backend',
    NEXT_PUBLIC_SITE_URL: webOrigin,
  };
  buildWeb(webEnvironment);
  webProcess = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], {
    cwd: webRoot,
    env: webEnvironment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const captureWeb = (chunk) => { webOutput = `${webOutput}${chunk.toString()}`.slice(-20_000); };
  webProcess.stdout.on('data', captureWeb);
  webProcess.stderr.on('data', captureWeb);
  await waitForUrl(`${webOrigin}/`, webProcess, () => webOutput);

  const executablePath = browserExecutable();
  assert.ok(executablePath, 'No Playwright Chromium, Chrome or Edge executable is available.');
  browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-dev-shm-usage'] });
  const pages = new Map();
  for (const role of ['guest', ...Object.keys(rolePhones)]) {
    const context = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran', reducedMotion: 'reduce' });
    contexts.push(context);
    const refreshRoute = '**/api/backend/auth/refresh';
    const rejectMissingSession = (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'No runtime session is available yet.' }),
    });
    await context.route(refreshRoute, rejectMissingSession);
    const page = await context.newPage();
    pages.set(role, page);
    await page.goto(`${webOrigin}${role === 'guest' ? '/' : '/login'}`);
    await settle(page);
    if (role !== 'guest') {
      await page.locator('input[autocomplete="tel"]').fill(rolePhones[role]);
      await page.locator('input[autocomplete="current-password"]').fill('Passw0rd!123');
      await Promise.all([
        page.waitForURL((url) => url.pathname === roleHomes[role], { timeout: 15_000 }),
        page.locator('button[type="submit"]').click(),
      ]);
      await settle(page);
      assert.equal(new URL(page.url()).pathname, roleHomes[role], `Browser login failed for ${role}: ${page.url()}.`);
      await context.unroute(refreshRoute, rejectMissingSession);
    }
  }

  await verifyKeyboardFlows(pages, webOrigin);
  await verifyDrawerMotion(pages);
  report.keyboard = 'passed';
  report.motion = 'passed';

  for (const scenario of scenarios) {
    const page = pages.get(scenario.role);
    assert.ok(page, `No browser context for ${scenario.role}.`);
    await page.setViewportSize({ width: viewports[0].width, height: viewports[0].height });
    const response = await page.goto(`${webOrigin}${scenario.route}`, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400, `${scenario.id} returned HTTP ${response?.status()}.`);
    await settle(page);
    assert.equal(new URL(page.url()).pathname, scenario.route, `${scenario.id} redirected to ${page.url()}.`);
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const theme of themes) {
        await page.emulateMedia({ colorScheme: theme.colorScheme, reducedMotion: 'reduce' });
        await page.evaluate((themeId) => {
          localStorage.setItem('niazat-theme', themeId);
          document.documentElement.dataset.theme = themeId;
        }, theme.id);
        await settle(page);
        const key = `${scenario.id}__${viewport.id}__${theme.id}`;
        const snapshot = await runtimeSnapshot(page, key);
        assert.equal(snapshot.lang, 'fa', `${key} lost Persian language metadata.`);
        assert.equal(snapshot.dir, 'rtl', `${key} lost RTL direction.`);
        assert.equal(snapshot.theme, theme.id, `${key} rendered the wrong theme.`);
        assert.ok(snapshot.overflowX <= 1, `${key} has ${snapshot.overflowX}px horizontal overflow.`);
        assert.deepEqual(snapshot.duplicateIds, [], `${key} contains duplicate ids.`);
        assert.deepEqual(snapshot.undersizedControls, [], `${key} contains controls smaller than 24px.`);
        report.snapshots.push(snapshot);
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        report.axe.push({ key, violations: axe.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.length })) });
        assert.deepEqual(axe.violations, [], `${key} has axe violations: ${axe.violations.map((item) => item.id).join(', ')}`);
        const screenshotPath = join(artifactRoot, 'screenshots', `${key}.png`);
        mkdirSync(dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled', caret: 'hide' });
      }
    }
  }

  if (updateBaseline) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify({ schemaVersion: 1, snapshots: report.snapshots }, null, 2)}\n`);
  } else {
    assert.ok(existsSync(baselinePath), 'Visual baseline is missing; use the guarded --update-baseline command.');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    assert.equal(baseline.schemaVersion, 1, 'Unsupported visual baseline schema.');
    compareBaseline(report.snapshots, baseline.snapshots);
  }
  console.log(`Phase 8 runtime UI passed: ${report.snapshots.length} screenshots, ${report.axe.length} axe scans, responsive overflow checks, keyboard flows and compact visual baseline.`);
} catch (error) {
  testError = error;
  report.failure = error instanceof Error ? error.message : String(error);
} finally {
  report.completedAt = new Date().toISOString();
  writeFileSync(resolve(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  for (const processRef of [webProcess, apiProcess]) {
    if (processRef && processRef.exitCode == null) {
      processRef.kill();
      await Promise.race([once(processRef, 'exit'), new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
    }
  }
  if (databaseCreated) {
    await control.$queryRawUnsafe(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      databaseName,
    );
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
}

if (testError) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const annotation = report.failure
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A');
    console.error(`::error title=Phase 8 runtime UI::${annotation}`);
  }
  throw testError;
}
