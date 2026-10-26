import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sourceLineIndex,
  inspectTraceability,
} from "./zeus-z0-traceability.mjs";
import { extractTree } from "./zeus-z0-inventory.mjs";
import { plannedEndpoints } from "./zeus-z0-scenarios.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) =>
  readFileSync(resolve(root, file), "utf8").replaceAll("\r\n", "\n");
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const unique = (values) => [...new Set(values)];
export function inSection(section, parent) {
  return section === parent || section.startsWith(`${parent}.`);
}
export function sourceClauses(text) {
  // Preserve full source text too. Split only explicit semicolons, never guess
  // that commas/slashes/'and' are independent features or rewrite examples.
  return text
    .split("؛")
    .map((text) => text.trim())
    .filter(Boolean);
}
const contextOwners = {
  D3: {
    0: ["T01"],
    1: ["T01"],
    2: ["ZEUS-V4-005", "ZEUS-V4-006", "ZEUS-V4-008"],
    25: ["ZEUS-OPS-006"],
    28: ["ZEUS-OPS-006"],
    29: ["ZEUS-V4-005", "ZEUS-V4-008", "ZEUS-OPS-006"],
    12.1: ["ZEUS-UI-041", "ZEUS-API4-041"],
  },
  D4: {
    0: ["ZEUS-ADD-S01", "ZEUS-ADD-L01"],
    2.1: ["ZEUS-ADD-L01", "ZEUS-ADD-L09"],
    2.2: ["ZEUS-ADD-L01", "ZEUS-ADD-L02", "ZEUS-ADD-L09"],
    2.7: ["ZEUS-ADD-L09", "ZEUS-ADD-L10"],
    3: ["ZEUS-ADD-S07", "ZEUS-V4-060"],
  },
  D5: {
    0: ["ZEUS-UI-001"],
    1: ["ZEUS-UI-001", "ZEUS-UI-005"],
    2: ["ZEUS-UI-001"],
    20: [
      "ZEUS-V4-093",
      "ZEUS-V4-094",
      "ZEUS-V4-095",
      "ZEUS-V4-096",
      "ZEUS-V4-097",
      "ZEUS-V4-098",
      "ZEUS-V4-099",
      "ZEUS-V4-100",
    ],
    21: ["ZEUS-OPS-006"],
    22: ["ZEUS-UI-001", "ZEUS-UI-005"],
  },
};
const policies = {
  precedence:
    "DEC11: technical logic v4+D4; UI/interaction D5; preserve D1/D2 extra capabilities. Sensitive finance/SLA/cancellation/privacy uses explicit approved DEC contracts, never raw source self-authorization.",
  literalDeviations:
    "DEC01/07/08/09: current Next/Nest/Prisma stack, all historic/current identifiers, four roles/operator=support, current canonical APIs preserved. Record source method/path/storage/technology deviations, do not claim literal parity or create duplicate projects/pages/financial aliases.",
  testMeaning:
    "Each unit's clauses are exact target obligations interpreted with parent scenario+typed schema/diagram/command policies. Planned child acceptance cases must assert the whole source clause and cross-cutting scope/ownership/history/privacy/money constraints; source-line or clause counts are NOT feature/implementation percentages or executed tests.",
  privacy:
    "Customer receives brand/public handler code and own authorized data, never internal HR/contact/payroll/risk/other-owner information. Explicit projection in HTTP/files/export; no automatic legacy email/account merge or public review publication.",
  money:
    "Server-controlled integer Toman, immutable accepted snapshots, balanced append-only Ledger+atomic projection, payload-bound idempotency/concurrency and approved settlement basis. Never infer paid/delivered/live/verified from a UI label or adapter readiness.",
  preservation:
    "Retain every prior feature/page/action/data/test and approved two-theme visual system. Future schema/code changes additive/compatible; rollback preserves financial/history and unknown old values. Existing three exact preservation exceptions, no new runtime permission here.",
  exampleLiterals:
    "Examples, metadata and source self-checks are contextual, not literal example identities or proof of site completion.",
};

