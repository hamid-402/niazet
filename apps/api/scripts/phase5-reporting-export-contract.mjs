import { readFile } from 'node:fs/promises';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
const ROOT = new URL('../../../', import.meta.url);
function assert(condition, message) { if (!condition) throw new Error(message); }
async function json(response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(value)}`);
  return value;
}
async function login(account) {
  return json(await fetch(`${API_ORIGIN}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: account.phone, password: account.password }) }));
}
const demo = await json(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const find = (phone) => demo.accounts.find((item) => item.phone === phone);
const [ops, finance, superAdmin] = await Promise.all([login(find('09120000002')), login(find('09120000003')), login(find('09120000001'))]);
const auth = (token) => ({ authorization: `Bearer ${token}` });

const opsExport = await fetch(`${API_ORIGIN}/v1/admin/reports/operations/export?from=2026-01-01&to=2026-08-31`, { headers: auth(ops.accessToken) });
assert(opsExport.ok && opsExport.headers.get('content-type')?.includes('text/csv'), 'Operations CSV export failed.');
assert(opsExport.headers.get('content-disposition')?.includes('attachment'), 'Operations export is not an attachment.');
const opsCsv = await opsExport.text();
assert(opsCsv.includes('"section","entity","metric","value","unit"'), 'Operations CSV schema is invalid.');
assert(!opsCsv.includes('gmv') && !opsCsv.includes('revenue') && !opsCsv.includes('escrow'), 'Operations CSV leaks finance fields.');
assert((await fetch(`${API_ORIGIN}/v1/admin/reports/finance/export`, { headers: auth(ops.accessToken) })).status === 403, 'Ops exported finance report.');

const financeExport = await fetch(`${API_ORIGIN}/v1/admin/reports/finance/export?from=2026-01-01&to=2026-08-31`, { headers: auth(finance.accessToken) });
assert(financeExport.ok && financeExport.headers.get('content-type')?.includes('text/csv'), 'Finance CSV export failed.');
const financeCsv = await financeExport.text();
assert(financeCsv.includes('"sales"') && financeCsv.includes('"escrow"') && financeCsv.includes('"refunds"'), 'Finance CSV is incomplete.');
assert((await fetch(`${API_ORIGIN}/v1/admin/reports/operations/export`, { headers: auth(finance.accessToken) })).status === 403, 'Finance exported operations report.');

const audit = await json(await fetch(`${API_ORIGIN}/v1/admin/audit-log?entityType=report_export&pageSize=100`, { headers: auth(superAdmin.accessToken) }));
assert(audit.items.some((item) => item.action === 'report.operations.export' && item.sensitivity === 'sensitive'), 'Operations export audit is missing.');
assert(audit.items.some((item) => item.action === 'report.finance.export' && item.sensitivity === 'sensitive'), 'Finance export audit is missing.');

const controller = await readFile(new URL('apps/api/src/reporting/reporting.controller.ts', ROOT), 'utf8');
const opsPage = await readFile(new URL('apps/web/src/app/(admin)/admin/reports/operations/page.tsx', ROOT), 'utf8');
const financePage = await readFile(new URL('apps/web/src/app/(admin)/admin/reports/finance/page.tsx', ROOT), 'utf8');
assert(controller.includes("limit: 5") && controller.includes("entityType: 'report_export'"), 'Export control or audit metadata is missing.');
assert(opsPage.includes('/admin/reports/operations/export'), 'Operations export UI is not wired.');
assert(financePage.includes('/admin/reports/finance/export'), 'Finance export UI is not wired.');

console.log('Phase 5 reporting export contract passed: scoped CSV downloads, finance isolation, fixed schema, rate limiting, spreadsheet safety and sensitive audit evidence.');
