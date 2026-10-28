import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildDelivery,
  compactDelivery,
  checkDelivery,
  sourceRows,
  validateDecisions,
} from "./zeus-z0-delivery.mjs";
import { createHash } from "node:crypto";

const read = (file) =>
  JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));
const current = buildDelivery(),
  record = read("docs/zeus/z0-execution-contract.json");
test("351 execution cards match exact source rows and current evidence without accepting product", () => {
  checkDelivery(record, current);
  assert.equal(current.packages.length, 351);
  assert(
    current.packages.every(
      (card) =>
        card.sourceRows.length &&
        card.productAccepted === false &&
        card.acceptedCommit === null,
    ),
  );
});
test("sixteen target decisions preserve separate protected implementation authority", () => {
  const ledger = read("docs/zeus/z0-decisions.json");
  validateDecisions(ledger);
  for (const id of ["DEC04", "DEC05", "DEC12", "DEC13", "DEC15", "DEC16"])
    assert.match(ledger.decisions[id].implementationAuthority, /No blanket/);
});
test("ticket command review is bound into handoff without hiding remaining routes or open gaps", () => {
  assert.equal(current.commandReviewProgress.nonReadRoutes, 104);
  assert.equal(current.commandReviewProgress.reviewedRoutes, 104);
  assert.equal(current.commandReviewProgress.remainingRoutes, 0);
  assert.equal(current.commandReviewProgress.readSideEffectContracts, 16);
  assert.equal(current.commandReviewProgress.openSystemFindings, 11);
  assert.equal(current.commandReviewProgress.ticketContracts, 8);
  assert.equal(current.commandReviewProgress.openTicketFindings, 8);
  assert(current.candidate.inputs["docs/zeus/z0-ticket-command-review.json"]);
  assert.equal(current.phaseAccepted, false);
});
test("every execution card has specific acceptance and explicit implementation-gap ownership", () => {
  const compact = compactDelivery(current);
  assert(
    compact.packages.every(
      (card) =>
        card.specificScenarios.length &&
        card.plannedAcceptanceCase === card.id &&
        card.plannedAcceptanceRunner,
    ),
  );
  assert.equal(
    compact.packages.filter(
      (card) => !card.codeCandidates.length && card.plannedCodeTargets.length,
    ).length,
    5,
  );
  for (const finding of ["Z0-SYS-AUTH02", "Z0-SYS-FIN02", "Z0-SYS-FILE01"])
    assert(
      compact.packages.some((card) =>
        card.implementationFindings.some((item) => item.id === finding),
      ),
    );
  assert.equal(
    current.sourceContractProgress.sourceUnitsAreFeatureCount,
    false,
  );
});
test("missing/unresolved decisions and forged phase acceptance fail closed", () => {
  const ledger = read("docs/zeus/z0-decisions.json");
  const missing = structuredClone(ledger);
  delete missing.decisions.DEC15;
  assert.throws(() => validateDecisions(missing), /sixteen/);
  const pending = structuredClone(ledger);
  pending.decisions.DEC12.status = "pending";
  assert.throws(() => validateDecisions(pending), /Unresolved/);
  assert.throws(
    () => validateDecisions({ ...ledger, phaseAccepted: true }),
    /not phase acceptance/,
  );
});
test("source row hashes reject changed, absent or duplicated clauses", () => {
  const text = "| A01 | one |";
  const sha = createHash("sha256").update(text).digest("hex");
  assert.equal(
    sourceRows(text, { id: "A01", roadmapRowHashes: [sha] }).length,
    1,
  );
  assert.throws(
    () => sourceRows(text + "changed", { id: "A01", roadmapRowHashes: [sha] }),
    /source row/,
  );
  assert.throws(
    () =>
      sourceRows(text + "\n" + text, { id: "A01", roadmapRowHashes: [sha] }),
    /source row/,
  );
});
test("all 120 SQL declarations retain checks/defaults/FK and explicit no-target dispositions", () => {
  assert.equal(current.columns.length, 120);
  assert.equal(
    current.columns.filter(
      (x) => x.candidates.length === 0 && x.id.startsWith("D1:"),
    ).length,
    12,
  );
  assert(
    current.columns
      .find((x) => x.id === "D4:ledger_entries.amount")
      .sourceContract.checks.includes("amount > 0"),
  );
  assert(
    current.columns
      .find((x) => x.id === "D1:reviews.is_public")
      .disposition[1].includes("no automatic publication"),
  );
});
test("82 D3 model clauses disclose consolidation rather than inventing absent feedback features", () => {
  assert.equal(current.referenceClauses.length, 82);
  const field = current.referenceClauses.find(
    (x) => x.section === "۲۱.۸" && x.name === "order_id",
  );
  assert.deepEqual(field.candidates, []);
  assert.deepEqual(field.semanticCandidates, ["Feedback.orderId"]);
  assert(current.referenceClauses.every((x) => x.runtimeAccepted === false));
});
test("135 diagram subitems remain separate and ambiguous arrows never grant finance or AI authority", () => {
  assert.equal(current.diagramItems.length, 135);
  assert.equal(new Set(current.diagramItems.map((x) => x.id)).size, 135);
  assert.equal(current.diagramDispositions.length, 28);
  for (const id of ["D2-E15", "D2-E16", "D2-E20"]) {
    const edge = current.diagramDispositions.find((x) => x.id === id);
    assert.equal(edge.visualParityClaim, false);
    assert.equal(edge.runtimeAccepted, false);
    assert(edge.targetContract.targetFlows.length > 1);
  }
});
test("five live provider packages stay explicitly deferred, not done", () => {
  const deferred = current.packages.filter(
    (x) => x.status === "live-acceptance-deferred-by-owner",
  );
  assert.deepEqual(
    deferred.map((x) => x.id),
    [
      "ZEUS-OPS-011",
      "ZEUS-OPS-012",
      "ZEUS-OPS-013",
      "ZEUS-OPS-014",
      "ZEUS-OPS-015",
    ],
  );
  assert(
    deferred.every((x) =>
      x.dependencies.includes("provider-specific explicit live authority"),
    ),
  );
});
test("shared profiles reduce duplication without losing risk, rollback or test obligations", () => {
  const compact = compactDelivery(current);
  for (const card of compact.packages) {
    const profile = compact.executionProfiles[card.executionProfile];
    assert(
      profile.risk && profile.rollback && profile.tests.length && profile.owner,
    );
    assert(
      card.acceptanceCriteria &&
        compact.shared.authority &&
        compact.shared.testBudget,
    );
    assert(
      !card.dependencies.some((value) =>
        value.includes("cross-phase acceptance"),
      ),
      "Later Z9 acceptance must not create an implementation dependency cycle",
    );
  }
});
test("removed cards, changed authority and invented acceptance cannot pass the delivery gate", () => {
  const removed = structuredClone(record);
  removed.packages.pop();
  assert.throws(() => checkDelivery(removed, current), /drift/);
  const broad = structuredClone(record);
  broad.shared.authority = "all writes allowed";
  assert.throws(() => checkDelivery(broad, current), /drift/);
  assert.throws(
    () => checkDelivery({ ...record, phaseAccepted: true }, current),
    /must not be accepted/,
  );
});
test("security snapshot is dated evidence with production separate and all findings still open", () => {
  const snapshot = read("docs/zeus/z0-security-snapshot.json");
  for (const report of Object.values(snapshot.reports)) {
    assert(report.metadata.vulnerabilities.total > 0);
    assert(
      report.findings.every(
        (f) => f.runtimeExploitProven === false && f.owner.includes("Z1"),
      ),
    );
  }
  assert.equal(snapshot.phaseAccepted, false);
});
