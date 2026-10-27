import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inverseZ2CommercialInput, verifyZ2CommercialApproval } from '../orbit-z2-commercial-approval.mjs';
import { verifyZ2GuardWiring, verifyZ2HistoryWiring } from '../orbit-z2-engine-approval.mjs';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const evidence = json('docs/zeus/z2-phase-acceptance.json');
assert.equal(evidence.phase, 'Z2'); assert.equal(evidence.baseline, '2c701d7');
assert.equal(evidence.sourceAccepted, true); assert.equal(evidence.readyForLocalActivation, true);
assert.equal(evidence.productAccepted, false); assert.equal(evidence.remoteCiAccepted, false);
assert.deepEqual(evidence.localSubtasksAccepted, ['Z2.1','Z2.2','Z2.3','Z2.4','Z2.5','Z2.6']);
assert.equal(evidence.acceptance.api.suitesPassed, 48); assert.equal(evidence.acceptance.api.testsPassed, 427); assert.equal(evidence.acceptance.api.preExistingSkipped, 1);
assert.equal(evidence.acceptance.approvalTestsPassed, 66);
assert.equal(evidence.acceptance.legacyWalletAndAuthGroups, 26); assert.equal(evidence.acceptance.orderBranches, 9); assert.equal(evidence.acceptance.rejectedOrderMutations, 45);
assert.equal(evidence.scope.liveProviders, false); assert.equal(evidence.scope.mainFinancialAcceptanceWrites, false);
for (const [path, expected] of Object.entries(evidence.fileHashes)) assert.equal(hash(read(path)), expected, 'Z2 accepted input drift: ' + path);
verifyZ2CommercialApproval(read);
const db = evidence.acceptance.postgres;
assert.deepEqual(json('.artifacts/zeus/z2-phase/report.json'), db, 'Current isolated report differs from accepted proof');
assert.equal(db.status, 'passed'); assert.equal(db.cases.length, 20);
assert.equal(db.mainDatabaseConnected, false); assert.equal(db.liveProvidersUsed, false);
assert.equal(db.temporaryDatabaseRemoved, true); assert.equal(db.generatedMigrationFixtureRemoved, true);
assert.equal(db.upgrade.migrationCount, 26); assert.equal(db.upgrade.previousTablesPreserved, 70);
assert.equal(db.upgrade.oldRowsAndColumnsUnchanged, true); assert.equal(db.upgrade.previousGeneratedClientReadWriteAfterUpgrade, true);
for (const [path, expected] of Object.entries({ ...db.sourceHashes, ...db.compiledHashes })) assert.equal(hash(read(path)), expected, 'Z2 runtime evidence input drift: ' + path);
// Preserve old certificates, not re-label them as current acceptance.
const oldGuard = execFileSync('git', ['show', 'e961f28:scripts/orbit-preservation-contract.mjs'], { cwd: root, windowsHide: true });
verifyZ2GuardWiring(oldGuard, read('scripts/orbit-preservation-contract.mjs'));
for (const [path, expected] of Object.entries(json('docs/zeus/z1-phase-acceptance.json').fileHashes)) {
  const restored = path === 'scripts/orbit-preservation-contract.mjs' ? oldGuard : path === 'scripts/acceptance/zeus-z1-dependency-review.mjs' ? verifyZ2HistoryWiring(read(path)) : inverseZ2CommercialInput(path, read(path));
  assert.equal(hash(restored), expected, 'Z1 historical proof not preserved: ' + path);
}
for (const [path, expected] of Object.entries(json('docs/zeus/z2-engine-acceptance.json').fileHashes)) assert.equal(hash(inverseZ2CommercialInput(path, read(path))), expected, 'B1 historical input not preserved: ' + path);
const pre = process.argv.includes('--pre-activation');
if (!pre) {
  assert.equal(evidence.phaseAccepted, true);
  assert.equal(evidence.localActivation.status, 'passed'); assert.equal(evidence.localActivation.migrationCount, 26);
  assert.equal(evidence.localActivation.previousRowsAndColumnsUnchanged, true);
  assert.equal(evidence.localActivation.mainFinancialAcceptanceWrites, false);
  assert.equal(evidence.runtime.api, 'healthy'); assert.equal(evidence.runtime.web, 'healthy');
  assert.equal(evidence.runtime.allWalletsConsistent, true);
}
console.log(JSON.stringify({ phase:'Z2',status:pre?'source-and-isolated-acceptance-ready':'accepted-local-phase',acceptedSubtasks:6,completeZeusPhases:pre?2:3,productAccepted:false,remoteCiAccepted:false,liveProvidersAccepted:false }));
