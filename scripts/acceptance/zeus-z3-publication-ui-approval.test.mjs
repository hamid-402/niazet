import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { z3PublicationPins, z3PublicationOriginalRef, inverseZ3PublicationInput, matchesZ3PublicationApproval, verifyZ3PublicationApproval } from '../orbit-z3-publication-ui-approval.mjs';
import { inverseRegistrationInput, matchesRegistrationApproval } from '../orbit-z3-registration-approval.mjs';
import { inverseCustomerContinuation } from '../orbit-z3-customer-continuation-approval.mjs';
const root = new URL('../../', import.meta.url), rawRead = p => readFileSync(new URL(p, root));
// B3 remains a historical certificate, never new registration acceptance.
const read = p => inverseRegistrationInput(p, inverseCustomerContinuation(p, rawRead(p)));
function historicalApiDiff() {
  const changed = execFileSync('git', ['diff', '--name-only', z3PublicationOriginalRef, '--', 'apps/api/'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(Boolean);
  for (const p of changed) {
    assert(matchesRegistrationApproval(p, rawRead(p)), 'Unapproved backend change: ' + p);
    assert.equal(text(read(p)), text(old(p)), 'Exact historical backend reconstruction failed: ' + p);
  }
  return changed.filter(p => !matchesRegistrationApproval(p, rawRead(p))).join('\n');
}
const text = b => b.toString('utf8').replaceAll('\r\n', '\n');
const old = p => execFileSync('git', ['show', z3PublicationOriginalRef + ':' + p], { cwd: root, windowsHide: true });
const hash = b => createHash('sha256').update(text(b)).digest('hex');
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url)), ts = require('typescript');
test('B3 is exact presentation/test scope and retains the fixed earlier reference', () => {
  assert.equal(z3PublicationOriginalRef, '3868336'); verifyZ3PublicationApproval(read);
  assert(Object.keys(z3PublicationPins).every(p => !p.startsWith('apps/api/')));
  for (const [p, pin] of Object.entries(z3PublicationPins)) if (pin.before !== null) assert.equal(text(inverseZ3PublicationInput(p, read(p))), text(old(p)));
});
test('all modified/missing bytes fail and only CRLF is normalized', () => {
  for (const p of Object.keys(z3PublicationPins)) {
    const changed = Buffer.concat([read(p), Buffer.from('\n// drift')]);
    assert.equal(matchesZ3PublicationApproval(p, changed), false); assert.equal(inverseZ3PublicationInput(p, changed), changed);
    assert.throws(() => verifyZ3PublicationApproval(path => path === p ? changed : read(path)), /pin drift/);
    assert.throws(() => verifyZ3PublicationApproval(path => path === p ? Buffer.alloc(0) : read(path)), /pin drift/);
    assert(matchesZ3PublicationApproval(p, Buffer.from(text(read(p)).replaceAll('\n', '\r\n'))));
  }
});
test('backend, auth, shared file implementation, state machine and earlier gates are byte-identical', () => {
  assert.equal(historicalApiDiff(), '');
  for (const p of ['apps/web/src/lib/auth-context.tsx', 'apps/web/src/lib/api.ts', 'apps/web/src/components/secure-file.tsx', 'apps/web/src/components/confirmation-modal.tsx', 'scripts/orbit-preservation-contract.mjs', 'scripts/acceptance/zeus-z3-output-gate.mjs']) assert.equal(text(read(p)), text(old(p)));
  for (const p of ['apps/api/src/files/output-publication.service.ts', 'apps/api/prisma/schema.prisma', 'apps/api/src/auth/auth.service.ts', 'apps/api/src/finance/ledger.service.ts', '__proto__', 'apps/web/src/../components/output-publication-contract.ts']) assert.equal(matchesZ3PublicationApproval(p, Buffer.from('')), false);
});
test('previous QC/UI receipt is unchanged and every old input is reconstructable', () => {
  const path = 'docs/zeus/z3-qc-acceptance.json'; assert.equal(text(read(path)), text(old(path)));
  for (const [p, expected] of Object.entries(JSON.parse(read(path)).fileHashes)) assert.equal(hash(inverseZ3PublicationInput(p, read(p))), expected, 'Previous QC/UI input drift: ' + p);
});
test('customer actions retain exactly their previous function bodies and all seven tabs', () => {
  const path = 'apps/web/src/app/(customer)/orders/[id]/page.tsx';
  function actions(bytes) { const source = ts.createSourceFile(path, text(bytes), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = {}; const walk = node => { if (ts.isFunctionDeclaration(node) && ['runAction', 'assertLegacyPayment', 'submitCustomerDecision'].includes(node.name?.text)) found[node.name.text] = node.getText(source).replace(/\s+/g, ' '); ts.forEachChild(node, walk); }; walk(source); return found; }
  assert.equal(Object.keys(actions(read(path))).length, 3); assert.deepEqual(actions(read(path)), actions(old(path)));
  for (const label of ['خلاصه', 'مراحل', 'گزارش‌ها', 'فایل‌ها', 'پیام‌ها', 'پرداخت‌ها', 'تیکت‌ها']) assert(text(read(path)).includes('"' + label + '"'));
});
test('every original acceptance assertion remains in the runner and QC UI fixture', () => {
  function assertions(bytes) { const source = ts.createSourceFile('acceptance.mjs', text(bytes), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), calls = []; const walk = node => { if (ts.isCallExpression(node) && /^assert(?:\.|$)/.test(node.expression.getText(source))) calls.push(node.getText(source).replace(/\s+/g, ' ')); ts.forEachChild(node, walk); }; walk(source); return calls; }
  for (const path of ['scripts/acceptance/zeus-z3-output-postgres.mjs', 'apps/web/scripts/zeus-z3-qc-runtime.mjs']) {
    const current = assertions(read(path)); for (const call of assertions(old(path))) { const index = current.indexOf(call); assert(index >= 0, 'Original acceptance assertion removed: ' + call); current.splice(index, 1); }
  }
});
