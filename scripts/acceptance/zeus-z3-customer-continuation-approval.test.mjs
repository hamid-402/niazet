import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { customerContinuationPins, customerContinuationAdapterPins, customerContinuationGuardPin, matchesCustomerContinuation, inverseCustomerContinuation, verifyCustomerContinuation } from '../orbit-z3-customer-continuation-approval.mjs';
const root = new URL('../../', import.meta.url), read = p => readFileSync(new URL(p, root));
const text = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
test('presentation scope is independent of the API exception and has exact before/after hashes', () => {
  verifyCustomerContinuation(read);
  for (const [p, pin] of Object.entries(customerContinuationPins)) {
    assert(p.startsWith('apps/web/src/') && !p.includes('/lib/'));
    if (pin.before !== null) assert.equal(text(inverseCustomerContinuation(p, read(p))), text(execFileSync('git', ['show', '7e5409f:' + p], { cwd: root, windowsHide: true })));
  }
  assert.equal(customerContinuationGuardPin.before, '585f88d1d903f2720b720412ec7cbb2f80b4eec5571881018a483908127ca7b7');
  assert.deepEqual(Object.keys(customerContinuationAdapterPins).sort(), [
    'scripts/acceptance/zeus-z2-commercial-approval.test.mjs', 'scripts/acceptance/zeus-z3-output-approval.test.mjs',
    'scripts/acceptance/zeus-z3-publication-ui-approval.test.mjs', 'apps/web/scripts/zeus-order-composer-contract.test.mjs',
    'apps/web/scripts/phase8-ui-runtime.mjs', 'apps/web/scripts/zeus-commercial-order-runtime.mjs',
    'apps/web/tests/phase8-visual-baseline.json',
  ].sort());
  for (const p of Object.keys(customerContinuationAdapterPins)) assert.equal(text(inverseCustomerContinuation(p, read(p))), text(execFileSync('git', ['show', '7e5409f:' + p], { cwd: root, windowsHide: true })));
});
test('baseline changes only reviewed home/auth/QC scenarios; 174 other records are exactly preserved', () => {
  const p = 'apps/web/tests/phase8-visual-baseline.json';
  const before = JSON.parse(execFileSync('git', ['show', '7e5409f:' + p], { cwd: root, windowsHide: true })).snapshots;
  const after = JSON.parse(read(p)).snapshots;
  assert.equal(after.length, 192); assert.equal(before.length, 192);
  const changed = after.filter(n => JSON.stringify(n) !== JSON.stringify(before.find(o => o.key === n.key)));
  assert.equal(changed.length, 18); assert.equal(after.length - changed.length, 174);
  assert.deepEqual([...new Set(changed.map(n => n.key.split('__')[0]))].sort(), ['auth-login', 'ops-qc', 'public-home']);
  for (const item of changed) {
    const previous = before.find(o => o.key === item.key);
    assert.deepEqual(item.colors, previous.colors); assert.deepEqual(item.headings, previous.headings);
    assert.equal(item.counts.controls, previous.counts.controls);
    assert.equal(item.counts.links, previous.counts.links + (item.key.startsWith('public-home') ? 0 : 1));
  }
});
test('every UI or guard byte mutation and missing file fails; unknown paths never gain an inverse', () => {
  for (const p of [...Object.keys(customerContinuationPins), ...Object.keys(customerContinuationAdapterPins), 'scripts/orbit-preservation-contract.mjs', 'scripts/acceptance/zeus-z1-dependency-review.mjs']) {
    for (const bytes of [Buffer.alloc(0), Buffer.concat([read(p), Buffer.from(' ')])]) {
      assert.equal(matchesCustomerContinuation(p, bytes), false); assert.strictEqual(inverseCustomerContinuation(p, bytes), bytes);
      assert.throws(() => verifyCustomerContinuation(path => path === p ? bytes : read(path)), /pin drift/);
    }
    assert.throws(() => verifyCustomerContinuation(path => { if (path === p) throw new Error('missing'); return read(path); }), /missing/);
  }
  for (const p of ['__proto__', 'apps/api/src/orders/order-state-machine.ts', 'apps/web/src/lib/auth-context.tsx', 'apps/web/src/app/unknown/page.tsx']) {
    const bytes = Buffer.from('unknown'); assert.equal(matchesCustomerContinuation(p, bytes), false); assert.strictEqual(inverseCustomerContinuation(p, bytes), bytes);
  }
});
