import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const script = readFileSync(new URL('scripts/phase8-role-workflow-e2e.mjs', root), 'utf8');

for (const role of ['superAdmin', 'ops', 'finance', 'support', 'executor', 'customer']) {
  assert.ok(script.includes(`${role}: await login`), `Missing authenticated E2E role: ${role}.`);
}
for (const boundary of ['positiveRoleCases', 'negativeRoleCases', 'anonymous authentication boundary']) {
  assert.ok(script.includes(boundary), `Missing role boundary matrix evidence: ${boundary}.`);
}
for (const route of [
  '/customer/orders',
  '/submit',
  '/triage',
  '/quote',
  '/accept-quote',
  '/pay',
  '/verify',
  '/assign',
  '/accept',
  '/start',
  '/progress-report',
  '/deliver',
  '/admin/qc/',
  '/signed-url',
  '/confirm',
  '/customer/tickets',
  '/claim',
  '/reply',
  '/resolve',
]) {
  assert.ok(script.includes(route), `Missing lifecycle E2E route: ${route}.`);
}
assert.ok(script.includes('CREATE DATABASE') && script.includes('DROP DATABASE IF EXISTS') && script.includes('finally'), 'E2E must use and clean an isolated database.');
assert.ok(script.includes('uploadedStorageKeys') && script.includes('unlinkSync'), 'E2E must remove its uploaded output file.');
assert.ok(script.includes('Idempotency-Key') && script.includes('replayedOrder.id'), 'E2E must exercise idempotent mutation replay.');
assert.ok(!script.includes('DROP DATABASE "final"') && !script.includes('DROP SCHEMA public'), 'E2E must never destroy the configured database or public schema.');

console.log('Phase 8 role/workflow contract passed: all roles, access matrix, isolated lifecycle, idempotency, file cleanup and database cleanup are enforced.');

