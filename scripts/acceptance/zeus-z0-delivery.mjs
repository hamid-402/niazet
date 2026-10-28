import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectTraceability } from "./zeus-z0-traceability.mjs";
import { checkTicketReview } from "./zeus-z0-ticket-commands.mjs";
import { checkSystemCommandReview } from "./zeus-z0-system-command-review.mjs";
import { checkSchemaReview } from "./zeus-z0-schema-review.mjs";
import { checkDiagramReview } from "./zeus-z0-diagram-review.mjs";
import { checkSourceContracts } from "./zeus-z0-source-contracts.mjs";
import {
  preservedScenario,
  rowScenarios,
  plannedEndpoints,
  targetClarifications,
} from "./zeus-z0-scenarios.mjs";
import {
  inspectDomainContracts,
  compareColumnDeclaration,
  prismaModels,
} from "./zeus-z0-domain-contracts.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n");
const json = (path) => JSON.parse(read(path));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values)];

export function sourceRows(text, requirement) {
  const rows = text
    .split("\n")
    .flatMap((line, index) =>
      requirement.roadmapRowHashes.includes(hash(line))
        ? [{ line: index + 1, text: line, sha256: hash(line) }]
        : [],
    );
  assert.equal(
    rows.length,
    requirement.roadmapRowHashes.length,
    `Missing/duplicate source row: ${requirement.id}`,
  );
  return rows;
}

export function validateDecisions(ledger) {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(
    ledger.phaseAccepted,
    false,
    "Decision record is not phase acceptance",
  );
  assert.deepEqual(
    Object.keys(ledger.decisions).sort(),
    Array.from(
      { length: 16 },
      (_, i) => `DEC${String(i + 1).padStart(2, "0")}`,
    ).sort(),
    "All sixteen decisions required",
  );
  for (const [id, item] of Object.entries(ledger.decisions))
    assert(
      item.choice &&
        item.date &&
        /approved|selected/.test(item.status) &&
        !/pending/.test(item.status),
      `Unresolved decision: ${id}`,
    );
  assert.equal(ledger.protectedBaseline, "2c701d7");
  assert.equal(ledger.implementationExceptions.length, 3);
}

