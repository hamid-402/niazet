import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { verifyZ3OutputApproval } from '../orbit-z3-output-approval.mjs';
import { verifyZ3UiApproval } from '../orbit-z3-customer-ui-approval.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const json = p => JSON.parse(read(p));
const hash = b => createHash('sha256').update(b.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
export function verifyOutputGate() {
  const proof = json('docs/zeus/z3-qc-acceptance.json');
  assert.equal(proof.packet, 'Z3-QC-01/02'); assert.equal(proof.baseline, '2c701d7');
  assert.equal(proof.sourceAccepted, true); assert.equal(proof.readyForLocalActivation, true);
  assert.equal(proof.phaseAccepted, false); assert.equal(proof.remoteCiAccepted, false);
  assert.equal(proof.liveProvidersAccepted, false);
  verifyZ3OutputApproval(read); verifyZ3UiApproval(read);
  for (const [p, expected] of Object.entries(proof.fileHashes)) assert.equal(hash(read(p)), expected, 'QC accepted input drift: ' + p);
  const db = json('.artifacts/zeus/z3-file-qc/report.json');
  assert.deepEqual(db, proof.acceptance.postgres); assert.equal(db.status, 'passed'); assert.equal(db.cases.length, 15);
  assert.equal(db.mainDatabaseConnected, false); assert.equal(db.liveProvidersUsed, false);
  assert.equal(db.temporaryDatabaseRemoved, true); assert.equal(db.generatedFixtureRemoved, true);
  assert.equal(db.upgrade.migrationCount, 27); assert.equal(db.upgrade.previousTablesPreserved, 77);
  assert.equal(db.upgrade.oldRowsAndColumnsUnchanged, true); assert.equal(db.upgrade.previousGeneratedClientReadWrite, true);
  assert.equal(db.upgrade.noAutomaticLegacyApproval, true);
  for (const [p, expected] of Object.entries({ ...db.sourceHashes, ...db.compiledHashes })) assert.equal(hash(read(p)), expected, 'QC runtime evidence input drift: ' + p);
  const ui = json('.artifacts/zeus/z3-qc-ui/report.json'); assert.deepEqual(ui, proof.acceptance.ui);
  assert.equal(ui.status, 'passed'); assert.equal(ui.mainDatabaseTouched, false); assert.equal(ui.uiFixturesOnly, true); assert.equal(ui.results.length, 4);
  for (const r of ui.results) { assert.equal(r.status, 'passed'); assert.equal(r.axeViolations, 0); assert.equal(r.noChecklistNeedsHumanAndReason, true); assert.equal(r.legacyCannotAutoApprove, true); }
  const historical = json('.artifacts/zeus/z3-historical-z2/report.json'); assert.deepEqual(historical, proof.acceptance.historicalZ2);
  assert.equal(historical.status, 'passed'); assert.equal(historical.cases.length, 20); assert.equal(historical.upgrade.migrationCount, 26);
  assert.equal(historical.mainDatabaseConnected, false); assert.equal(historical.historicalTarget.currentPhaseAccepted, false);
  assert.equal(historical.temporaryDatabaseRemoved, true); assert.equal(historical.generatedMigrationFixtureRemoved, true);
  assert.equal(historical.customerUiContractAcceptedAgainstRealHttp, true);
  assert.equal(historical.customerUiContractHash, hash(read('apps/web/src/components/commercial-order-contract.ts')));
  const commercialUi = json('.artifacts/zeus/z3-commercial-ui/report.json'); assert.deepEqual(commercialUi, proof.acceptance.commercialUi);
  assert.equal(commercialUi.status, 'passed'); assert.equal(commercialUi.mainDatabaseTouched, false); assert.equal(commercialUi.results.length, 8);
  for (const r of commercialUi.results) { assert.equal(r.status, 'passed'); assert.equal(r.axeViolations, 0); assert.equal(r.fingerprintBoundAcceptance, true); assert.equal(r.freshPaymentRevocationBlocksWrite, true); assert.equal(r.malformedContractFailsClosed, true); }
  assert.equal(proof.acceptance.api.suitesPassed, 49); assert.equal(proof.acceptance.api.testsPassed, 442); assert.equal(proof.acceptance.api.preExistingSkipped, 1);
  return proof;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyOutputGate(); console.log(JSON.stringify({ packet: 'Z3-QC-01/02', status: 'source-and-isolated-acceptance-ready', phaseAccepted: false, mainDatabaseChanged: false }));
}
