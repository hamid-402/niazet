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

const demo = await json(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const customer = demo.accounts.find((account) => account.phone === '09120000009');
assert(customer, 'Customer demo account is missing.');
const login = await json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: customer.phone, password: customer.password }),
}));
const headers = { authorization: `Bearer ${login.accessToken}` };
const overview = await json(await fetch(`${API_ORIGIN}/v1/customer/finance/overview`, { headers }));

assert(typeof overview.summary.walletBalance === 'number', 'Wallet balance is missing.');
assert(Array.isArray(overview.payments), 'Payments are missing.');
assert(Array.isArray(overview.escrows), 'Escrows are missing.');
assert(Array.isArray(overview.refunds), 'Refunds are missing.');
assert(Array.isArray(overview.invoices), 'Invoices are missing.');
assert(overview.escrows.every((item) => item.remainingAmount === item.amount - item.releasedAmount - item.refundedAmount), 'Escrow remaining balance is inconsistent.');
const expectedPaid = overview.payments.filter((item) => item.status === 'succeeded').reduce((sum, item) => sum + item.amount, 0);
assert(overview.summary.totalPaid === expectedPaid, 'Paid aggregate is inconsistent.');

if (overview.invoices[0]) {
  const pdf = await fetch(`${API_ORIGIN}/v1/customer/invoices/${overview.invoices[0].id}/pdf`, { headers });
  assert(pdf.ok, `Invoice PDF download failed with ${pdf.status}.`);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  assert(new TextDecoder().decode(bytes.slice(0, 8)) === '%PDF-1.4', 'Invoice response is not a PDF.');
}

const executor = demo.accounts.find((account) => account.phone === '09120000005');
assert(executor, 'Executor demo account is missing.');
const executorLogin = await json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: executor.phone, password: executor.password }),
}));
const forbidden = await fetch(`${API_ORIGIN}/v1/customer/finance/overview`, {
  headers: { authorization: `Bearer ${executorLogin.accessToken}` },
});
assert(forbidden.status === 403, `Executor must not access customer finance; received ${forbidden.status}.`);

console.log('Phase 4 customer finance contract passed: scoped overview, role isolation, aggregates, escrow balance, refunds, invoices, and authenticated PDF.');
