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

const demoResponse = await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`);
assert(demoResponse.ok, 'Development demo accounts are unavailable.');
const demo = await demoResponse.json();
const customer = demo.accounts.find((account) => account.phone === '09120000009');
assert(customer, 'Customer demo account is missing.');

const login = await json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: customer.phone, password: customer.password }),
}));
const authorization = `Bearer ${login.accessToken}`;
const orders = await json(await fetch(`${API_ORIGIN}/v1/customer/orders?pageSize=1`, {
  headers: { authorization },
}));
assert(orders[0]?.id, 'A customer order is required for the file contract test.');

const form = new FormData();
const expected = `Niazat secure file contract ${new Date().toISOString()}`;
form.append('file', new Blob([expected], { type: 'text/plain' }), 'phase4-contract.txt');
form.append('orderId', orders[0].id);
form.append('fileKind', 'input');
const uploaded = await json(await fetch(`${API_ORIGIN}/v1/files/upload`, {
  method: 'POST',
  headers: { authorization },
  body: form,
}));
assert(uploaded.scanStatus === 'clean', 'Uploaded file did not pass the development scanner.');

const grant = await json(await fetch(`${API_ORIGIN}/v1/files/${uploaded.id}/signed-url`, {
  headers: { authorization },
}));
const firstDownload = await fetch(new URL(grant.url, API_ORIGIN));
assert(firstDownload.ok, `Signed download failed with ${firstDownload.status}.`);
assert(await firstDownload.text() === expected, 'Downloaded content does not match the upload.');
const replay = await fetch(new URL(grant.url, API_ORIGIN));
assert(replay.status === 403, `Used signed URL must be rejected; received ${replay.status}.`);

const rejectedForm = new FormData();
rejectedForm.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'unsafe.html');
rejectedForm.append('orderId', orders[0].id);
rejectedForm.append('fileKind', 'input');
const rejected = await fetch(`${API_ORIGIN}/v1/files/upload`, {
  method: 'POST',
  headers: { authorization },
  body: rejectedForm,
});
assert(rejected.status === 400, `Disallowed MIME must be rejected; received ${rejected.status}.`);

console.log('Phase 4 secure file contract passed: upload, scan, signed download, one-time replay protection, MIME rejection.');
