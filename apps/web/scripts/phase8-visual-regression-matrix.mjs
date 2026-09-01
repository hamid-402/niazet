import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

export const themes = [
  { id: 'simple-light', colorScheme: 'light' },
  { id: 'simple-dark', colorScheme: 'dark' },
];

export const viewports = [
  { id: 'mobile-320', width: 320, height: 740 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'laptop-1280', width: 1280, height: 800 },
  { id: 'desktop-1920', width: 1920, height: 1080 },
];

export const scenarios = [
  { id: 'public-home', role: 'guest', route: '/', source: 'src/app/page.tsx' },
  { id: 'public-services', role: 'guest', route: '/services', source: 'src/app/services/page.tsx' },
  { id: 'public-status', role: 'guest', route: '/status', source: 'src/app/status/page.tsx' },
  { id: 'auth-login', role: 'guest', route: '/login', source: 'src/app/login/page.tsx' },
  { id: 'customer-dashboard', role: 'customer', phone: '09120000009', route: '/dashboard', source: 'src/app/(customer)/dashboard/page.tsx' },
  { id: 'customer-new-order', role: 'customer', phone: '09120000009', route: '/orders/new', source: 'src/app/(customer)/orders/new/page.tsx' },
  { id: 'customer-orders', role: 'customer', phone: '09120000009', route: '/orders', source: 'src/app/(customer)/orders/page.tsx' },
  { id: 'customer-wallet', role: 'customer', phone: '09120000009', route: '/wallet', source: 'src/app/(customer)/wallet/page.tsx' },
  { id: 'ops-dashboard', role: 'ops', phone: '09120000002', route: '/admin', source: 'src/app/(admin)/admin/page.tsx' },
  { id: 'ops-orders', role: 'ops', phone: '09120000002', route: '/admin/orders', source: 'src/app/(admin)/admin/orders/page.tsx' },
  { id: 'ops-qc', role: 'ops', phone: '09120000002', route: '/admin/qc', source: 'src/app/(admin)/admin/qc/page.tsx' },
  { id: 'ops-staff', role: 'ops', phone: '09120000002', route: '/admin/staff', source: 'src/app/(admin)/admin/staff/page.tsx' },
  { id: 'finance-dashboard', role: 'finance', phone: '09120000003', route: '/admin/finance', source: 'src/app/(admin)/admin/finance/page.tsx' },
  { id: 'finance-ledger', role: 'finance', phone: '09120000003', route: '/admin/finance/ledger', source: 'src/app/(admin)/admin/finance/ledger/page.tsx' },
  { id: 'executor-dashboard', role: 'executor', phone: '09120000005', route: '/executor', source: 'src/app/(executor)/executor/page.tsx' },
  { id: 'executor-orders', role: 'executor', phone: '09120000005', route: '/executor/orders', source: 'src/app/(executor)/executor/orders/page.tsx' },
  { id: 'support-dashboard', role: 'support', phone: '09120000004', route: '/support', source: 'src/app/(support)/support/page.tsx' },
  { id: 'support-tickets', role: 'support', phone: '09120000004', route: '/support/tickets', source: 'src/app/(support)/support/tickets/page.tsx' },
];

export const snapshotPolicy = {
  fullPage: true,
  disableAnimations: true,
  waitForFonts: true,
  hideCaret: true,
  maxDiffPixelRatio: 0.005,
};

export function validateVisualMatrix() {
  assert.deepEqual(themes.map((item) => item.id), ['simple-light', 'simple-dark']);
  assert.deepEqual(viewports.map((item) => item.width), [320, 768, 1280, 1920]);
  assert.equal(new Set(scenarios.map((item) => item.id)).size, scenarios.length, 'Visual scenario ids must be unique.');
  for (const scenario of scenarios) {
    assert.equal(existsSync(fileURLToPath(new URL(scenario.source, root))), true, `Missing visual scenario source: ${scenario.source}`);
  }
  for (const role of ['guest', 'customer', 'ops', 'finance', 'executor', 'support']) {
    assert.equal(scenarios.some((item) => item.role === role), true, `Visual matrix misses role: ${role}`);
  }
  assert.equal(snapshotPolicy.disableAnimations, true);
  assert.ok(snapshotPolicy.maxDiffPixelRatio <= 0.005);
  return themes.length * viewports.length * scenarios.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`))) {
  const count = validateVisualMatrix();
  console.log(`Phase 8 visual matrix valid: ${scenarios.length} scenarios × ${viewports.length} viewports × ${themes.length} themes = ${count} deterministic snapshots.`);
}

