import assert from 'node:assert/strict';
import test from 'node:test';
import { ciCommands, ciFixture } from './zeus-z1-ci.mjs';
const input = { CI: 'true', GITHUB_ACTIONS: 'true', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/niazat_ci?schema=public' };
test('only explicit disposable loopback CI fixture, never main or live', () => {
  const text = ciFixture(input); assert.match(text, /LIVE_PROVIDERS_ENABLED="false"/); assert.match(text, /PAYMENT_GATEWAY_DRIVER="mock"/);
  for (const override of [{ CI: undefined }, { GITHUB_ACTIONS: undefined }, { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1/niazat_main' }, { DATABASE_URL: 'postgresql://postgres:postgres@example.org/niazat_ci' }]) assert.throws(() => ciFixture({ ...input, ...override }));
});
test('CI runs existing isolated acceptance, never apply-local or seed main', () => {
  assert.equal(ciCommands.length, 3); assert.equal(ciCommands[2][1], '--rehearse'); assert(!ciCommands.flat().includes('--apply-local'));
});
