import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { z1DataPins, matchesZ1DataApproval, verifyZ1DataApproval } from '../orbit-z1-data-approval.mjs';
import { buildZ1Contracts } from './zeus-z1-contract-inventory.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const old = p => execFileSync('git', ['show', `2c701d7:${p}`], { cwd: root, windowsHide: true });
test('data/API packet has exactly 23 paths and original baseline', () => { assert.equal(Object.keys(z1DataPins).length, 23); verifyZ1DataApproval(old, read); });
test('any modified or absent accepted file fails closed', () => {
  for (const p of Object.keys(z1DataPins)) {
    assert.equal(matchesZ1DataApproval(p, Buffer.concat([read(p), Buffer.from('\n// drift')])), false);
    assert.throws(() => verifyZ1DataApproval(old, path => path === p ? Buffer.from('') : read(path)), /pin drift/);
  }
});
test('no arbitrary finance/auth/schema source or folder is exempt', () => {
  for (const p of ['apps/api/src/finance/ledger.service.ts', 'apps/api/src/auth/auth.controller.ts', 'apps/api/prisma/unapproved.sql']) assert.equal(matchesZ1DataApproval(p, Buffer.from('')), false);
});
test('source cannot replace its own original checkpoint', () => { assert.throws(() => verifyZ1DataApproval(read, read), /baseline drift/); });
test('all 29 D1 and 55 D3 API identities remain, 120 SQL fields are bound', () => {
  const c = buildZ1Contracts();
  assert.equal(c.api.length, 84); assert.equal(new Set(c.api.map(r => r.id)).size, 84);
  assert.deepEqual(c.api.slice(0, 29).map(r => r.id), Array.from({ length: 29 }, (_, i) => 'API' + String(i + 1).padStart(2, '0')));
  assert.equal(c.api.slice(29).length, 55);
  assert.equal(c.data.length, 120); assert.equal(new Set(c.data.map(r => r.source + ':' + r.table + '.' + r.column.name)).size, 120);
  assert(c.api.every(r => r.targets.length > 0)); assert(c.data.every(r => r.targets.length > 0));
});
test('review consent/phone proof/history unknown are explicit, AI remains deferred', () => {
  const c = buildZ1Contracts();
  assert.equal(c.api.filter(r => r.deferredProvider).length, 3);
  assert.deepEqual(c.data.find(r => r.table === 'users' && r.column.name === 'is_verified').targets.map(t => t.ref), ['UserLoginState.phoneVerifiedAt']);
  assert.deepEqual(c.data.find(r => r.table === 'reviews' && r.column.name === 'is_public').targets.map(t => t.ref), ['PublicServiceReview.publicConsent', 'PublicServiceReview.moderationStatus', 'PublicServiceReview.publishedAt']);
  assert.match(c.unknownHistoryPolicy, /No backfill/);
});