const profiles = {
  Z1: {
    owner: "Codex · backend/data/security",
    risk: "ownership, permission escalation, replay, race, schema compatibility and financial integrity",
    tests: [
      "unauthorized/other-owner/invalid DTO rejected without mutation",
      "idempotent replay and concurrent conflicting command; rollback on dependency failure",
      "migration forward/backward compatibility in isolated DB; no destructive historic backfill",
    ],
    rollback:
      "Compatible code rollback; retain additive schema, immutable ledger/history and all committed transactions. No reset/drop of user data.",
  },
  Z2: {
    owner: "Codex · pricing/capacity",
    risk: "rounding/unit mismatch, stale quote, overbooking and late-payment commitment",
    tests: [
      "normal/30/80 percent and integer boundaries from server source of truth",
      "Tehran 14/21 boundaries, 15-minute hold expiry, retry and atomic competing reservations",
      "late verified money becomes explicit reconciliation without silent loss/refund/commitment",
    ],
    rollback:
      "Disable new offering/holds for new requests; preserve paid commitments and financial evidence; reconcile late callbacks explicitly.",
  },
  Z3: {
    owner: "Codex · public/customer UI",
    risk: "lost draft/input, auth flash, inaccessible controls and mobile layout shift",
    tests: [
      "real ownership/session/error/empty/pending paths and unchanged submit payload",
      "two themes, RTL, four breakpoints, keyboard/focus/reduced-motion; no dead links",
      "performance budgets with same measurement protocol, not skeleton as ready",
    ],
    rollback:
      "Revert only presentation/interaction diff, retaining canonical pages, saved drafts and existing API contracts.",
  },
  Z4: {
    owner: "Codex · execution UX/domain",
    risk: "foreign assignment/file, duplicate delivery, checklist loss and false income/settlement",
    tests: [
      "assigned vs unassigned executor, accept/reject/start/report/checklist/delivery failure paths",
      "safe owned files and independent QC; no terminal/disputed milestone progression",
      "income/withdrawal source is ledger; duplicate and simultaneous actions remain safe",
    ],
    rollback:
      "Disable only new action entrypoint if needed, preserve assignments/reports/files/history and existing complete execution path.",
  },
  Z5: {
    owner: "Codex · support/ops/finance/admin",
    risk: "cross-scope data leak, unsupported KPI, automated HR effect and unreviewed financial action",
    tests: [
      "Ops/Finance/Super/Support positive and negative command/scope/visibility cases",
      "versioned SLA/public first-response, unknown metrics, moderated optional review privacy",
      "notes actually consumed; human authorization/audit on sensitive action; real failure rollback",
    ],
    rollback:
      "Revert scoped UI/command rollout without removing data/history; preserve old ticket policy and explicit finance decisions.",
  },
  Z6: {
    owner: "Codex · reporting/notification",
    risk: "PII disclosure, malformed RTL/export, unsolicited/duplicate external delivery",
    tests: [
      "authorized real PDF/XLSX/CSV output and RTL inspection, not just response bytes",
      "notification consent/channel retries, inaccessible attachment and expired URL",
      "no sent/delivered claim from enqueue; no live sending before approval",
    ],
    rollback:
      "Pause new dispatcher/export variant, retain outbox/retry evidence and canonical download/report routes.",
  },
  Z7: {
    owner: "Codex · integration/AI/multi-executor",
    risk: "live cost/PII, autonomous money/access command, shared-file leakage or overpayment",
    tests: [
      "mock/offline fail-closed contracts, kill-switch and malicious/stale proposal rejection",
      "multi-executor ownership, independent QC and bounded balanced shares/refunds",
      "per-provider live sandbox/recipient/budget evidence only after separate approval",
    ],
    rollback:
      "Kill-switch/disable new integration; retain local fallback, ledger, uploaded objects and human review. No automatic provider activation or production migration.",
  },
  Z8: {
    owner: "Codex · architecture compatibility",
    risk: "false literal parity or destructive technology/identifier rewrite",
    tests: [
      "map source responsibility/path/technology to existing stack and disclose approved deviation",
      "preserve source hashes/current identifiers, canonical routes and all capabilities",
    ],
    rollback:
      "Keep current Next/Nest/Prisma stack and approved identifier formats; documentation correction rather than technology migration.",
  },
  Z9: {
    owner: "Codex · acceptance/release",
    risk: "stale evidence, hidden skip, wrong commit/CI or premature production acceptance",
    tests: [
      "candidate-bound full related gates with disabled/unrun tests explicit",
      "end-to-end real-role failure/concurrency/financial/file flows and accessibility/performance",
      "CI matches accepted commit; deferred live acceptance never counted complete",
    ],
    rollback:
      "Hold release, preserve reproducible evidence and previous compatible runtime; no history reset or fake green CI.",
  },
};

