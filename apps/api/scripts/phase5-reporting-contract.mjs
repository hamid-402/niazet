import { readFile } from 'node:fs/promises';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
const ROOT = new URL('../../../', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function body(response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(value)}`);
  return value;
}
async function login(account) {
  return body(await fetch(`${API_ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: account.phone, password: account.password }),
  }));
}
async function request(path, token) {
  return fetch(`${API_ORIGIN}/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}
function account(accounts, phone) {
  const result = accounts.find((item) => item.phone === phone);
  assert(result, `Demo account ${phone} is missing.`);
  return result;
}
function assertFiniteTree(value, path = 'report') {
  if (typeof value === 'number') assert(Number.isFinite(value), `${path} is not finite.`);
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${path}.${key}`);
  }
}

const demo = await body(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const [ops, finance, superAdmin] = await Promise.all([
  login(account(demo.accounts, '09120000002')),
  login(account(demo.accounts, '09120000003')),
  login(account(demo.accounts, '09120000001')),
]);
const opsResponse = await request('/admin/reports/operations', ops.accessToken);
const operations = await body(opsResponse);
assertFiniteTree(operations);
for (const key of ['orders', 'funnel', 'serviceSales', 'quality', 'sla', 'teams', 'staff', 'satisfaction', 'delivery']) {
  assert(key in operations, `Operations report misses ${key}.`);
}
for (const forbidden of ['gmv', 'revenue', 'escrow', 'refunds']) {
  assert(!JSON.stringify(operations).toLowerCase().includes(`\"${forbidden}\"`), `Operations leaks financial field ${forbidden}.`);
}
assert((await request('/admin/reports/finance', ops.accessToken)).status === 403, 'Ops entered finance report.');

const financeResponse = await request('/admin/reports/finance', finance.accessToken);
const financial = await body(financeResponse);
assertFiniteTree(financial);
for (const key of ['sales', 'income', 'escrow', 'refunds', 'daily']) assert(key in financial, `Finance report misses ${key}.`);
assert((await request('/admin/reports/operations', finance.accessToken)).status === 403, 'Finance entered operations report.');

assert((await request('/admin/reports/operations', superAdmin.accessToken)).ok, 'Super admin cannot read operations report.');
assert((await request('/admin/reports/finance', superAdmin.accessToken)).ok, 'Super admin cannot read finance report.');
assert((await request('/admin/reports/operations?from=2026-08-03&to=2026-08-01', ops.accessToken)).status === 400, 'Reversed range was accepted.');
assert((await request('/admin/reports/finance?from=2024-01-01&to=2026-01-01', finance.accessToken)).status === 400, 'Overlong range was accepted.');

const layout = await readFile(new URL('apps/web/src/app/(admin)/layout.tsx', ROOT), 'utf8');
const opsPage = await readFile(new URL('apps/web/src/app/(admin)/admin/reports/operations/page.tsx', ROOT), 'utf8');
const financePage = await readFile(new URL('apps/web/src/app/(admin)/admin/reports/finance/page.tsx', ROOT), 'utf8');
assert(layout.includes('/admin/reports/operations') && layout.includes('/admin/reports/finance'), 'Report navigation is incomplete.');
assert(opsPage.includes('/admin/reports/operations'), 'Operations report UI is not wired.');
assert(financePage.includes('/admin/reports/finance'), 'Finance report UI is not wired.');

console.log('Phase 5 reporting contract passed: Tehran range validation, complete operational/financial metrics, scope isolation, finite values and both admin UIs.');
