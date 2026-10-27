import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { z3OutputPins, z3OutputOriginalRef, matchesZ3OutputApproval, inverseZ3OutputInput, verifyZ3OutputApproval } from '../orbit-z3-output-approval.mjs';
import { inverseZ3UiInput, verifyZ3UiApproval } from '../orbit-z3-customer-ui-approval.mjs';
import { validateQcLocalTarget } from './zeus-z3-output-activate-local.mjs';
const root = new URL('../../', import.meta.url), read = p => readFileSync(new URL(p, root));
const text = b => b.toString('utf8').replaceAll('\r\n', '\n');
const before = p => execFileSync('git', ['show', `${z3OutputOriginalRef}:${p}`], { cwd: root, windowsHide: true });
test('local activation rejects nonlocal, maintenance, test, live and production targets', () => {
  const base = { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/niazat' };
  assert.equal(validateQcLocalTarget(base).pathname, '/niazat');
  for (const database of ['postgres', 'template0', 'template1', 'niazat_ci', 'niazat_z3_qc_123_abcd', 'niazat_ui_123', 'niazat_zeus_z2_123']) assert.throws(() => validateQcLocalTarget({ DATABASE_URL: 'postgresql://fixture:fixture@localhost/' + database }));
  for (const field of ['PAYMENT_GATEWAY_DRIVER', 'FILE_SCAN_DRIVER', 'SMS_DRIVER', 'EMAIL_DRIVER']) assert.throws(() => validateQcLocalTarget({ ...base, [field]: 'live' }));
  assert.throws(() => validateQcLocalTarget({ ...base, NODE_ENV: 'production' }));
  assert.throws(() => validateQcLocalTarget({ ...base, LIVE_PROVIDERS_ENABLED: 'true' }));
  assert.throws(() => validateQcLocalTarget({ ...base, STORAGE_DRIVER: 's3' }));
  assert.throws(() => validateQcLocalTarget({ DATABASE_URL: 'postgresql://fixture:fixture@external.example/niazat' }));
});
test('QC scope has exact pins and restores every previous input without rebasing', () => {
  assert.equal(z3OutputOriginalRef, '166804b'); verifyZ3OutputApproval(read); verifyZ3UiApproval(read);
  for (const [p, pin] of Object.entries(z3OutputPins)) if (pin.before !== null) assert.equal(text(inverseZ3OutputInput(p, read(p))), text(before(p)));
});
test('every pinned file rejects tampering and missing bytes, and only normalizes CRLF', () => {
  for (const p of Object.keys(z3OutputPins)) {
    const changed = Buffer.concat([read(p), Buffer.from('\n// unauthorized drift')]);
    assert.equal(matchesZ3OutputApproval(p, changed), false); assert.equal(inverseZ3OutputInput(p, changed), changed);
    assert.throws(() => verifyZ3OutputApproval(path => path === p ? changed : read(path)), /pin drift/);
    assert.throws(() => verifyZ3OutputApproval(path => path === p ? Buffer.alloc(0) : read(path)), /pin drift/);
    assert(matchesZ3OutputApproval(p, Buffer.from(text(read(p)).replaceAll('\n', '\r\n'))));
  }
});
test('auth, roles, state machine and money have no new exemptions and remain byte-identical', () => {
  for (const p of ['apps/api/src/auth/auth.service.ts', 'apps/api/src/finance/ledger.service.ts', 'apps/api/src/finance/payments.service.ts', 'apps/api/src/finance/wallet-payments.service.ts', 'apps/api/src/orders/order-state-machine.ts', 'apps/web/src/lib/auth-context.tsx']) {
    assert.equal(matchesZ3OutputApproval(p, read(p)), false); assert.equal(text(read(p)), text(before(p)));
  }
  for (const p of ['apps/api/src/files/unknown.ts', 'apps/api/prisma/../schema.prisma', '__proto__']) assert.equal(matchesZ3OutputApproval(p, Buffer.from('')), false);
});
test('all OrdersService methods except explicitly approved delivery remain identical AST', () => {
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url)), ts = require('typescript');
  function methods(bytes) {
    const sf = ts.createSourceFile('orders.ts', text(bytes), ts.ScriptTarget.Latest, true);
    const result = {};
    for (const node of sf.statements) if (ts.isClassDeclaration(node) && node.name?.text === 'OrdersService') for (const member of node.members) if (ts.isMethodDeclaration(member)) result[member.name.getText(sf)] = member.getText(sf).replace(/\s+/g, ' ');
    return result;
  }
  const old = methods(before('apps/api/src/orders/orders.service.ts')), current = methods(read('apps/api/src/orders/orders.service.ts'));
  assert.deepEqual(Object.keys(current), Object.keys(old));
  assert.notEqual(current.deliver, old.deliver);
  for (const name of Object.keys(old)) if (name !== 'deliver') assert.equal(current[name], old[name], 'Unauthorized order method change: ' + name);
});
test('baseline and historical Z2 receipt remain unchanged; source changes are not relabelled historical acceptance', () => {
  for (const p of ['docs/zeus/z2-phase-acceptance.json', 'docs/zeus/z1-phase-acceptance.json', 'docs/zeus/z3-composer-acceptance.json']) assert.equal(text(read(p)), text(before(p)));
  const proof = JSON.parse(read('docs/zeus/z2-phase-acceptance.json'));
  assert.equal(proof.baseline, '2c701d7');
  for (const [p, hash] of Object.entries(proof.fileHashes)) {
    const restored = inverseZ3OutputInput(p, inverseZ3UiInput(p, read(p)));
    assert.equal(createHash('sha256').update(text(restored)).digest('hex'), hash, 'Historical Z2 input drift: ' + p);
  }
});
