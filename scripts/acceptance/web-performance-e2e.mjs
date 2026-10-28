import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureWebPerformance } from './web-performance-browser.mjs';
import { routes, profiles } from './web-performance-model.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const apiRoot = join(repo, 'apps/api'), webRoot = join(repo, 'apps/web');
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const webRequire = createRequire(join(webRoot, 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client'), { chromium } = webRequire('playwright');
const artifactRoot = join(repo, '.artifacts/performance/web');
const envPath = join(apiRoot, '.env');
const fileEnv = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
  const separator = line.indexOf('='); return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
})) : {};
const sourceUrl = process.env.DATABASE_URL?.trim() || fileEnv.DATABASE_URL;
assert.ok(sourceUrl, 'DATABASE_URL is required; never use the actual database for sampling.');
const parsed = new URL(sourceUrl); assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
const sourceDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
const databaseName = `niazat_perf_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
assert.match(databaseName, /^niazat_perf_[a-z0-9_]+$/); assert.notEqual(databaseName, sourceDatabaseName);
const maintenance = new URL(parsed); maintenance.pathname = '/postgres'; maintenance.searchParams.set('schema', 'public');
const isolated = new URL(parsed); isolated.pathname = `/${databaseName}`; isolated.searchParams.set('schema', 'public');
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const apiPort = randomInt(35001, 40000), webPort = randomInt(40001, 45000);
const apiOrigin = `http://127.0.0.1:${apiPort}`, webOrigin = `http://127.0.0.1:${webPort}`;
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
const apiEnv = { ...fileEnv, ...process.env, DATABASE_URL: isolated.toString(), NODE_ENV: 'test',
  [pathKey]: [join(apiRoot, 'node_modules/.bin'), process.env[pathKey] ?? ''].join(delimiter),
  LIVE_PROVIDERS_ENABLED: 'false', BACKGROUND_JOBS_ENABLED: 'false', PAYMENT_GATEWAY_DRIVER: 'mock',
  SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock', FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local',
  APP_PORT: String(apiPort), APP_URL: apiOrigin, WEB_URL: webOrigin };
const webEnv = { ...process.env, NODE_ENV: 'production', API_INTERNAL_URL: `${apiOrigin}/v1`, NEXT_PUBLIC_API_URL: `${apiOrigin}/v1`, NEXT_PUBLIC_API_BASE_PATH: '/api/backend', NEXT_PUBLIC_SITE_URL: webOrigin };
const nextCli = join(webRoot, 'node_modules/next/dist/bin/next');
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'pending', cases: [] };
function select(flag, values) {
  const argument = process.argv.find(value => value.startsWith(`--${flag}=`));
  if (!argument) return values;
  const ids = argument.slice(flag.length + 3).split(',');
  assert.ok(ids.length && ids.every(id => values.some(value => value.id === id)), `Unknown ${flag} selection.`);
  return values.filter(value => ids.includes(value.id));
}
const selection = { routes: select('routes', routes), profiles: select('profiles', profiles) };
const focused = selection.routes.length !== routes.length || selection.profiles.length !== profiles.length;
let databaseCreated = false, apiProcess, webProcess, browser, failure;
const redact = value => String(value).replaceAll(sourceUrl, '<DATABASE_URL redacted>').replaceAll(isolated.toString(), '<ISOLATED_DATABASE_URL redacted>');
function run(args, cwd, env) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).slice(-5000));
}
function launch(entry, args, cwd, env) {
  const child = spawn(process.execPath, [entry, ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.diagnostic = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { child.diagnostic = `${child.diagnostic}${chunk}`.slice(-8000); });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode != null) return;
  child.kill(); await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  assert.ok(child.exitCode != null || child.signalCode != null, 'Isolated process must stop before restarting.');
}
async function ready(child, url) {
  for (const deadline = Date.now() + 45000; Date.now() < deadline;) {
    assert.equal(child.exitCode, null, redact(child.diagnostic));
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Isolated server not ready: ${url}`);
}
async function startApi() {
  await stop(apiProcess);
  apiProcess = launch(join(apiRoot, 'dist/main.js'), [], artifactRoot, apiEnv);
  await ready(apiProcess, `${apiOrigin}/health`);
}
try {
  assert.ok(existsSync(join(apiRoot, 'dist/main.js')), 'Build API first.');
  mkdirSync(artifactRoot, { recursive: true });
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); databaseCreated = true;
  const prisma = join(apiRoot, 'node_modules/prisma/build/index.js');
  run([prisma, 'migrate', 'deploy'], apiRoot, apiEnv); run([prisma, 'db', 'seed'], apiRoot, apiEnv);
  await startApi();
  run([nextCli, 'build'], webRoot, webEnv);
  webProcess = launch(nextCli, ['start', '--hostname', '127.0.0.1', '--port', String(webPort)], webRoot, webEnv);
  await ready(webProcess, webOrigin);
  const executablePath = [process.env.PLAYWRIGHT_EXECUTABLE_PATH, chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
  assert.ok(executablePath, 'Installed Chromium/Chrome/Edge required.');
  browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-dev-shm-usage'] });
  report.browser = browser.version();
  await measureWebPerformance(browser, webOrigin, report, async route => {
    // Separate three-sample cases, not an artificial burst of 42 login attempts.
    // Real guard settings stay enabled. Do not intercept auth or inject tokens.
    await startApi(); await fetch(`${webOrigin}${route.path}`);
  }, selection);
} catch (error) {
  failure = error; report.status = 'failed'; report.failure = redact(error instanceof Error ? error.message : error);
} finally {
  await browser?.close(); await stop(webProcess); await stop(apiProcess);
  if (databaseCreated) {
    assert.match(databaseName, /^niazat_perf_[a-z0-9_]+$/); assert.notEqual(databaseName, sourceDatabaseName);
    await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', databaseName);
    await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.$disconnect();
  report.completedAt = new Date().toISOString();
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, focused ? 'focused-report.json' : 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (failure) throw new Error(report.failure);
if (report.status !== 'passed') process.exitCode = 2;
