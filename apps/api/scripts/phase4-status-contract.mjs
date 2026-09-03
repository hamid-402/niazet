import { readFile } from 'node:fs/promises';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const response = await fetch(`${API_ORIGIN}/v1/status`);
assert(response.ok, `Public status endpoint failed with ${response.status}.`);
const status = await response.json();
assert(
  ['operational', 'degraded'].includes(status.status),
  'Overall status is invalid.',
);
assert(typeof status.generatedAt === 'string', 'Status timestamp is missing.');
assert(Array.isArray(status.components), 'Status components are missing.');
assert(Array.isArray(status.incidents), 'Public incidents are missing.');
const componentIds = new Set(status.components.map((item) => item.id));
for (const id of ['api', 'database', 'storage', 'background']) {
  assert(componentIds.has(id), `Status component ${id} is missing.`);
}
const serialized = JSON.stringify(status);
for (const forbidden of [
  'ipAddress',
  'lastError',
  'storageKey',
  'userId',
  'exception',
]) {
  assert(
    !serialized.includes(forbidden),
    `Public status leaked internal field ${forbidden}.`,
  );
}

const proxy = await fetch(`${WEB_ORIGIN}/api/backend/status`);
assert(proxy.ok, `Web status proxy failed with ${proxy.status}.`);
const proxiedStatus = await proxy.json();
assert(
  proxiedStatus.status === status.status,
  'Web and API status contracts disagree.',
);

const [page, nav] = await Promise.all([
  readFile('../web/src/app/status/page.tsx', 'utf8'),
  readFile('../web/src/components/public-nav.tsx', 'utf8'),
]);
assert(
  page.includes('60_000') && page.includes('رخدادهای جاری'),
  'Status page refresh or incident UI is incomplete.',
);
assert(
  nav.includes('href="/status"') || nav.includes("href: '/status'"),
  'Public navigation does not link to Status Page.',
);

console.log(
  'Phase 4 status contract passed: public component health, sanitized incidents, BFF access, refresh UI, and navigation.',
);
