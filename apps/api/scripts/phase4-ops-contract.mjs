const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function login(account) {
  return json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: account.phone, password: account.password }),
  }));
}

const demo = await json(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const ops = demo.accounts.find((account) => account.phone === '09120000002');
const finance = demo.accounts.find((account) => account.phone === '09120000003');
assert(ops, 'Ops demo account is missing.');
assert(finance, 'Finance demo account is missing.');

const opsLogin = await login(ops);
const opsHeaders = { authorization: `Bearer ${opsLogin.accessToken}` };
const services = await json(await fetch(`${API_ORIGIN}/v1/admin/services`, {
  headers: opsHeaders,
}));
assert(Array.isArray(services), 'Ops catalog endpoint did not return a list.');
assert(services.length > 0, 'Seeded service catalog is empty.');
assert(services.every((service) => Array.isArray(service.packages)), 'Service packages are missing.');
assert(services.every((service) => Array.isArray(service.formFields)), 'Service form fields are missing.');
assert(services.every((service) => Array.isArray(service.acceptanceCriteria)), 'Acceptance criteria are missing.');
assert(services.every((service) => Array.isArray(service.qcChecklistTemplates)), 'QC templates are missing.');
assert(
  services.every((service) => service.qcChecklistTemplates.every((template) => Array.isArray(template.items))),
  'QC template items are missing.',
);

const firstService = await json(await fetch(`${API_ORIGIN}/v1/admin/services/${services[0].id}`, {
  headers: opsHeaders,
}));
assert(firstService.id === services[0].id, 'Service detail contract is inconsistent.');

const financeLogin = await login(finance);
const forbidden = await fetch(`${API_ORIGIN}/v1/admin/services`, {
  headers: { authorization: `Bearer ${financeLogin.accessToken}` },
});
assert(forbidden.status === 403, `Finance scope must not access Ops catalog; received ${forbidden.status}.`);

console.log('Phase 4 Ops contract passed: service/package/form/criteria/QC catalog and admin-scope isolation.');
