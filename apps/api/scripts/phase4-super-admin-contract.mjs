const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';

function assert(condition, message) { if (!condition) throw new Error(message); }
async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}
async function login(account) {
  return json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: account.phone, password: account.password }),
  }));
}

const demo = await json(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const superAdmin = demo.accounts.find((account) => account.phone === '09120000001');
const ops = demo.accounts.find((account) => account.phone === '09120000002');
assert(superAdmin && ops, 'Required admin demo accounts are missing.');

const superLogin = await login(superAdmin);
const headers = { authorization: `Bearer ${superLogin.accessToken}` };
const [users, admins, settings, security, audit] = await Promise.all([
  json(await fetch(`${API_ORIGIN}/v1/admin/users`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/admins`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/settings`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/security/summary`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/audit-log`, { headers })),
]);
assert(Array.isArray(users), 'Users endpoint did not return a list.');
assert(Array.isArray(admins) && admins.every((item) => item.adminScope), 'Admin scopes are incomplete.');
assert(Array.isArray(settings) && settings.length === 9, 'Approved setting registry is incomplete.');
assert(settings.every((item) => item.key && item.label && item.valueType), 'Setting metadata is malformed.');
assert(settings.find((item) => item.key === 'ai.human_approval_required')?.value === true, 'Human AI approval must default to true.');
assert(Number.isInteger(security.activeSessions), 'Active-session security metric is missing.');
assert(Number.isInteger(security.failedLogins24h), 'Failed-login security metric is missing.');
assert(Array.isArray(audit.items) && Number.isInteger(audit.total), 'Audit contract is incomplete.');

const unsafeAi = await fetch(`${API_ORIGIN}/v1/admin/settings`, {
  method: 'PUT',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ key: 'ai.human_approval_required', value: false }),
});
assert(unsafeAi.status === 400, `Human approval disable must fail; received ${unsafeAi.status}.`);
const unknownSetting = await fetch(`${API_ORIGIN}/v1/admin/settings`, {
  method: 'PUT',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ key: 'unsafe.arbitrary_key', value: true }),
});
assert(unknownSetting.status === 400, `Unknown setting must fail; received ${unknownSetting.status}.`);

const opsLogin = await login(ops);
const forbidden = await fetch(`${API_ORIGIN}/v1/admin/settings`, {
  headers: { authorization: `Bearer ${opsLogin.accessToken}` },
});
assert(forbidden.status === 403, `Ops scope must not access Super Admin settings; received ${forbidden.status}.`);

console.log('Phase 4 Super Admin contract passed: users, scopes, whitelisted settings, AI guardrail, security summary, audit, and scope isolation.');
