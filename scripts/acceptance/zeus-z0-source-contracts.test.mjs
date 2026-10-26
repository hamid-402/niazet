import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSourceContracts,
  checkSourceContracts,
  sourceClauses,
  inSection,
} from "./zeus-z0-source-contracts.mjs";
import {
  plannedEndpoints,
  preservedScenario,
  rowScenarios,
} from "./zeus-z0-scenarios.mjs";
const review = buildSourceContracts();
test("four complete source texts retain all2520 units and2528 clauses without feature-count inference", () => {
  checkSourceContracts(review);
  assert.deepEqual(
    review.documents.map((doc) => [doc.id, doc.sourceUnits, doc.clauses]),
    [
      ["D1", 346, 346],
      ["D3", 990, 993],
      ["D4", 98, 102],
      ["D5", 1086, 1087],
    ],
  );
  assert.match(review.interpretation, /not a claim/);
});
test("every retained source clause points to real canonical parent criteria, not a nonexistent feature", () => {
  const ids = new Set(review.parentContracts.map((parent) => parent.id));
  assert.equal(ids.size, 351);
  for (const doc of review.documents)
    for (const unit of doc.units) {
      assert(
        unit.sourceText &&
          unit.sourceTextHash &&
          unit.parentRequirements.every((id) => ids.has(id)),
      );
      assert(
        unit.clauses.every(
          (clause) => clause.exactClause && clause.plannedAcceptanceCase,
        ),
      );
    }
});
test("semicolon clauses preserve conjunctions/slashes/commas and section containment is not numeric prefix", () => {
  assert.deepEqual(sourceClauses("a، b / c و d؛ e"), ["a، b / c و d", "e"]);
  assert.equal(inSection("12.1", "12"), true);
  assert.equal(inSection("12", "1"), false);
});
test("source tree/column/API units carry typed responsibility references", () => {
  const units = review.documents[0].units;
  assert.equal(
    units.filter((unit) => unit.structured?.type === "tree").length,
    118,
  );
  assert.equal(
    units.filter((unit) => unit.structured?.type === "column").length,
    105,
  );
  assert.equal(
    units.filter((unit) => unit.structured?.type === "api").length,
    29,
  );
});
test("source precedences do not activate source document instructions or publish private legacy review", () => {
  assert.match(review.policies.precedence, /DEC11/);
  assert.match(review.policies.privacy, /never internal/);
  assert.match(review.policies.privacy, /no automatic/i);
  assert.equal(review.phaseAccepted, false);
});
test("five absent endpoints have explicit planned code/behavior, never fake current files", () => {
  assert.equal(Object.keys(plannedEndpoints).length, 5);
  for (const [id, endpoint] of Object.entries(plannedEndpoints)) {
    const parent = review.parentContracts.find((parent) => parent.id === id);
    assert(
      parent &&
        !parent.codeCandidates.length &&
        parent.plannedCodeTargets.length &&
        endpoint.contract,
    );
    assert.equal(parent.productAccepted, false);
  }
});
test("preserved and gap clauses retain different concrete acceptance plans", () => {
  assert.match(preservedScenario("ZEUS-V4-065"), /debit\/credit/);
  assert.match(preservedScenario("ZEUS-ADD-L04"), /double-reverse/);
  assert.match(preservedScenario("ZEUS-OPS-013"), /queued is not sent/i);
  assert.deepEqual(
    rowScenarios([
      {
        text: "| ID | section | phase | score | work | verify every guarded outcome |",
      },
    ]),
    ["verify every guarded outcome"],
  );
});
for (const [name, mutate] of [
  [
    "dropped clause",
    (r) => {
      r.documents[0].units.pop();
    },
  ],
  [
    "rewritten source",
    (r) => {
      r.documents[1].units[0].sourceText = "different";
    },
  ],
  [
    "fake phase/product acceptance",
    (r) => {
      r.phaseAccepted = true;
    },
  ],
])
  test(`source review rejects ${name}`, () => {
    const changed = structuredClone(review);
    mutate(changed);
    assert.throws(() => checkSourceContracts(changed, review));
  });
