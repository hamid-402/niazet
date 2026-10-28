import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyZ3PublicationApproval, inverseZ3PublicationInput } from '../orbit-z3-publication-ui-approval.mjs';
import { verifyZ3UiApproval } from '../orbit-z3-customer-ui-approval.mjs';
import { verifyZ3OutputApproval } from '../orbit-z3-output-approval.mjs';
const root = new URL('../../', import.meta.url), read = p => readFileSync(new URL(p, root));
const json = p => JSON.parse(read(p));
const hash = b => createHash('sha256').update(b.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const proof = json('docs/zeus/z3-publication-ui-acceptance.json');
assert.equal(proof.packet, 'Z3-B3-publications'); assert.equal(proof.baseline, '2c701d7'); assert.equal(proof.baseHead, '3868336');
assert.equal(proof.sourceAccepted, true); assert.equal(proof.phaseAccepted, false); assert.equal(proof.remoteCiAccepted, false); assert.equal(proof.liveProvidersAccepted, false);
verifyZ3PublicationApproval(read); verifyZ3UiApproval(read); verifyZ3OutputApproval(read);
for (const [p, expected] of Object.entries(proof.fileHashes)) assert.equal(hash(read(p)), expected, 'B3 accepted source drift: ' + p);
assert.equal(execFileSync('git', ['diff', '--name-only', '3868336', '--', 'apps/api/'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), '', 'This packet grants no backend changes');
assert.equal(hash(read('docs/zeus/z3-qc-acceptance.json')), hash(execFileSync('git', ['show', '3868336:docs/zeus/z3-qc-acceptance.json'], { cwd: root, windowsHide: true })));
for (const [p, expected] of Object.entries(json('docs/zeus/z3-qc-acceptance.json').fileHashes)) assert.equal(hash(inverseZ3PublicationInput(p, read(p))), expected, 'Prior acceptance input not preserved: ' + p);
const ui = json('.artifacts/zeus/z3-publication-ui/report.json'), db = json('.artifacts/zeus/z3-publication-ui/postgres/report.json');
assert.deepEqual(ui, proof.acceptance.browser); assert.deepEqual(db, proof.acceptance.postgres);
assert.equal(ui.status, 'passed'); assert.equal(ui.results.length, 8); assert.equal(ui.realAuthApiDatabaseAndStorage, true); assert.equal(ui.mainDatabaseConnected, false);
assert.equal(ui.realSessionsReusedAcrossViewportMatrix, true); assert.equal(ui.caseCadenceMs, 13000);
for (const result of ui.results) {
  assert.equal(result.status, 'passed'); assert.equal(result.axeViolations, 0);
  for (const key of ['customerHeldUntilExactRelease', 'realDownloadedBytesMatch', 'explicitHumanReasonAndChecklist', 'cancelDoesNotPublish', 'retryKeyStable', 'pendingBindingDoesNotPublish', 'realQcFinallyPublishes', 'statusReadFailureBlocksPreviouslyReleasedUi', 'modalWithinViewport']) assert.equal(result[key], true);
}
assert.equal(db.status, 'passed'); assert.equal(db.cases.length, 15); assert.equal(db.mainDatabaseConnected, false); assert.equal(db.liveProvidersUsed, false);
assert.equal(db.temporaryDatabaseRemoved, true); assert.equal(db.generatedFixtureRemoved, true); assert.deepEqual(db.publicationBrowser, ui);
assert.equal(db.upgrade.migrationCount, 27); assert.equal(db.upgrade.previousTablesPreserved, 77); assert.equal(db.upgrade.oldRowsAndColumnsUnchanged, true); assert.equal(db.upgrade.previousGeneratedClientReadWrite, true);
for (const [p, expected] of Object.entries({ ...db.sourceHashes, ...db.compiledHashes })) assert.equal(hash(read(p)), expected, 'Unchanged API runtime evidence drift: ' + p);
assert.equal(proof.acceptance.publicationContractTestsPassed, 22);
assert.equal(proof.acceptance.relatedApprovalTestsPassed, 67);
for (const [name, path, count] of [['commercial', '.artifacts/zeus/z3-commercial-ui/report.json', 8], ['qc', '.artifacts/zeus/z3-qc-ui/report.json', 4]]) {
  const regression = json(path); assert.deepEqual(regression, proof.acceptance.regressions[name]); assert.equal(regression.status, 'passed'); assert.equal(regression.results.length, count); assert.equal(regression.mainDatabaseTouched, false);
}
console.log(JSON.stringify({ packet: proof.packet, status: 'accepted-local-packet', browserCases: 8, apiGroups: 15, backendChanged: false, phaseAccepted: false, mainDatabaseAcceptanceWrites: false }));
