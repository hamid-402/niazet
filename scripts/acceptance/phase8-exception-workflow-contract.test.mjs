import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runner = readFileSync(new URL('./phase8-exception-workflow-e2e.mjs', import.meta.url), 'utf8');
const branches = readFileSync(new URL('./phase8-order-branches.mjs', import.meta.url), 'utf8');
test('repo-level exception acceptance stays isolated with mock providers and bounded cleanup', () => {
  for (const marker of ['assert.notEqual(databaseName, sourceDatabaseName)', 'CREATE DATABASE', 'DROP DATABASE IF EXISTS', 'finally', 'uploadedStorageKeys', "BACKGROUND_JOBS_ENABLED: 'false'", "LIVE_PROVIDERS_ENABLED: 'false'", "PAYMENT_GATEWAY_DRIVER: 'mock'", 'await verifyOrderBranches(']) assert.ok(runner.includes(marker), marker);
  assert.ok(branches.includes('niazat_e2e_'));
});
test('all exception routes retain negative, replay and Ledger assertions', () => {
  for (const marker of ['/cancel', '/revision', '/dispute', '/resolve-dispute', 'request-rework', 'refund_full', 'refund_partial', 'release_to_executor', 'settleRemainder', 'verifyWalletConsistency', 'financialSnapshot', 'rejectedMutations', 'await replay(']) assert.ok(branches.includes(marker), marker);
  assert.ok(!branches.includes('.order.update(') && !branches.includes('.escrowHold.create('), 'Use real endpoints, not direct status/money fixtures.');
});
