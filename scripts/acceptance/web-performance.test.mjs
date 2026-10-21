import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { budgets, median, clsWindow, summarize, routes, profiles } from './web-performance-model.mjs';

test('median is deterministic and rejects missing/nonfinite measurements', () => {
  assert.equal(median([4, 1, 2]), 2); assert.equal(median([1, 2]), 1.5);
  for (const values of [[], [null], [NaN], [Infinity]]) assert.throws(() => median(values));
});
test('CLS uses the largest session window and excludes user input', () => {
  const shift = (startTime, value, hadRecentInput = false) => ({ startTime, value, hadRecentInput });
  assert.equal(clsWindow([shift(0, 0.02), shift(500, 0.03), shift(1600, 0.04), shift(1700, 0.9, true)]), 0.05);
  assert.equal(clsWindow(Array.from({ length: 7 }, (_, index) => shift(index * 900, 0.01))).toFixed(2), '0.06');
});
test('budgets cannot turn missing data or a breach into success', () => {
  assert.throws(() => summarize([]));
  const samples = Array.from({ length: 3 }, () => ({ ...budgets }));
  assert.deepEqual(summarize(samples).breaches, []);
  for (const sample of samples) sample.lcpMs += 1;
  assert.equal(summarize(samples).breaches[0].metric, 'lcpMs');
});
test('representative profiles and all roles remain covered without changing inherited tests', () => {
  assert.equal(profiles.length, 2); assert.equal(profiles[1].cpu, 4);
  assert.equal(routes.length, 11);
  for (const role of ['customer-form', 'executor', 'support', 'ops', 'finance', 'super']) assert.ok(routes.some(route => route.id === role));
  const runner = readFileSync(new URL('./web-performance-e2e.mjs', import.meta.url), 'utf8');
  for (const marker of ['niazat_perf_', 'assert.notEqual(databaseName, sourceDatabaseName)', "LIVE_PROVIDERS_ENABLED: 'false'", "BACKGROUND_JOBS_ENABLED: 'false'", 'DROP DATABASE IF EXISTS', 'finally']) assert.ok(runner.includes(marker), marker);
  assert.ok(runner.includes("focused ? 'focused-report.json' : 'report.json'"), 'Focused measurements must not replace the full report.');
  const browser = readFileSync(new URL('./web-performance-browser.mjs', import.meta.url), 'utf8');
  for (const marker of ['index < 3', 'beforeCase(route, profile)', 'new URL(page.url()).pathname, route.path', 'Missing paint metrics cannot pass as zero.', 'layoutShifts: raw.observed.shifts']) assert.ok(browser.includes(marker), marker);
  assert.ok(!browser.includes('route.fulfill') && !browser.includes('setAccessToken'), 'Measure real auth, not intercepted success or token injection.');
});
