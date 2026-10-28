import assert from 'node:assert/strict';

// Lab budgets, fixed before measurement; not a field CWV or Lighthouse score.
export const budgets = Object.freeze({ ttfbMs: 800, fcpMs: 1800, lcpMs: 2500, cls: 0.1, readyMs: 5000, scriptDecodedBytes: 1024 * 1024 });
export const profiles = [
  { id: 'desktop', width: 1280, height: 900, theme: 'simple-light', cpu: 1, latency: 0, download: -1, upload: -1 },
  { id: 'mobile-lab', width: 390, height: 844, theme: 'simple-dark', cpu: 4, latency: 150, download: 1600000 / 8, upload: 750000 / 8 },
];
export const routes = [
  { id: 'home', path: '/' }, { id: 'services', path: '/services' },
  { id: 'login', path: '/login' }, { id: 'status', path: '/status' },
  { id: 'customer-orders', path: '/orders', phone: '09120000009', home: '/dashboard' },
  { id: 'customer-form', path: '/orders/new', phone: '09120000009', home: '/dashboard' },
  { id: 'executor', path: '/executor/orders', phone: '09120000005', home: '/executor' },
  { id: 'support', path: '/support/tickets', phone: '09120000004', home: '/support/tickets' },
  { id: 'ops', path: '/admin/orders', phone: '09120000002', home: '/admin' },
  { id: 'finance', path: '/admin/finance', phone: '09120000003', home: '/admin/finance' },
  { id: 'super', path: '/admin/users', phone: '09120000001', home: '/admin' },
];

export function median(values) {
  assert.ok(values.length && values.every(Number.isFinite), 'Missing/nonfinite samples are not zero.' );
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function clsWindow(entries) {
  let largest = 0, score = 0, start = 0, previous = -Infinity;
  for (const entry of [...entries].sort((a, b) => a.startTime - b.startTime)) {
    if (entry.hadRecentInput) continue;
    if (entry.startTime - previous >= 1000 || entry.startTime - start >= 5000) { start = entry.startTime; score = 0; }
    score += entry.value; previous = entry.startTime; largest = Math.max(largest, score);
  }
  return largest;
}

export function summarize(samples) {
  assert.equal(samples.length, 3, 'Three independent cold-browser samples required.');
  const medians = Object.fromEntries(Object.keys(budgets).map(key => [key, median(samples.map(sample => sample[key]))]));
  const breaches = Object.entries(budgets).filter(([key, limit]) => medians[key] > limit).map(([metric, limit]) => ({ metric, limit, measured: medians[metric] }));
  return { medians, breaches };
}