export function buildSourceContracts() {
  const inventory = json("docs/zeus/z0-inventory.json"),
    binding = json("docs/zeus/z0-mappings.json"),
    delivery = json("docs/zeus/z0-execution-contract.json");
  const schema = json("docs/zeus/z0-schema-review.json"),
    api = inspectTraceability(binding).api;
  const cards = new Map(delivery.packages.map((card) => [card.id, card]));
  assert.equal(cards.size, 351);
  const parentContracts = [...cards.values()].map((card) => ({
    id: card.id,
    criterion: card.acceptanceCriteria,
    phases: card.phases,
    codeCandidates: card.codeCandidates,
    plannedCodeTargets: plannedEndpoints[card.id]?.files ?? [],
    regressionCandidates: card.regressionCandidates,
    sourceRows: card.sourceRows,
    acceptedCommit: null,
    productAccepted: false,
  }));
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const documents = [];
  for (const source of inventory.sources.filter(
    (source) => source.id !== "D2",
  )) {
    const file = `C:/Users/hamid.kazemi/Desktop/project/نیازت/${source.ownerFilename}`,
      bytes = readFileSync(file);
    assert.equal(
      hash(bytes),
      source.sha256,
      `Owner/source copy changed ${source.id}`,
    );
    const text = bytes.toString("utf8").replaceAll("\r\n", "\n"),
      index = sourceLineIndex(text),
      tree = source.id === "D1" ? extractTree(text) : [];
    if (source.repoCopy)
      assert.equal(
        read(source.repoCopy),
        text,
        `Repository copy text drift ${source.id}`,
      );
    const units = index.lines.map((line) => {
      let refs = [],
        kind = "target-clause",
        structured = null;
      if (source.id === "D1") {
        const treeNode = tree.find((item) => item.sourceLine === line.line);
        const column = schema.columns.find(
          (column) =>
            column.id.startsWith("D1:") && column.sourceLine === line.line,
        );
        const sourceApi = api.find(
          (item) => item.source === "D1" && item.sourceLine === line.line,
        );
        if (treeNode) {
          const mapped = binding.treeMappings.find(
            (item) => item.sourcePath === treeNode.path,
          );
          assert(mapped, `Unmapped tree node ${treeNode.path}`);
          refs = binding.legacyPackets
            .filter((packet) =>
              packet.sourceRefs.some(
                (ref) =>
                  ref === `tree:${treeNode.path.replace(/^niazat\//, "")}`,
              ),
            )
            .map((packet) => packet.id);
          if (!refs.length) refs = ["T01"];
          structured = {
            type: "tree",
            sourcePath: treeNode.path,
            targets: mapped.targets,
            literalClassification: mapped.classification,
          };
          kind = "structured-tree-responsibility";
        } else if (column) {
          const fieldRef = `field:${column.id.slice(3)}`;
          refs = binding.legacyPackets
            .filter((packet) => packet.sourceRefs.includes(fieldRef))
            .map((packet) => packet.id);
          refs.push("T04");
          structured = {
            type: "column",
            ref: column.id,
            schemaReview: "docs/zeus/z0-schema-review.json",
          };
          kind = "typed-schema-contract";
        } else if (sourceApi) {
          refs = [sourceApi.id];
          structured = { type: "api", ref: sourceApi.id };
          kind = "api-contract";
        } else if (line.line >= 389 || (line.line >= 316 && line.line < 340))
          refs = [...cards.keys()].filter((id) => /^F\d\d$/.test(id));
        else if (line.line >= 130 && line.line < 316) {
          refs = ["T04"];
          kind = "schema-context-or-structure";
        } else if (line.line >= 340) {
          refs = ["T07"];
          kind = "api-context-or-structure";
        } else {
          refs = ["T01"];
          kind = "architecture-context-or-structure";
        }
      } else {
        const packets =
          source.id === "D5"
            ? binding.uiPackets
            : binding.domainPackets.filter(
                (packet) => packet.source === source.id,
              );
        refs = packets
          .filter((packet) =>
            packet.sourceSections.some((section) =>
              inSection(line.section, section),
            ),
          )
          .map((packet) => packet.id);
        const contexts = contextOwners[source.id] ?? {};
        const context = Object.keys(contexts)
          .filter((section) => inSection(line.section, section))
          .sort((a, b) => b.length - a.length)[0];
        if (context) {
          refs.push(...contexts[context]);
          if (
            !packets.some((packet) =>
              packet.sourceSections.includes(line.section),
            )
          )
            kind = "shared-policy-or-source-context";
        }
      }
      refs = unique(refs);
      if (/^\s*```/.test(line.text) || /^[\s{}()[\],;]+$/.test(line.text))
        kind = "source-format-structure-not-product-obligation";
      assert(
        refs.length && refs.every((id) => cards.has(id)),
        `Unowned/unknown clause ${source.id}:${line.line}:${line.section}`,
      );
      const clauses = sourceClauses(line.text);
      assert(clauses.length);
      return {
        id: `${source.id}:L${line.line}`,
        sourceLine: line.line,
        sourceSection: line.section,
        sourceText: line.text,
        sourceTextHash: line.sha256,
        kind,
        clauses: clauses.map((text, i) => ({
          id: `${source.id}:L${line.line}:C${i + 1}`,
          exactClause: text,
          plannedAcceptanceCase: `${source.id}-L${line.line}-C${i + 1}`,
        })),
        parentRequirements: refs,
        structured,
        policyProfile: "shared",
        runtimeAccepted: false,
        status:
          "target-contract-traced-preserve-or-implement-not-runtime-acceptance",
      };
    });
    assert.equal(
      units.length,
      index.lines.length,
      `Lost source units ${source.id}`,
    );
    documents.push({
      id: source.id,
      file,
      sha256: source.sha256,
      repoCopy: source.repoCopy,
      repoCopyParity: source.repoCopy
        ? "same text after CRLF normalization; raw bytes may differ"
        : null,
      sourceUnits: units.length,
      clauses: units.reduce((n, unit) => n + unit.clauses.length, 0),
      units,
    });
  }
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    kind: "source-clause-contract-trace-not-product-acceptance",
    phaseAccepted: false,
    productAccepted: false,
    candidateHead: head,
    acceptedCommit: null,
    parentContractHash: hash(JSON.stringify(parentContracts)),
    parentContracts,
    policies,
    documents,
    visualSource: {
      id: "D2",
      review: "docs/zeus/z0-diagram-review.json",
      note: "Image uses dedicated visual/semantic node-edge review, not OCR/source-line counting.",
    },
    interpretation:
      "Full source text and semicolon clauses retained, associated with manually reviewed canonical criteria, target scenarios and typed schema/command/diagram policies. Compound comma/slash/conjunction statements stay intact; this is not a claim that one line equals one atomic capability. Metadata/examples/self-checks do not prove site completion. Each retained clause remains an acceptance obligation under explicit owner decisions and technical/UI precedence; no unassigned source unit or placeholder accepted feature.",
  };
}
export function checkSourceContracts(
  record,
  expected = buildSourceContracts(),
) {
  assert.equal(record.phaseAccepted, false);
  assert.equal(record.productAccepted, false);
  assert.equal(record.acceptedCommit, null);
  assert.deepEqual(
    record,
    expected,
    "Source-clause mapping/policy/criterion drift",
  );
  assert.equal(record.parentContracts.length, 351);
  assert.deepEqual(
    record.documents.map((doc) => doc.id),
    ["D1", "D3", "D4", "D5"],
  );
  assert(
    record.documents.every((doc) =>
      doc.units.every(
        (unit) =>
          unit.parentRequirements.length &&
          unit.clauses.length &&
          !unit.runtimeAccepted,
      ),
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const review = buildSourceContracts();
  if (process.argv.includes("--json")) console.log(JSON.stringify(review));
  else {
    if (process.argv.includes("--check"))
      checkSourceContracts(json("docs/zeus/z0-source-contracts.json"), review);
    console.log(
      JSON.stringify({
        parents: review.parentContracts.length,
        documents: review.documents.map((doc) => ({
          source: doc.id,
          units: doc.sourceUnits,
          clauses: doc.clauses,
        })),
        phaseAccepted: false,
        productAccepted: false,
      }),
    );
  }
}