const opsFiles = {
  1: [
    "scripts/acceptance/web-performance-e2e.mjs",
    "apps/web/src/components/orbit-hero.tsx",
    "apps/web/src/app/globals.css",
  ],
  2: [
    "scripts/acceptance/web-performance-e2e.mjs",
    "apps/web/src/components/app-shell.tsx",
    "apps/web/src/lib/auth-context.tsx",
  ],
  3: [
    "apps/api/package-lock.json",
    "apps/web/package-lock.json",
    "scripts/phase8-supply-chain.mjs",
  ],
  4: [
    "apps/api/package.json",
    "apps/api/package-lock.json",
    "apps/web/package.json",
    "apps/web/package-lock.json",
  ],
  5: ["scripts/runtime.ps1", "scripts/local.ps1"],
  6: [
    "scripts/acceptance/phase8-exception-workflow-e2e.mjs",
    "apps/web/scripts/phase8-ui-runtime.mjs",
  ],
  7: ["scripts/orbit-preservation-contract.mjs"],
  8: [
    "apps/api/prisma/schema.prisma",
    "apps/api/src/orders/orders.service.ts",
    "apps/api/src/finance/ledger.service.ts",
  ],
  9: [
    "apps/api/src/orders/orders.service.ts",
    "apps/api/src/users/settings.service.ts",
  ],
  10: [
    "apps/api/src/common/guards/roles.guard.ts",
    "apps/api/src/users/settings.service.ts",
  ],
  11: [
    "apps/api/src/finance/payments.service.ts",
    "apps/api/src/finance/payment-gateway.ts",
  ],
  12: ["apps/api/src/notifications/sms.service.ts"],
  13: ["apps/api/src/notifications/email.service.ts"],
  14: ["apps/api/src/files/object-storage.service.ts"],
  15: [
    "apps/api/src/files/antivirus.service.ts",
    "apps/api/src/jobs/jobs.service.ts",
  ],
};
const missingColumns = {
  "users.last_login": [
    "Z1",
    "Optional last-successful-auth timestamp, never infer from account creation; preserve unknown historical value.",
  ],
  "services.same_day_surcharge": [
    "Z2",
    "Approved 80-percent rule exists in nonbinding calculator; per-service versioned binding tariff and snapshot remain implementation work.",
  ],
  "services.urgent_surcharge": [
    "Z2",
    "Approved 30-percent rule exists in nonbinding calculator, not a persisted contractual tariff.",
  ],
  "services.sort_order": [
    "Z1",
    "Add stable explicit catalog ordering contract, tie-breaker and old-record default without changing service IDs.",
  ],
  "orders.base_price": [
    "Z2",
    "Immutable price-component snapshot for new quote; do not derive historical base from current catalog.",
  ],
  "orders.surcharge_pct": [
    "Z2",
    "Versioned actual percentage and currency/rounding snapshot; do not infer from legacy urgency aliases.",
  ],
  "orders.deadline": [
    "Z2",
    "Deadline nullable for unknown historic records; new agreed due time from approved calendar/quote only.",
  ],
  "orders.same_day_deadline": [
    "Z2",
    "21:00 Tehran only when capacity/payment/valid reservation proved; no retroactive promise.",
  ],
  "orders.notes": [
    "Z3",
    "Explicit optional requirement/order note with ownership/visibility, not an invented message conversion.",
  ],
  "tickets.sla_hours": [
    "Z5",
    "Versioned four-working-hour first-response policy snapshot for new tickets; old ticket policies preserved.",
  ],
  "tickets.customer_rating": [
    "Z5",
    "Bounded optional post-close satisfaction with source/owner uniqueness; not a fake staff-performance score.",
  ],
  "reviews.is_public": [
    "Z5",
    "Explicit opt-in and moderation for order/service publication; default source TRUE conflicts with approved privacy DEC03, so no automatic publication.",
  ],
};

function phasesFor(id, text) {
  const phases = unique(text.match(/\bZ[1-9]\b/g) ?? []).sort();
  if (phases.length) return phases;
  if (/^T/.test(id)) return ["Z8"];
  if (/^API2[789]$/.test(id)) return ["Z7"];
  return [
    { A: "Z3", B: "Z3", C: "Z4", D: "Z5", E: "Z5", F: "Z2", G: "Z1", H: "Z6" }[
      id[0]
    ] ?? "Z1",
  ];
}

