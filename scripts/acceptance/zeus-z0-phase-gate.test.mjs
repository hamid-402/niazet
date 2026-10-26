import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateEvidence,
  checkPhaseCertificate,
} from "./zeus-z0-phase-gate.mjs";
test("planning certificate never accepts product or more than the first phase", () => {
  assert.throws(() => checkPhaseCertificate({ contractPhaseAccepted: false }));
  assert.throws(() =>
    checkPhaseCertificate({
      contractPhaseAccepted: true,
      productAccepted: true,
    }),
  );
  assert.throws(() =>
    checkPhaseCertificate({
      contractPhaseAccepted: true,
      productAccepted: false,
      completedZeusPhases: 10,
    }),
  );
});
test("candidate proof binds source/tool/test/lock evidence without reading environment secrets", () => {
  const candidate = candidateEvidence();
  assert.match(candidate.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(candidate.acceptedCommit, null);
  assert(candidate.fileHashes["apps/api/package-lock.json"]);
  assert(
    candidate.fileHashes[
      "scripts/acceptance/zeus-z0-source-contracts.test.mjs"
    ],
  );
  assert(candidate.fileHashes["docs/zeus/z0-source-contracts.json"]);
  assert(
    !Object.keys(candidate.fileHashes).some((file) =>
      /(?:^|\/)\.env(?:\.|$)/.test(file),
    ),
  );
});
test("a valid source fingerprint cannot turn omitted/duplicate test evidence into accepted phase", () => {
  const candidate = candidateEvidence();
  assert.throws(
    () =>
      checkPhaseCertificate({
        contractPhaseAccepted: true,
        productAccepted: false,
        completedZeusPhases: 1,
        remainingZeusPhases: 9,
        candidate,
        results: [],
        testCounts: { tests: 1, pass: 1, fail: 0, skipped: 0 },
      }),
    /Missing\/duplicate/,
  );
});
