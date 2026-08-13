const API_URL = process.env.NIAZAT_API_URL ?? 'http://localhost:3001/v1';
const PASSWORD = process.env.NIAZAT_SEED_PASSWORD ?? 'Passw0rd!123';

const accounts = {
  superAdmin: '09120000001',
  opsAdmin: '09120000002',
  financeAdmin: '09120000003',
  support: '09120000004',
  executor: '09120000006',
  customer: '09120000009',
};

async function request(path, token) {
  return fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function login(phone) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${phone}: HTTP ${response.status}`);
  }
  return (await response.json()).accessToken;
}

const tokens = {};
for (const [name, phone] of Object.entries(accounts)) {
  tokens[name] = await login(phone);
}

const cases = [
  ['anonymous cannot read current user', '/auth/me', undefined, 401],
  ['customer -> admin users', '/admin/users', tokens.customer, 403],
  ['customer -> finance', '/admin/finance/dashboard', tokens.customer, 403],
  ['customer -> support queue', '/support/tickets', tokens.customer, 403],
  ['customer -> executor', '/executor/dashboard', tokens.customer, 403],
  ['executor -> customer orders', '/customer/orders', tokens.executor, 403],
  ['executor -> admin users', '/admin/users', tokens.executor, 403],
  ['executor -> support queue', '/support/tickets', tokens.executor, 403],
  ['support -> customer orders', '/customer/orders', tokens.support, 403],
  ['support -> executor', '/executor/dashboard', tokens.support, 403],
  ['support -> admin users', '/admin/users', tokens.support, 403],
  ['ops -> finance dashboard', '/admin/finance/dashboard', tokens.opsAdmin, 403],
  ['ops -> admin management', '/admin/admins', tokens.opsAdmin, 403],
  ['finance -> staff', '/admin/staff', tokens.financeAdmin, 403],
  ['finance -> QC', '/admin/qc/queue', tokens.financeAdmin, 403],
  ['finance -> catalog', '/admin/services', tokens.financeAdmin, 403],
  ['finance -> admin management', '/admin/admins', tokens.financeAdmin, 403],
];

let failures = 0;
for (const [name, path, token, expected] of cases) {
  const response = await request(path, token);
  if (response.status !== expected) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${expected}, received ${response.status}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

if (failures) {
  throw new Error(`${failures} access-matrix case(s) failed.`);
}
console.log(`Access matrix passed: ${cases.length}/${cases.length}`);