export function buildDelivery() {
  const inventory = json("docs/zeus/z0-inventory.json"),
    bindings = json("docs/zeus/z0-mappings.json");
  const decisions = json("docs/zeus/z0-decisions.json");
  validateDecisions(decisions);
  const ticketReview = json("docs/zeus/z0-ticket-command-review.json");
  checkTicketReview(ticketReview);
  const systemReview = json("docs/zeus/z0-system-command-review.json");
  checkSystemCommandReview(systemReview);
  const schemaReview = json("docs/zeus/z0-schema-review.json");
  checkSchemaReview(schemaReview);
  const diagramReview = json("docs/zeus/z0-diagram-review.json");
  checkDiagramReview(diagramReview);
  const sourceReview = json("docs/zeus/z0-source-contracts.json");
  checkSourceContracts(sourceReview);
  const orderReview = json("docs/zeus/z0-order-command-review.json");
  const commandContracts = new Map([
    ...systemReview.contracts.map((item) => [item.signature, item]),
    ...[orderReview, ticketReview].flatMap((review) =>
      review.facts.commands.map((fact) => [
        fact.signature,
        review.contracts.find((item) => item.id === fact.id),
      ]),
    ),
    ...systemReview.readSideEffects.map((item) => [item.signature, item]),
  ]);
  assert.deepEqual(
    inventory.ownerDecisions,
    decisions.decisions,
    "Decision inventory drift",
  );
  const trace = inspectTraceability(bindings),
    domain = inspectDomainContracts(),
    roadmap = read("docs/ZEUS_ROADMAP.md");
  const records = [
    ...bindings.legacyPackets,
    ...bindings.domainPackets,
    ...bindings.uiPackets,
  ];
  const packages = inventory.requirements.map((requirement) => {
    const rows = sourceRows(roadmap, requirement),
      text = rows.map((row) => row.text).join("\n");
    const mapping = records.find((item) => item.id === requirement.id);
    const api = trace.api.find((item) => item.id === requirement.id);
    const reused = unique([
      ...(mapping?.reuseUi ?? []),
      ...(mapping?.uiRefs ?? []),
    ]);
    const ui = bindings.uiPackets.filter((item) => reused.includes(item.id));
    const phase = phasesFor(requirement.id, text),
      profile = profiles[phase[0]];
    const ops = /^ZEUS-OPS-(\d{3})$/.exec(requirement.id);
    const files = unique([
      ...(mapping?.codeFiles ?? []),
      ...ui.flatMap((item) => item.codeFiles),
      ...(api?.targets.map((item) => item.file) ?? []),
      ...(ops ? opsFiles[Number(ops[1])] : []),
    ]);
    for (const file of files)
      assert(
        existsSync(resolve(root, file)),
        `Missing implementation candidate: ${requirement.id} ${file}`,
      );
    const regression = unique([
      ...(mapping?.regressionCandidates ?? []),
      ...ui.flatMap((item) => item.regressionCandidates),
      ...(api?.regressionCandidates ?? []),
    ]);
    for (const file of regression)
      assert(
        existsSync(resolve(root, file)),
        `Missing test candidate: ${file}`,
      );
    const deferred = ops && Number(ops[1]) >= 11;
    const plannedEndpoint = plannedEndpoints[requirement.id];
    const scenario = preservedScenario(requirement.id);
    const explicitScenarios = rowScenarios(rows);
    const apiScenarios = (api?.targets ?? []).flatMap((target) => {
      const signature = `${target.method} ${target.path}`,
        contract = commandContracts.get(signature);
      if (contract)
        return [
          `${signature}: ${contract.ownershipPreconditions ?? contract.ownership ?? contract.currentContract}`,
          `${signature}: ${contract.effects ?? contract.preconditions ?? contract.currentContract}; ${contract.replayAudit ?? contract.replayConcurrency ?? "Read-side effects explicitly reviewed; repeat/failure/ownership tests required."}`,
        ];
      return [
        `${signature} (${target.className}.${target.handler}): exercise the source response/query contract at ${target.file}:${target.line}; test real session/role/scope/capability and foreign owner, not UI-only guard. Source path ${api.path} is not an implemented alias.`,
        `${signature}: validate filter/enum/id/page and aggregate beyond page size; safe projection excludes secrets/internal HR/other-owner data; empty/error/expired-session behavior with no unintended state or provider action.`,
      ];
    });
    assert(
      files.length || plannedEndpoint,
      `No implementation or explicit planned endpoint: ${requirement.id}`,
    );
    const specific = unique([
      ...(mapping?.testPlan
        ? Array.isArray(mapping.testPlan)
          ? mapping.testPlan
          : [mapping.testPlan]
        : []),
      ...(scenario ? [scenario] : []),
      ...explicitScenarios,
      ...apiScenarios,
      ...(plannedEndpoint
        ? [
            `Planned only: ${plannedEndpoint.path}. ${plannedEndpoint.contract}; positive/unauthorized/stale/malformed/replay/kill-switch cases before acceptance.`,
          ]
        : []),
    ]);
    const implementationFindings = systemReview.findings
      .filter((finding) => finding.requirements.includes(requirement.id))
      .map((finding) => ({
        id: finding.id,
        phases: finding.phases,
        evidenceFile: "docs/zeus/z0-system-command-review.json",
        status: finding.status,
      }));
    assert(
      specific.length,
      `Generic profile without requirement-specific scenario: ${requirement.id}`,
    );
    return {
      id: requirement.id,
      sourceRows: rows,
      phases: phase,
      accountableExecutor: profile.owner,
      status: deferred
        ? "live-acceptance-deferred-by-owner"
        : "planned-implementation-or-regression-not-accepted",
      codeCandidates: files,
      plannedCodeTargets: plannedEndpoint?.files ?? [],
      plannedEndpoint: plannedEndpoint ?? null,
      plannedAcceptanceRunner: `scripts/acceptance/zeus-${phase[0].toLowerCase()}-acceptance.mjs`,
      plannedAcceptanceCase: requirement.id,
      implementationFindings,
      missingCapability: api?.targets.length === 0 ? api.note : null,
      routeEvidence: api?.targets ?? [],
      references: unique([
        ...(mapping?.sourceRefs ?? []),
        ...(mapping?.sourceSections ?? []),
        ...reused,
      ]),
      acceptanceCriteria: text,
      expectedScenarios: [...specific, ...profile.tests],
      regressionCandidates: regression,
      crossPhaseAcceptance: phase.slice(1),
      dependencies: unique([
        "Z0 contract gate",
        ...(mapping?.decisions ?? []),
        ...ui.flatMap((item) => item.decisions),
        ...(deferred ? ["provider-specific explicit live authority"] : []),
      ]),
      authority:
        "Planning only. Exact protected-source/migration/live/cost approval must precede implementation; existing three byte-pinned exceptions are not blanket authority.",
      risk: profile.risk,
      rollback: profile.rollback,
      changeBoundary:
        "Preserve all current capabilities/data/routes/roles, ZEUS-DESIGN-01/two themes, canonical pages, validated domain commands and ledger source of truth.",
      testBudget:
        "Immediate targeted tests for sensitive changes; comprehensive related gate once per package; full gate at phase/release, not after every small edit.",
      productAccepted: false,
      acceptedCommit: null,
    };
  });
  const columns = domain.sql.columns.map((column) => ({
    id: `${column.source}:${column.table}.${column.name}`,
    sourceLine: column.sourceLine,
    sourceContract: {
      type: column.type,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
      unique: column.unique,
      defaultExpression: column.defaultExpression,
      references: column.references,
      checks: column.checks,
    },
    candidates: column.targets.map((target) =>
      compareColumnDeclaration(column, target),
    ),
    disposition:
      missingColumns[`${column.table}.${column.name}`] ??
      (column.name === "created_by" && column.source === "D4"
        ? [
            "Z1",
            "Explicit semantic alias LedgerEntry.createdByUserId; literal column name differs, see accepted 15-column semantic review.",
          ]
        : [
            "Z1",
            "Preserve mapped implementation until source/migration/DTO equivalence and compatibility tests; multi-field candidates are transformations, not copied columns.",
          ]),
    testsRequired: [
      "nullable/default/key/FK/CHECK and scalar boundaries from sourceContract in isolated DB",
      "read/write DTO and command ownership; missing/legacy values remain honest",
      "no destructive backfill, ID rewrite or independent wallet balance source",
    ],
    runtimeAccepted: false,
  }));
  const diagramItems = bindings.diagram.elements.flatMap((element) =>
    element.subItems.map((text, index) => ({
      id: `${element.id}.I${String(index + 1).padStart(2, "0")}`,
      parent: element.id,
      sourceText: text,
      codeCandidates: element.codeFiles,
      modelRefs: element.modelRefs,
      requirementRefs: element.requirementRefs,
      phases: element.phases,
      targetContract: `${element.label}: ${text}; ${element.note}`,
      runtimeAccepted: false,
    })),
  );
  const models = prismaModels(read("apps/api/prisma/schema.prisma"));
  const modelAliases = {
    staff_capacity: ["StaffCapacitySnapshot", "ExecutorProfile"],
    order_ratings: ["Feedback"],
    staff_feedback: ["Feedback"],
    customer_feedback: ["Feedback"],
  };
  const referenceClauses = domain.referenceModel.map((clause) => {
    const alias =
      clause.kind === "table"
        ? modelAliases[clause.name]
        : clause.section === "۲۱.۸"
          ? [
              `Feedback.${clause.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}`,
            ]
          : null;
    const candidates = alias ?? clause.candidates;
    for (const ref of candidates)
      assert(
        models.some(
          (model) =>
            model.name === ref ||
            model.fields.some((field) => field.ref === ref),
        ),
        `Unknown semantic reference: ${ref}`,
      );
    return {
      ...clause,
      semanticCandidates: candidates,
      interpretation: alias
        ? "explicit consolidated-model semantic alias; not literal table parity or accepted constraints"
        : "exact-name candidate, not semantic/behavior acceptance",
      targetPhase: "Z1",
      testsRequired: [
        "scoped DTO/entity ownership/visibility and complete source vocabulary",
        "migration compatibility, uniqueness and nullable/unknown historic behavior",
      ],
      runtimeAccepted: false,
    };
  });
  const pendingRelations = {
    "D2-E15": {
      targetFlows: [
        "scoped order -> its thread/read model",
        "authorized message append -> thread linked to the same order, never arbitrary status/financial command",
      ],
      authority:
        "Order owner/active assignment/explicit admin command; internal/public visibility stays separate.",
      sourceFiles: [
        "apps/api/src/orders/domain/order-messaging.service.ts",
        "apps/api/src/orders/orders.controller.ts",
        "apps/api/src/executor/executor.controller.ts",
      ],
    },
    "D2-E16": {
      targetFlows: [
        "customer ticket creation -> validated owned order reference",
        "support ticket view -> minimum permitted order context; no transfer of order mutation/finance rights",
      ],
      authority:
        "Ticket visibility and order ownership are independently enforced; picking a ticket grants no refund/release capability.",
      sourceFiles: [
        "apps/api/src/tickets/tickets.controller.ts",
        "apps/api/src/tickets/tickets.support.controller.ts",
        "apps/api/src/tickets/tickets.service.ts",
      ],
    },
    "D2-E20": {
      targetFlows: [
        "allowlisted minimized core data -> optional future suggestion adapter",
        "suggestion -> authorized human review only, not executable system command",
      ],
      authority:
        "DEC10/16: provider/AI live deferred, no autonomous money/access/block/dispute decision.",
      sourceFiles: [
        "apps/api/src/users/settings.service.ts",
        "apps/api/src/common/guards/roles.guard.ts",
      ],
    },
  };
  const diagramDispositions = bindings.diagramRelations.edges.map((edge) => ({
    id: edge.id,
    visualDirection: edge.direction,
    visualParityClaim: edge.direction !== "relation-direction-pending",
    targetContract: pendingRelations[edge.id] ?? {
      targetFlows: [edge.contract],
      authority:
        "Conceptual data/service relation, never a grant of endpoint/DB write authority.",
      sourceFiles: [],
    },
    groupedBus: edge.visualInterpretation.startsWith("grouped-"),
    rule: "Do not create a table×provider Cartesian permission graph. Preserve every data/output node; per-command ownership/transactions/consent and deferred live acceptance remain separate.",
    status: "target-interpretation-recorded-not-runtime-acceptance",
    runtimeAccepted: false,
  }));
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const audit = json("docs/zeus/z0-security-snapshot.json");
  for (const [file, expected] of Object.entries(audit.locks))
    assert.equal(
      hash(readFileSync(resolve(root, file))),
      expected,
      "Security snapshot lock drift",
    );
  const inputs = [
    "docs/zeus/z0-inventory.json",
    "docs/zeus/z0-mappings.json",
    "docs/zeus/z0-decisions.json",
    "docs/zeus/z0-security-snapshot.json",
    "docs/zeus/z0-domain-review.json",
    "docs/zeus/z0-order-command-review.json",
    "docs/zeus/z0-ticket-command-review.json",
    "docs/zeus/z0-system-command-review.json",
    "docs/zeus/z0-schema-review.json",
    "docs/zeus/z0-diagram-review.json",
    "docs/zeus/z0-source-contracts.json",
    "scripts/acceptance/zeus-z0-scenarios.mjs",
    "scripts/acceptance/zeus-z0-source-contracts.mjs",
    "scripts/acceptance/zeus-z0-system-command-review.mjs",
    "scripts/acceptance/zeus-z0-command-surface.mjs",
    "scripts/acceptance/zeus-z0-schema-review.mjs",
    "scripts/acceptance/zeus-z0-diagram-review.mjs",
  ];
  return {
    schemaVersion: 1,
    kind: "Z0 execution-contract handoff, not automatic atomic/behavior acceptance",
    date: "2026-10-25",
    phaseAccepted: false,
    candidate: {
      head: revision,
      dirty:
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        }).length > 0,
      acceptedCommit: null,
      inputs: Object.fromEntries(
        inputs.map((file) => [file, hash(read(file))]),
      ),
      node: process.version,
    },
    decisions: Object.keys(decisions.decisions),
    commandReviewProgress: {
      evidence: [
        "docs/zeus/z0-order-command-review.json",
        "docs/zeus/z0-ticket-command-review.json",
        "docs/zeus/z0-system-command-review.json",
      ],
      nonReadRoutes: ticketReview.facts.routeInventory.nonReadRoutes,
      reviewedRoutes:
        ticketReview.facts.routeInventory.reviewedRoutes +
        systemReview.contracts.length,
      remainingRoutes: 0,
      readSideEffectContracts: systemReview.readSideEffects.length,
      systemContracts: systemReview.contracts.length,
      openSystemFindings: systemReview.findings.length,
      ticketContracts: ticketReview.contracts.length,
      openTicketFindings: ticketReview.findings.length,
      note: "Current-contract review, not runtime remediation or phase acceptance; non-read inventory includes read-only pricing POST.",
    },
    targetClarifications,
    sourceContractProgress: {
      parentRequirements: sourceReview.parentContracts.length,
      documents: sourceReview.documents.map((doc) => ({
        id: doc.id,
        units: doc.sourceUnits,
        clauses: doc.clauses,
      })),
      columnContracts: schemaReview.columns.length,
      migrationFiles: schemaReview.migrations.length,
      sourceUnitsAreFeatureCount: false,
      runtimeAccepted: false,
    },
    packages,
    columns,
    diagramItems,
    referenceClauses,
    diagramDispositions,
    diagramEdges: bindings.diagramRelations.edges,
    scope:
      "All 351 indexed requirements receive execution cards; 120 SQL columns retain declared constraints; every indexed diagram subitem remains separate. This is an explicit handoff, not proof that every semantic subrequirement, arrow direction or command has passed Z0 review.",
    remainingGates: [
      {
        id: "Z0-R1",
        status: "target-contract-review-complete",
        reason:
          "All source text/clauses linked to manually reviewed parent criteria/scenarios and precedence policies;120 typed column contracts,46 enums,54 DTO declarations/inheritance and23 migrations/348 statements. Compound clauses retained whole, not counted as independent features; DB/runtime acceptance remains future work.",
      },
      {
        id: "Z0-R2",
        status: "target-meaning-review-complete",
        reason:
          "All51 indexed nodes/135 subitems/30role actions/28relations have explicit meaning/requirement ownership. Ambiguous visual arrowheads remain unclaimed; target flows and permission limits resolved, not runtime/visual parity.",
      },
      {
        id: "Z0-R3",
        status: "current-command-contract-review-complete",
        reason:
          "All104 non-read routes plus16 state-producing GET contracts,12 JobRunner registrations and independent reconciliation reviewed; actor/scope/owner/state/QC/concurrency/Audit/money effects and open fixes explicitly retained. Runtime/HTTP/DB/distributed-race acceptance not claimed by Z0 contract review.",
      },
      {
        id: "Z0-R4",
        status: "target-contracts-approved-implementation-separate",
        reason:
          "All sixteen decisions now recorded; no blanket financial/auth/schema/live implementation authority.",
      },
      {
        id: "Z0-R5",
        status: "execution-card-completeness-review-complete",
        reason:
          "All351 cards have criteria/source refs, real candidates or five explicit planned endpoints, requirement-specific scenarios and case/runner, executor/dependency/authority/risk/rollback. Newly characterized gaps link back to canonical cards. Dated lock/runtime/security evidence retained; live acceptance remains deferred.",
      },
      {
        id: "Z0-R6",
        status: "open-final-phase-certification",
        reason:
          "This handoff is not phase acceptance; a separate content-bound Z0 planning-contract certificate must run all related gates and preserve every future implementation/live/CI acceptance obligation.",
      },
    ],
  };
}

