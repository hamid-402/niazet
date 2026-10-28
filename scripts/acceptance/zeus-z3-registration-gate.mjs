import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registrationApiPins, verifyRegistrationApproval } from '../orbit-z3-registration-approval.mjs';
import { inverseCustomerContinuation, verifyCustomerContinuation } from '../orbit-z3-customer-continuation-approval.mjs';
const root = new URL('../../', import.meta.url), rawRead = p => readFileSync(new URL(p, root));
verifyCustomerContinuation(rawRead);
verifyRegistrationApproval(p => inverseCustomerContinuation(p, rawRead(p)));
const report = JSON.parse(rawRead('.artifacts/zeus/z3-registration/report.json'));
assert.equal(report.status, 'passed'); assert.equal(report.cases.length, 20);
assert.equal(report.registration.status, 'passed'); assert.equal(report.registration.cases.length, 7);
assert.equal(report.mainDatabaseConnected, false); assert.equal(report.liveProvidersUsed, false);
assert.equal(report.temporaryDatabaseRemoved, true); assert.equal(report.generatedMigrationFixtureRemoved, true);
assert.equal(report.currentAcceptance.historicalReceiptIsCurrentAcceptance, false);
assert.equal(report.currentAcceptance.completePhaseAccepted, false);
assert.equal(report.registration.ledgerImplementationChanged, false);
for (const [p, pin] of Object.entries(registrationApiPins)) assert.equal(report.sourceHashes[p], pin.after, 'Registration evidence missing or stale: ' + p);
for (const [p, expected] of Object.entries({ ...report.sourceHashes, ...report.compiledHashes })) {
  assert.equal(createHash('sha256').update(rawRead(p).toString('utf8').replaceAll('\r\n', '\n')).digest('hex'), expected, 'Current source/compiled evidence drift: ' + p);
}
console.log(JSON.stringify({ packet: 'Z3 fixed registration', status: 'accepted-isolated-backend-packet', originalGroups: 20, registrationGroups: 7, mainDatabaseAcceptanceWrites: false, phaseAccepted: false, uiRuntimeAccepted: false }));
