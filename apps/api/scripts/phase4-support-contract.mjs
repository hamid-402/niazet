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
const support = demo.accounts.find((account) => account.phone === '09120000004');
const customer = demo.accounts.find((account) => account.phone === '09120000009');
assert(support, 'Support demo account is missing.');
assert(customer, 'Customer demo account is missing.');

const supportLogin = await login(support);
const supportHeaders = { authorization: `Bearer ${supportLogin.accessToken}` };
const dashboard = await json(await fetch(`${API_ORIGIN}/v1/support/tickets/dashboard/summary`, { headers: supportHeaders }));
assert(Number.isInteger(dashboard.unassigned), 'Unassigned queue count is missing.');
assert(Number.isInteger(dashboard.mine), 'My tickets count is missing.');
assert(Number.isInteger(dashboard.slaAtRisk), 'SLA-at-risk count is missing.');
assert(Number.isInteger(dashboard.breached), 'SLA breach count is missing.');
assert(Array.isArray(dashboard.nextTickets), 'Next-ticket queue is missing.');

const canned = await json(await fetch(`${API_ORIGIN}/v1/support/tickets/canned-replies`, { headers: supportHeaders }));
assert(canned.length >= 3, 'Canned replies are incomplete.');
assert(canned.every((reply) => reply.id && reply.title && reply.body), 'A canned reply is malformed.');

const mine = await json(await fetch(`${API_ORIGIN}/v1/support/tickets?view=mine`, { headers: supportHeaders }));
assert(Array.isArray(mine), 'My tickets endpoint did not return a list.');
assert(mine.every((ticket) => ticket.assignedToUserId === supportLogin.user.id), 'My tickets leaked another assignee.');

const performance = await json(await fetch(`${API_ORIGIN}/v1/support/tickets/performance`, { headers: supportHeaders }));
assert(Number.isInteger(performance.totalReplied), 'Support reply count is missing.');
assert(Number.isInteger(performance.resolved), 'Support resolved count is missing.');
assert(Number.isInteger(performance.slaBreaches), 'Support SLA breach count is missing.');

const customerLogin = await login(customer);
const forbidden = await fetch(`${API_ORIGIN}/v1/support/tickets/dashboard/summary`, {
  headers: { authorization: `Bearer ${customerLogin.accessToken}` },
});
assert(forbidden.status === 403, `Customer must not access support dashboard; received ${forbidden.status}.`);

console.log('Phase 4 support contract passed: dashboard, scoped queue, SLA counters, canned replies, personal performance, and role isolation.');
