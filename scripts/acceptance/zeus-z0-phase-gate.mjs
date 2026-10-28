import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDelivery,
  compactDelivery,
  checkDelivery,
} from "./zeus-z0-delivery.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const unique = (values) => [...new Set(values)].sort();
const tests = readdirSync(resolve(root, "scripts/acceptance"))
  .filter(
    (name) =>
      name.endsWith(".test.mjs") &&
      (name.startsWith("zeus-") || name === "invoice-approval.test.mjs"),
  )
  .sort()
  .map((name) => `scripts/acceptance/${name}`);
const modules = readdirSync(resolve(root, "scripts/acceptance"))
  .filter((name) => /^zeus-z0-.*\.mjs$/.test(name))
  .map((name) => `scripts/acceptance/${name}`);
const evidence = [
  "z0-execution-contract",
  "z0-decisions",
  "z0-inventory",
  "z0-mappings",
  "z0-domain-review",
  "z0-order-command-review",
  "z0-ticket-command-review",
  "z0-system-command-review",
  "z0-schema-review",
  "z0-diagram-review",
  "z0-source-contracts",
  "z0-security-snapshot",
].map((name) => `docs/zeus/${name}.json`);
const formatted = unique([
  ...modules,
  ...tests,
  ...evidence.filter((file) =>
    /execution-contract|system-command-review|schema-review|diagram-review|source-contracts/.test(
      file,
    ),
  ),
]);

