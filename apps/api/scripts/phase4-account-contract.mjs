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
    body: JSON.stringify({ phone: customer.phone, password: customer.password }),
  }),
);
const headers = {
  authorization: `Bearer ${login.accessToken}`,
  'content-type': 'application/json',
};
const before = await json(
  await fetch(`${API_ORIGIN}/v1/customer/account/profile`, { headers }),
);

function profileBody(profile, analyticsConsent = profile.analyticsConsent) {
  return {
    fullName: profile.fullName,
    email: profile.email ?? '',
    accountType: profile.accountType,
    nationalId: profile.nationalId ?? '',
    companyName: profile.companyName ?? '',
    companyNationalId: profile.companyNationalId ?? '',
    companyRegistrationNumber: profile.companyRegistrationNumber ?? '',
    economicCode: profile.economicCode ?? '',
    billingRecipientName: profile.billingRecipientName ?? '',
    invoiceEmail: profile.invoiceEmail ?? '',
    province: profile.province ?? '',
    city: profile.city ?? '',
    addressLine: profile.addressLine ?? '',
    postalCode: profile.postalCode ?? '',
    marketingConsent: profile.marketingConsent,
    analyticsConsent,
  };
}

try {
  const toggled = !before.analyticsConsent;
  const updated = await json(
    await fetch(`${API_ORIGIN}/v1/customer/account/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(profileBody(before, toggled)),
    }),
  );
  assert(updated.analyticsConsent === toggled, 'Profile update response is stale.');
  const persisted = await json(
    await fetch(`${API_ORIGIN}/v1/customer/account/profile`, { headers }),
  );
  assert(persisted.analyticsConsent === toggled, 'Profile update was not persisted.');

  const rejected = await fetch(`${API_ORIGIN}/v1/customer/account/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...profileBody(before), passwordHash: 'forbidden' }),
  });
  assert(rejected.status === 400, `Unknown sensitive fields must be rejected; received ${rejected.status}.`);

  const exported = await json(
    await fetch(`${API_ORIGIN}/v1/customer/account/privacy/export`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );
  assert(exported.exportVersion === 1, 'Privacy export version is missing.');
  assert(Array.isArray(exported.orders), 'Privacy export orders are missing.');
  const serialized = JSON.stringify(exported);
  assert(!serialized.includes('passwordHash'), 'Privacy export leaked a password hash.');
  assert(!serialized.includes('refreshToken'), 'Privacy export leaked a refresh token.');
} finally {
  await json(
    await fetch(`${API_ORIGIN}/v1/customer/account/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(profileBody(before)),
    }),
  );
}

console.log(
  'Phase 4 account contract passed: profile persistence, strict DTO rejection, privacy export, secret exclusion, and state restoration.',
);
