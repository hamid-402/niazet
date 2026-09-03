import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const controller = read('src/health/health.controller.ts');
const service = read('src/health/health.service.ts');
const sms = read('src/notifications/sms.service.ts');
const email = read('src/notifications/email.service.ts');
const payment = read('src/finance/payment-gateway.ts');
const dockerfile = read('Dockerfile');
const compose = read('../../docker-compose.production.yml');

assert.match(controller, /Get\('health'\)/, 'Liveness endpoint is required.');
assert.match(
  controller,
  /Get\('ready'\)/,
  'Public readiness endpoint is required.',
);
assert.match(
  controller,
  /v1\/admin\/health\/readiness/,
  'Admin readiness detail is required.',
);
assert.match(controller, /503/, 'Not-ready responses must use HTTP 503.');
assert.match(
  service,
  /\$queryRaw`SELECT 1`/,
  'Database readiness must execute a real query.',
);
assert.match(
  service,
  /writeFile\(probePath/,
  'Storage readiness must verify write access.',
);
assert.match(
  service,
  /outboxEvent\.count/,
  'Queue readiness must inspect the durable outbox.',
);
assert.match(
  service,
  /staleLocks/,
  'Queue readiness must detect stale worker locks.',
);
for (const [name, source] of [
  ['SMS', sms],
  ['Email', email],
  ['Payment', payment],
]) {
  assert.match(
    source,
    /readiness\(\)/,
    `${name} adapter must expose readiness.`,
  );
  assert.match(
    source,
    /configured_driver_is_not_implemented/,
    `${name} must reject a configured-but-missing adapter.`,
  );
}
assert.match(
  dockerfile,
  /\/ready/,
  'API image healthcheck must use readiness.',
);
assert.match(compose, /3001\/ready/, 'Compose healthcheck must use readiness.');

console.log('Phase 8 deep readiness contract passed.');
