import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inverseZ2CommercialInput } from './orbit-z2-commercial-approval.mjs';

// Owner approval 2026-10-27: Z2.1–Z2.6, isolated acceptance first.
// B1 accepts ONLY five additive pure-engine/test files. No financial wiring.
export const z2EngineOriginalRef = 'e961f288e4d4c7487335c282f608b557b52561af';
export const z2EnginePins = {
  'apps/api/src/pricing/policy-json.ts': '562fa3cd016dc5a0e028363461545396e0aa008e1034682756ec8d78c964520a',
  'apps/api/src/pricing/formula-price.ts': 'bfc34761c386c2af12b588039e9c39472b56e090b3aa3a6d9c9d468fb0225dce',
  'apps/api/src/pricing/formula-price.spec.ts': '07de4b2fb09956a11213ec4b67aaa0360a3bd4d828f5629f1c481512f3c64571',
  'apps/api/src/pricing/delivery-window.ts': '871ddf3781b3413e8b5ad7d2ea3c9410b220864816b357e234eab6b808c20ad7',
  'apps/api/src/pricing/delivery-window.spec.ts': '42efaa3bf2002723aa439a60b85484591f3591a8fcfc6c90c5022263167123e5',
};
const text = value => value.toString('utf8').replaceAll('\r\n', '\n');
const hash = value => createHash('sha256').update(text(value)).digest('hex');

export function matchesZ2EngineApproval(path, bytes) {
  return Object.hasOwn(z2EnginePins, path) && hash(bytes) === z2EnginePins[path];
}

export function verifyZ2EngineApproval(read) {
  for (const path of Object.keys(z2EnginePins)) {
    assert(matchesZ2EngineApproval(path, read(path)), 'Z2 engine exact pin drift: ' + path);
  }
  verifyZ2HistoryWiring(read('scripts/acceptance/zeus-z1-dependency-review.mjs'));
}

/** The historical reviewer may recognize only the five exact new pins. */
export function verifyZ2HistoryWiring(current) {
  let source = text(inverseZ2CommercialInput('scripts/acceptance/zeus-z1-dependency-review.mjs', current));
  for (const addition of [
    "import { matchesZ2EngineApproval } from '../orbit-z2-engine-approval.mjs';\n",
    ' || matchesZ2EngineApproval(path, read(path))',
  ]) {
    assert.equal(source.split(addition).length, 2, 'Missing or duplicated Z2 historical wiring');
    source = source.replace(addition, '');
  }
  assert.equal(hash(source), '77ec94060557300f3f5f0df22bbfd1f3a2f95b5868a09992d2f71ed19af86511', 'Historical review changed outside exact Z2 recognition');
  return source;
}

/** Inverse of this packet's wiring must recover the ENTIRE previous guard. */
export function verifyZ2GuardWiring(previous, current) {
  let source = text(inverseZ2CommercialInput('scripts/orbit-preservation-contract.mjs', current));
  const additions = [
    "import { matchesZ2EngineApproval, verifyZ2EngineApproval, verifyZ2GuardWiring, z2EngineOriginalRef } from './orbit-z2-engine-approval.mjs';\n",
    '  verifyZ2EngineApproval(read);\n',
    "  verifyZ2GuardWiring(git('show', `${z2EngineOriginalRef}:scripts/orbit-preservation-contract.mjs`), read('scripts/orbit-preservation-contract.mjs'));\n",
    ' || matchesZ2EngineApproval(path, read(path))',
    "  console.log('Z2-B1: five exact additive engine files accepted; no order/payment/DB activation.');\n",
  ];
  for (const addition of additions) {
    assert.equal(source.split(addition).length, 2, 'Missing or duplicated Z2 guard wiring');
    source = source.replace(addition, '');
  }
  assert.equal(source, text(previous), 'Earlier guard/baseline/assertions changed outside Z2 wiring');
}
