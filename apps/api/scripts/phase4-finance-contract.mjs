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
const finance = demo.accounts.find((account) => account.phone === '09120000003');
const ops = demo.accounts.find((account) => account.phone === '09120000002');
assert(finance, 'Finance demo account is missing.');
assert(ops, 'Ops demo account is missing.');

const financeLogin = await login(finance);
const headers = { authorization: `Bearer ${financeLogin.accessToken}` };
const [dashboard, payments, escrows, refunds, invoices, withdrawals, ledger] = await Promise.all([
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/dashboard`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/payments`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/escrow`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/refunds`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/invoices`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/withdrawals`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/finance/ledger`, { headers })),
]);

assert(Number.isInteger(dashboard.refunds), 'Refund dashboard amount is missing.');
assert(Number.isInteger(dashboard.pendingWithdrawals), 'Withdrawal dashboard counter is missing.');
assert(Number.isInteger(dashboard.escrow?.held), 'Escrow dashboard balance is missing.');
assert(Number.isInteger(dashboard.walletLiability?.balance), 'Wallet liability is missing.');
assert(Array.isArray(payments), 'Payments endpoint did not return a list.');
assert(Array.isArray(escrows), 'Escrow endpoint did not return a list.');
assert(Array.isArray(refunds), 'Refunds endpoint did not return a list.');
assert(Array.isArray(invoices), 'Invoices endpoint did not return a list.');
assert(Array.isArray(withdrawals), 'Withdrawals endpoint did not return a list.');
assert(Array.isArray(ledger), 'Ledger endpoint did not return a list.');

const csvResponse = await fetch(`${API_ORIGIN}/v1/admin/finance/ledger/export`, { headers });
assert(csvResponse.ok, `Ledger export failed with ${csvResponse.status}.`);
assert(csvResponse.headers.get('content-type')?.includes('text/csv'), 'Ledger export has the wrong content type.');
const csv = await csvResponse.text();
assert(csv.includes('"created_at"') && csv.includes('"reference_id"'), 'Ledger CSV columns are incomplete.');

if (invoices.length > 0) {
  const pdfResponse = await fetch(`${API_ORIGIN}/v1/admin/finance/invoices/${invoices[0].id}/pdf`, { headers });
  assert(pdfResponse.ok, `Invoice PDF failed with ${pdfResponse.status}.`);
  assert(pdfResponse.headers.get('content-type')?.includes('application/pdf'), 'Invoice download is not a PDF.');
  const signature = Buffer.from(await pdfResponse.arrayBuffer()).subarray(0, 5).toString('ascii');
  assert(signature === '%PDF-', 'Invoice file signature is invalid.');
}

const opsLogin = await login(ops);
const forbidden = await fetch(`${API_ORIGIN}/v1/admin/finance/dashboard`, {
  headers: { authorization: `Bearer ${opsLogin.accessToken}` },
});
assert(forbidden.status === 403, `Ops scope must not access Finance; received ${forbidden.status}.`);

console.log('Phase 4 Finance contract passed: payment, escrow, refund, invoice PDF, withdrawal, ledger CSV, and scope isolation.');