export function candidateEvidence(delivery = buildDelivery()) {
  checkDelivery(json("docs/zeus/z0-execution-contract.json"), delivery);
  const schema = json("docs/zeus/z0-schema-review.json"),
    system = json("docs/zeus/z0-system-command-review.json"),
    orders = json("docs/zeus/z0-order-command-review.json"),
    tickets = json("docs/zeus/z0-ticket-command-review.json"),
    audit = json("docs/zeus/z0-security-snapshot.json");
  const files = unique([
    ...evidence,
    ...modules,
    ...tests,
    "scripts/orbit-preservation-contract.mjs",
    "scripts/orbit-pricing-approval.mjs",
    "scripts/orbit-reconciliation-approval.mjs",
    "scripts/orbit-invoice-approval.mjs",
    ...Object.keys(delivery.candidate.inputs),
    ...Object.keys(schema.sourceHashes),
    ...Object.keys(system.sourceHashes),
    ...Object.keys(orders.facts.inputs),
    ...Object.keys(tickets.facts.inputHashes),
    ...Object.keys(audit.locks),
  ]);
  const fileHashes = Object.fromEntries(
    files.map((file) => [file, hash(readFileSync(resolve(root, file)))]),
  );
  return {
    baseHead: delivery.candidate.head,
    dirty: delivery.candidate.dirty,
    node: process.version,
    fileHashes,
    fingerprint: hash(JSON.stringify(fileHashes)),
    acceptedCommit: null,
  };
}
function run(name, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 12 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "",
    stderr = result.stderr ?? "";
  assert(
    !result.error && result.status === 0,
    `${name} failed: ${result.error?.message ?? ""}\n${stdout.slice(-10000)}\n${stderr.slice(-4000)}`,
  );
  return {
    name,
    command: [executable === process.execPath ? "node" : executable, ...args],
    exitCode: result.status,
    stdoutSha256: hash(stdout),
    stderrSha256: hash(stderr),
    summary: stdout.trim().split(/\r?\n/).slice(-10).join("\n"),
  };
}
export function runPhaseGate() {
  const delivery = buildDelivery(),
    compact = compactDelivery(delivery);
  assert.equal(delivery.packages.length, 351);
  assert(
    compact.packages.every(
      (card) =>
        card.specificScenarios.length &&
        (card.codeCandidates.length || card.plannedCodeTargets.length),
    ),
  );
  assert.equal(delivery.commandReviewProgress.reviewedRoutes, 104);
  assert.equal(delivery.commandReviewProgress.remainingRoutes, 0);
  assert.equal(delivery.commandReviewProgress.readSideEffectContracts, 16);
  for (const gate of delivery.remainingGates.filter(
    (item) => item.id !== "Z0-R6",
  ))
    assert(
      /complete|approved/.test(gate.status),
      `Unfinished upstream contract ${gate.id}`,
    );
  const candidate = candidateEvidence(delivery),
    results = [];
  results.push(
    run("all-related-contract-and-characterization-tests", process.execPath, [
      "--test",
      "--test-concurrency=2",
      "--test-reporter=tap",
      ...tests,
    ]),
  );
  const native = results[0].summary;
  const testCounts = Object.fromEntries(
    [...native.matchAll(/^# (tests|pass|fail|skipped|cancelled) (\d+)$/gm)].map(
      (match) => [match[1], Number(match[2])],
    ),
  );
  assert(
    testCounts.tests > 0 &&
      testCounts.tests === testCounts.pass &&
      testCounts.fail === 0 &&
      testCounts.skipped === 0 &&
      testCounts.cancelled === 0,
    "Native test count incomplete/failed/skipped",
  );
  for (const name of [
    "inventory",
    "traceability",
    "domain-contracts",
    "order-commands",
    "ticket-commands",
    "system-command-review",
    "schema-review",
    "diagram-review",
    "source-contracts",
    "delivery",
  ])
    results.push(
      run(`check-${name}`, process.execPath, [
        `scripts/acceptance/zeus-z0-${name}.mjs`,
        "--check",
      ]),
    );
  results.push(
    run("fixed-baseline-preservation", process.execPath, [
      "scripts/orbit-preservation-contract.mjs",
    ]),
  );
  results.push(
    run("related-format", process.execPath, [
      "apps/api/node_modules/prettier/bin/prettier.cjs",
      "--check",
      ...formatted,
    ]),
  );
  results.push(run("git-diff-check", "git", ["diff", "--check"]));
  assert.equal(
    candidateEvidence(delivery).fingerprint,
    candidate.fingerprint,
    "Candidate changed while phase gate ran",
  );
  return {
    schemaVersion: 1,
    clientDate: "2026-10-25",
    scope:
      "Z0 planning/source/command/execution-contract acceptance only, not product/release/runtime acceptance",
    contractPhaseAccepted: true,
    productAccepted: false,
    completedZeusPhases: 1,
    totalZeusPhases: 10,
    remainingZeusPhases: 9,
    candidate,
    testCounts,
    results,
    coverage: {
      requirements: 351,
      sourceUnits: 2520,
      sourceClauses: 2528,
      sourceUnitCountIsFeatureCount: false,
      sqlColumns: 120,
      sqlTables: 13,
      migrationFiles: 23,
      migrationStatements: 348,
      diagramNodes: 51,
      diagramEdges: 28,
      nonReadCommandContracts: 104,
      readSideEffectContracts: 16,
      jobRunnerRegistrations: 12,
      independentReconciliationScheduler: true,
    },
    implementationStatus:
      "All future feature/bug/HTTP/DB/real-concurrency/browser/performance/security/CI/live-provider obligations stay open in their phases; GAP test pass is reproduced current behavior, never a fix.",
    authority:
      "Fixed baseline2c701d7 and only three existing exact invoice/pricing/missing-account-diagnosis exceptions. No new runtime/auth/finance/schema/data/provider authorization, install, migration, restart, commit or push from this phase gate.",
    notRun: [
      "Full product API Jest/build/Web build/UI192 matrix/real DB/concurrent DB sessions because this packet changes contracts/tooling only; earlier EXEC evidence not claimed freshly rerun",
      "Registry audit not rerun: dated2026-10-24 production API7/Web4 vulnerable nodes remain open; no security-clean claim",
      "CI exact accepted commit unverified; working tree is dirty and acceptedCommit null",
      "Payment/SMS/email/storage/AV/AI live connections remain explicitly owner-deferred, not accepted",
    ],
    nextPhase:
      "Z1 typed data/domain/access/security implementation in independently authorized protected scopes; retain the entire existing product and unified UI.",
  };
}
export function checkPhaseCertificate(record) {
  assert.equal(record.contractPhaseAccepted, true);
  assert.equal(record.productAccepted, false);
  assert.equal(record.completedZeusPhases, 1);
  assert.equal(record.remainingZeusPhases, 9);
  assert.equal(record.candidate.acceptedCommit, null);
  assert.deepEqual(
    record.candidate,
    candidateEvidence(),
    "Accepted Z0 candidate/source drift; certificate is historical, rerun gate for new candidate",
  );
  const expectedNames = [
    "all-related-contract-and-characterization-tests",
    ...[
      "inventory",
      "traceability",
      "domain-contracts",
      "order-commands",
      "ticket-commands",
      "system-command-review",
      "schema-review",
      "diagram-review",
      "source-contracts",
      "delivery",
    ].map((name) => `check-${name}`),
    "fixed-baseline-preservation",
    "related-format",
    "git-diff-check",
  ];
  assert.deepEqual(
    record.results.map((result) => result.name).sort(),
    expectedNames.sort(),
    "Missing/duplicate phase gate",
  );
  assert(
    record.results.every(
      (result) =>
        result.exitCode === 0 &&
        result.command?.length &&
        /^[a-f0-9]{64}$/.test(result.stdoutSha256) &&
        /^[a-f0-9]{64}$/.test(result.stderrSha256),
    ),
  );
  assert(
    record.testCounts.tests === record.testCounts.pass &&
      record.testCounts.fail === 0 &&
      record.testCounts.skipped === 0,
  );
  assert.equal(record.coverage.requirements, 351);
  assert.equal(record.coverage.nonReadCommandContracts, 104);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--check")) {
    const record = json("docs/zeus/z0-acceptance.json");
    checkPhaseCertificate(record);
    console.log(
      JSON.stringify({
        accepted: "Z0-contracts-only",
        tests: record.testCounts.pass,
        candidate: record.candidate.fingerprint,
        productAccepted: false,
        phases: "1/10",
      }),
    );
  } else {
    const record = runPhaseGate();
    if (process.argv.includes("--json")) console.log(JSON.stringify(record));
    else
      console.log(
        JSON.stringify({
          accepted: "Z0-contracts-only",
          tests: record.testCounts.pass,
          productAccepted: false,
          phases: "1/10",
        }),
      );
  }
}
