import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalActivation } from './zeus-z2-activate-local.mjs';
const env = { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/niazat_local', NODE_ENV: 'development', PAYMENT_GATEWAY_DRIVER: 'mock', LIVE_PROVIDERS_ENABLED: 'false' };
const proof = { phase: 'Z2', sourceAccepted: true, readyForLocalActivation: true, productAccepted: false };
test('local activation requires accepted source, mock development and an explicit real local app DB', () => {
  assert.equal(validateLocalActivation(env, proof).hostname, '127.0.0.1');
  for (const change of [{ NODE_ENV: 'production' }, { PAYMENT_GATEWAY_DRIVER: 'zarinpal' }, { LIVE_PROVIDERS_ENABLED: 'true' }, { DATABASE_URL: 'postgresql://fixture:fixture@example.org/niazat_local' }, { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/postgres' }, { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/niazat_zeus_z2_123_aabbccdd' }]) assert.throws(() => validateLocalActivation({ ...env, ...change }, proof));
  for (const change of [{ sourceAccepted: false }, { readyForLocalActivation: false }, { productAccepted: true }, { phase: 'Z1' }]) assert.throws(() => validateLocalActivation(env, { ...proof, ...change }));
});
