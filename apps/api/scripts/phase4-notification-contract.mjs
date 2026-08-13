const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

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

const demo = await json(
  await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`),
);
const customer = demo.accounts.find((account) => account.phone === '09120000009');
assert(customer, 'Customer demo account is missing.');

const login = await json(
  await fetch(`${API_ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone: customer.phone,
      password: customer.password,
    }),
  }),
);
const headers = {
  authorization: `Bearer ${login.accessToken}`,
  'content-type': 'application/json',
};

const before = await json(
  await fetch(`${API_ORIGIN}/v1/notifications/preferences`, { headers }),
);
const toggled = { ...before, smsEnabled: !before.smsEnabled };

try {
  const updated = await json(
    await fetch(`${API_ORIGIN}/v1/notifications/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        inAppEnabled: toggled.inAppEnabled,
        emailEnabled: toggled.emailEnabled,
        smsEnabled: toggled.smsEnabled,
      }),
    }),
  );
  assert(
    updated.smsEnabled === toggled.smsEnabled,
    'Preference update response is stale.',
  );

  const persisted = await json(
    await fetch(`${API_ORIGIN}/v1/notifications/preferences`, { headers }),
  );
  assert(
    persisted.smsEnabled === toggled.smsEnabled,
    'Notification preference was not persisted.',
  );
} finally {
  await json(
    await fetch(`${API_ORIGIN}/v1/notifications/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        inAppEnabled: before.inAppEnabled,
        emailEnabled: before.emailEnabled,
        smsEnabled: before.smsEnabled,
      }),
    }),
  );
}

console.log(
  'Phase 4 notification contract passed: authenticated read, update, persistence, and state restoration.',
);
