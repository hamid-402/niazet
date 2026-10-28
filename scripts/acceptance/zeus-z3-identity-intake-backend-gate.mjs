import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identityIntakeHash, identityIntakeApiPins, identityIntakeAdapterPins, verifyIdentityIntake } from '../orbit-z3-identity-intake-approval.mjs';

// A backend sub-packet certificate, not permission to migrate/enable the main
// database, not UI acceptance and not a substitute for deferred provider/CI work.
const root = new URL('../../', import.meta.url), read = p => readFileSync(new URL(p, root));
const json = p => JSON.parse(read(p));
verifyIdentityIntake(read);
const receipt = json('docs/zeus/z3-identity-intake-backend-acceptance.json');
assert.equal(receipt.kind, 'zeus-z3-identity-intake-backend-only');
assert.equal(receipt.backendAccepted, true);
for (const name of ['uiAccepted', 'phaseAccepted', 'mainDatabaseActivated', 'remoteCiAccepted', 'liveProvidersAccepted']) assert.equal(receipt[name], false, name);
for (const [path, hash] of Object.entries(receipt.fileHashes)) assert.equal(identityIntakeHash(read(path)), hash, 'Backend receipt source drift: ' + path);
for (const [path, pin] of Object.entries({ ...identityIntakeApiPins, ...identityIntakeAdapterPins })) assert.equal(receipt.fileHashes[path], pin.after, 'Missing pinned receipt input: ' + path);
for (const path of ['scripts/orbit-z3-identity-intake-approval.mjs', 'scripts/acceptance/zeus-z3-identity-intake-approval.test.mjs', 'scripts/acceptance/zeus-z3-identity-intake-backend-gate.mjs', 'scripts/acceptance/zeus-z3-identity-upgrade.mjs', 'scripts/acceptance/zeus-z3-email-native.mjs', 'scripts/acceptance/zeus-z3-customer-intake-native.mjs']) assert(receipt.fileHashes[path], 'Missing proof input: ' + path);
const report = json(receipt.nativeReport), unit = json(receipt.apiUnitReport);
assert.equal(report.status, 'passed'); assert.equal(report.phaseAccepted, false); assert.equal(report.mainDatabaseConnected, false); assert.equal(report.liveProvidersUsed, false);
assert.equal(report.temporaryDatabaseRemoved, true); assert.equal(report.generatedFixtureRemoved, true);
assert.equal(report.previousTablesPreserved, 78); assert.equal(report.previousRowsAndColumnsUnchanged, true); assert.equal(report.migrationCount, 28);
for (const proof of [report.candidateClientAgainstOldDatabase, report.previousClientAgainstNewDatabase]) { assert.equal(proof.modelsRead, 78); assert.equal(proof.previousDataReadWrite, true); }
assert.equal(report.cases.length, 4);
for (const [section, count] of [['email', 10], ['customerIntake', 8]]) {
  const proof = report[section]; assert.equal(proof.status, 'passed'); assert.equal(proof.cases.length, count); assert.equal(proof.mainDatabaseConnected, false); assert.equal(proof.liveProvidersUsed, false);
  for (const [path, hash] of Object.entries(proof.sourceHashes)) assert.equal(identityIntakeHash(read(path)), hash, 'Native source drift: ' + path);
  for (const [path, hash] of Object.entries(proof.compiledHashes)) assert.equal(identityIntakeHash(read(path)), hash, 'Native compiled drift: ' + path);
}
for (const [path, hash] of Object.entries(report.sourceHashes)) assert.equal(identityIntakeHash(read(path)), hash, 'Migration rehearsal drift: ' + path);
assert.equal(unit.success, true); assert.equal(unit.numFailedTestSuites, 0); assert.equal(unit.numFailedTests, 0);
assert.equal(unit.numPassedTestSuites, 55); assert.equal(unit.numPassedTests, 547); assert.equal(unit.numPendingTests, 1);
assert.equal(receipt.guardTests.passed, 35); assert.equal(receipt.guardTests.failed, 0);
console.log(JSON.stringify({ status: 'passed', scope: receipt.kind, nativeGroups: 22, apiPassed: 547, apiSkipped: 1, guardPassed: 35, backendAccepted: true, phaseAccepted: false, mainDatabaseActivated: false, uiAccepted: false }));
