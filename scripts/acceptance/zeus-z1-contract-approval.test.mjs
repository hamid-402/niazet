import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { z1ContractPins, matchesZ1ContractApproval, verifyZ1ContractApproval } from '../orbit-z1-contract-approval.mjs';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const original = (ref, path) => execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, windowsHide: true });
test('EXEC-009 retains exact thirteen paths and fixed original references', () => {
  assert.equal(Object.keys(z1ContractPins).length, 13);
  for (const [path, pin] of Object.entries(z1ContractPins)) {
    assert.match(pin.after, /^[a-f0-9]{64}$/);
    if (pin.before !== null) assert.equal(pin.originalRef, path.startsWith('apps/web/') ? '30555d2a26bb5f9a4e1649160751929b5354d1bc' : '2c701d7');
  }
  verifyZ1ContractApproval(original, read);
});
test('any mutation in each accepted file fails closed, including new untracked files', () => {
  for (const path of Object.keys(z1ContractPins)) {
    assert.equal(matchesZ1ContractApproval(path, Buffer.concat([read(path), Buffer.from('\n// drift')])), false);
    assert.throws(() => verifyZ1ContractApproval(original, p => p === path ? Buffer.concat([read(p), Buffer.from('\n// drift')]) : read(p)), /approval drift/);
  }
});
test('unknown source is never covered by a directory waiver', () => {
  assert.equal(matchesZ1ContractApproval('apps/api/src/auth/new-unapproved.ts', Buffer.from('')), false);
  assert.equal(matchesZ1ContractApproval('apps/web/src/lib/api.ts', read('apps/web/src/lib/api.ts')), false);
});
test('original history cannot be replaced by the accepted current source', () => {
  assert.throws(() => verifyZ1ContractApproval((_ref, path) => read(path), read), /original contract drift/);
});
