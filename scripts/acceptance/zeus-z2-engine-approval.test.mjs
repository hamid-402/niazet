import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchesZ2EngineApproval, verifyZ2EngineApproval, verifyZ2GuardWiring, verifyZ2HistoryWiring, z2EngineOriginalRef, z2EnginePins } from '../orbit-z2-engine-approval.mjs';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const guard = 'scripts/orbit-preservation-contract.mjs';
const previous = () => execFileSync('git', ['show', `${z2EngineOriginalRef}:${guard}`], { cwd: root, windowsHide: true });

test('exactly five additive engine inputs, never existing pricing routes or financial wiring', () => {
  assert.equal(z2EngineOriginalRef, 'e961f288e4d4c7487335c282f608b557b52561af');
  assert.deepEqual(Object.keys(z2EnginePins).map(p => p.split('/').at(-1)).sort(), ['delivery-window.spec.ts', 'delivery-window.ts', 'formula-price.spec.ts', 'formula-price.ts', 'policy-json.ts']);
  verifyZ2EngineApproval(read);
});
test('mutated, missing and unknown files fail closed; only CRLF is normalized', () => {
  for (const path of Object.keys(z2EnginePins)) {
    const mutated = Buffer.concat([read(path), Buffer.from('\n// altered')]);
    assert.equal(matchesZ2EngineApproval(path, mutated), false);
    assert.throws(() => verifyZ2EngineApproval(p => p === path ? mutated : read(p)), /pin drift/);
    assert.throws(() => verifyZ2EngineApproval(p => p === path ? Buffer.alloc(0) : read(p)), /pin drift/);
    assert.equal(matchesZ2EngineApproval(path, Buffer.from(read(path).toString().replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))), true);
  }
  for (const path of ['apps/api/src/finance/payments.service.ts', 'apps/api/prisma/schema.prisma', 'apps/api/src/pricing/pricing.service.ts', 'apps/api/src/pricing/unknown.ts', '__proto__']) assert.equal(matchesZ2EngineApproval(path, Buffer.from('')), false);
});
test('all previous guard code and fixed baseline are exactly recoverable', () => {
  verifyZ2GuardWiring(previous(), read(guard));
  assert.throws(() => verifyZ2GuardWiring(previous(), read(guard).toString().replace("const baseline = '2c701d7'", "const baseline = 'HEAD'")), /Earlier guard/);
});
test('missing/duplicated new checks or weakening inherited checks are rejected', () => {
  const source = read(guard).toString();
  for (const changed of [source.replace('  verifyZ2EngineApproval(read);\n', ''), source.replace('  verifyZ2EngineApproval(read);', '  verifyZ2EngineApproval(read);\n  verifyZ2EngineApproval(read);'), source.replace('  verifyParserApproval(read);', '  // skipped prior parser guard')]) assert.throws(() => verifyZ2GuardWiring(previous(), changed));
});
test('the full historical review is reconstructable; inherited rejection cannot be removed', () => {
  const path = 'scripts/acceptance/zeus-z1-dependency-review.mjs';
  const source = read(path).toString();
  const historical = execFileSync('git', ['show', `${z2EngineOriginalRef}:${path}`], { cwd: root, windowsHide: true }).toString().replaceAll('\r\n', '\n');
  assert.equal(verifyZ2HistoryWiring(source), historical);
  assert.throws(() => verifyZ2HistoryWiring(source.replace('else assert.fail(`Unapproved historical input drift: ${path}`);', 'else return bytes;')));
  assert.throws(() => verifyZ2HistoryWiring(source.replace(' || matchesZ2EngineApproval(path, read(path))', ' || true')));
});
