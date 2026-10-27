import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { inverseZ2CommercialInput, matchesZ2CommercialApproval, verifyZ2CommercialApproval, z2CommercialOriginalRef, z2CommercialPins } from '../orbit-z2-commercial-approval.mjs';
import { inverseZ3OutputInput } from '../orbit-z3-output-approval.mjs';
const root = new URL('../../', import.meta.url), read = path => readFileSync(new URL(path, root));
const req = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ts = req('typescript');
const before = path => execFileSync('git', ['show', `${z2CommercialOriginalRef}:${path}`], { cwd: root, windowsHide: true });
const text = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');

test('all commercial additions and modifications match exact approved bytes and fixed earlier reference', () => {
  assert.equal(z2CommercialOriginalRef, '4945367');
  verifyZ2CommercialApproval(read);
  for (const [path, pin] of Object.entries(z2CommercialPins)) if (pin.before !== null) assert.equal(text(inverseZ2CommercialInput(path, read(path))), text(before(path)));
});
test('each path rejects modified/missing content and only normalizes line endings', () => {
  for (const path of Object.keys(z2CommercialPins)) {
    const modified = Buffer.concat([read(path), Buffer.from('\n// drift')]);
    assert.equal(matchesZ2CommercialApproval(path, modified), false);
    assert.throws(() => verifyZ2CommercialApproval(p => p === path ? modified : read(p)), /pin drift/);
    assert.equal(inverseZ2CommercialInput(path, modified), modified);
    assert.equal(matchesZ2CommercialApproval(path, Buffer.from(text(read(path)).replaceAll('\n', '\r\n'))), true);
  }
});
test('no folder exemption, auth/ledger/payment aliases or arbitrary control file becomes approved', () => {
  for (const path of ['apps/api/src/auth/auth.service.ts', 'apps/api/src/finance/ledger.service.ts', 'apps/api/prisma/../schema.prisma', 'apps/api/src/pricing/arbitrary.ts', '__proto__', 'scripts/unknown-control.mjs']) assert.equal(matchesZ2CommercialApproval(path, Buffer.from('')), false);
});
test('the entire earlier preservation guard is recovered by removing only three additive wiring pieces', () => {
  let source = text(inverseZ3OutputInput('scripts/orbit-preservation-contract.mjs', read('scripts/orbit-preservation-contract.mjs')));
  for (const insertion of ["import { matchesZ2CommercialApproval, verifyZ2CommercialApproval } from './orbit-z2-commercial-approval.mjs';\n", '  verifyZ2CommercialApproval(read);\n', ' || matchesZ2CommercialApproval(path, read(path))']) {
    assert.equal(source.split(insertion).length, 2); source = source.replace(insertion, '');
  }
  assert.equal(source, text(before('scripts/orbit-preservation-contract.mjs')));
});
function assertions(path, bytes) {
  const source = ts.createSourceFile(path, text(bytes), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const values = [];
  const visit = node => { if (ts.isCallExpression(node) && /^assert(?:\.|$)/.test(node.expression.getText(source))) values.push(node.getText(source).replace(/\s+/g, ' ')); ts.forEachChild(node, visit); };
  visit(source); return values;
}
test('every inherited assertion in all modified controls remains; historical target stays 25, local apply is denied after Z2', () => {
  for (const [path, pin] of Object.entries(z2CommercialPins)) {
    if (pin.before === null || !path.startsWith('scripts/')) continue;
    let bytes = text(inverseZ3OutputInput(path, read(path)));
    if (path === 'scripts/acceptance/zeus-z1-dependency-review.mjs') {
      const extension = ' || matchesZ2CommercialApproval(path, read(path))';
      assert.equal(bytes.split(extension).length, 2, 'Only one exact approved matcher extension');
      bytes = bytes.replace(extension, '');
    }
    const current = assertions(path, bytes);
    for (const assertion of assertions(path, before(path))) {
      const index = current.indexOf(assertion); assert(index >= 0, path + ': inherited assertion removed: ' + assertion); current.splice(index, 1);
    }
  }
  const historical = text(read('scripts/acceptance/zeus-z1-data-upgrade.mjs'));
  assert(historical.includes('assert.equal(names.length, 25)'));
  assert(historical.includes("!process.argv.includes('--apply-local')"));
  assert(historical.includes('Historical target is only used by the disposable rehearsal child'));
});