// Persist shared policies once; do not inflate the user's source tree with
// hundreds of identical risk/rollback/test-budget paragraphs.
export function compactDelivery(delivery) {
  const first = delivery.packages[0];
  const shared = {
    authority: first.authority,
    changeBoundary: first.changeBoundary,
    testBudget: first.testBudget,
  };
  const packages = delivery.packages.map((card) => {
    const profile = profiles[card.phases[0]];
    const {
      accountableExecutor,
      risk,
      rollback,
      authority,
      changeBoundary,
      testBudget,
      expectedScenarios,
      ...rest
    } = card;
    return {
      ...rest,
      sourceRows: card.sourceRows.map(({ text, ...row }) => row),
      executionProfile: card.phases[0],
      specificScenarios: expectedScenarios.filter(
        (text) => !profile.tests.includes(text),
      ),
    };
  });
  return { ...delivery, shared, executionProfiles: profiles, packages };
}

export function checkDelivery(record, current) {
  assert.equal(
    record.phaseAccepted,
    false,
    "Unfinished phase must not be accepted",
  );
  assert.deepEqual(
    record,
    compactDelivery(current),
    "Delivery evidence/card drift",
  );
  assert.equal(record.packages.length, 351);
  assert.equal(record.columns.length, 120);
  assert.equal(new Set(record.packages.map((item) => item.id)).size, 351);
  for (const card of record.packages) {
    const profile = record.executionProfiles[card.executionProfile];
    assert(
      profile?.owner &&
        profile.tests.length &&
        profile.risk &&
        profile.rollback &&
        record.shared.authority &&
        card.acceptanceCriteria &&
        card.productAccepted === false &&
        card.acceptedCommit === null,
      "Incomplete or falsely accepted execution card",
    );
  }
  assert(
    record.remainingGates.some((item) => item.status.startsWith("open-")),
    "Cannot hide remaining Z0 reviews",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const delivery = buildDelivery();
    if (process.argv.includes("--check"))
      checkDelivery(json("docs/zeus/z0-execution-contract.json"), delivery);
    if (process.argv.includes("--json"))
      process.stdout.write(JSON.stringify(compactDelivery(delivery)) + "\n");
    else
      console.log(
        JSON.stringify({
          packages: delivery.packages.length,
          columns: delivery.columns.length,
          diagramItems: delivery.diagramItems.length,
          decisions: delivery.decisions.length,
          gate: delivery.remainingGates,
          phaseAccepted: false,
        }),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
