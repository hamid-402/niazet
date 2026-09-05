import { randomUUID } from 'node:crypto';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function login(account) {
  return json(
    await fetch(`${API_ORIGIN}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: account.phone, password: account.password }),
    }),
  );
}

function assertMissing(object, keys, label) {
  for (const key of keys) {
    assert(!(key in object), `${label} leaks forbidden field: ${key}`);
  }
}

const demo = await json(
  await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`),
);
const executor = demo.accounts.find(
  (account) => account.phone === '09120000005',
);
const customer = demo.accounts.find(
  (account) => account.phone === '09120000009',
);
const superAdmin = demo.accounts.find(
  (account) => account.phone === '09120000001',
);
assert(executor && customer && superAdmin, 'Required demo accounts are missing.');

const executorLogin = await login(executor);
const headers = { authorization: `Bearer ${executorLogin.accessToken}` };
const profile = await json(
  await fetch(`${API_ORIGIN}/v1/executor/profile`, { headers }),
);
assertMissing(
  profile,
  ['userId', 'shabaNumber', 'shabaVerifiedAt', 'riskScore'],
  'Executor profile',
);

const performance = await json(
  await fetch(`${API_ORIGIN}/v1/executor/performance`, { headers }),
);
assert(Array.isArray(performance.history), 'Performance history is missing.');
for (const snapshot of performance.history) {
  assertMissing(
    snapshot,
    ['riskScore', 'complaintCount', 'complimentCount'],
    'Executor performance history',
  );
}

const orders = await json(
  await fetch(`${API_ORIGIN}/v1/executor/orders?pageSize=100`, { headers }),
);
assert(Array.isArray(orders) && orders.length > 0, 'Executor has no seeded order.');
for (const order of orders) {
  assertMissing(
    order,
    [
      'customerId',
      'budgetHint',
      'finalPrice',
      'riskFlags',
      'packageSnapshot',
      'payments',
      'escrowHolds',
    ],
    'Executor order list',
  );
}

const detail = await json(
  await fetch(`${API_ORIGIN}/v1/executor/orders/${orders[0].id}`, { headers }),
);
assertMissing(
  detail,
  [
    'customerId',
    'budgetHint',
    'finalPrice',
    'riskFlags',
    'packageSnapshot',
    'payments',
    'escrowHolds',
    'tickets',
    'feedback',
  ],
  'Executor order detail',
);
assertMissing(
  detail.serviceLine,
  ['basePrice', 'pricingModel', 'isActive'],
  'Executor service projection',
);
for (const file of detail.files ?? []) {
  assertMissing(
    file,
    ['storageKey', 'checksum', 'uploadedByUserId', 'purgedAt'],
    'Executor file projection',
  );
}
for (const message of detail.messages ?? []) {
  assert(
    message.visibility === 'customer_visible',
    'Internal-only message leaked to executor.',
  );
  assertMissing(
    message,
    ['senderUserId', 'attachmentFileId'],
    'Executor message projection',
  );
}
for (const milestone of detail.milestones ?? []) {
  assertMissing(
    milestone,
    ['amount', 'paymentStatus'],
    'Executor milestone projection',
  );
}
for (const history of detail.statusHistory ?? []) {
  assertMissing(
    history,
    ['actorUserId', 'note', 'financialEffectType', 'financialEffectAmount', 'context'],
    'Executor status history',
  );
}
for (const report of detail.reports ?? []) {
  assertMissing(
    report,
    ['authorUserId', 'fileId'],
    'Executor report projection',
  );
}
for (const assignment of detail.assignments ?? []) {
  assertMissing(
    assignment,
    ['executorProfileId', 'teamId', 'assignedByUserId', 'unassignedAt'],
    'Executor assignment projection',
  );
}
for (const review of detail.qcReviews ?? []) {
  assertMissing(review, ['reviewerUserId'], 'Executor QC projection');
}

const superLogin = await login(superAdmin);
const adminOrders = await json(
  await fetch(`${API_ORIGIN}/v1/admin/orders?pageSize=100`, {
    headers: { authorization: `Bearer ${superLogin.accessToken}` },
  }),
);
const assignedIds = new Set(orders.map((order) => order.id));
const unrelatedOrder = adminOrders.find((order) => !assignedIds.has(order.id));
const unrelatedResponse = await fetch(
  `${API_ORIGIN}/v1/executor/orders/${unrelatedOrder?.id ?? randomUUID()}`,
  { headers },
);
assert(
  unrelatedResponse.status === 404,
  'Unassigned order lookup must return 404 without existence disclosure.',
);

const customerLogin = await login(customer);
const roleForbidden = await fetch(`${API_ORIGIN}/v1/executor/profile`, {
  headers: { authorization: `Bearer ${customerLogin.accessToken}` },
});
assert(roleForbidden.status === 403, 'Customer role entered executor boundary.');

console.log(
  'Phase 5 executor confidentiality contract passed: profile/performance minimization, order allowlists, internal/financial/storage field isolation, 404 ownership boundary and role isolation.',
);
