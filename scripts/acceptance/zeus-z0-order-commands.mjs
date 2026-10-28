import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { controllerRoutes } from "./zeus-z0-traceability.mjs";
import {
  functionEvidence,
  stateDeclarations,
} from "./zeus-z0-domain-contracts.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const ts = apiRequire("typescript");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const portable = (path) => path.replaceAll("\\", "/");

function parse(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  assert.equal(
    source.parseDiagnostics.length,
    0,
    `Invalid TypeScript: ${file}`,
  );
  return source;
}

export function scanCalls(text, file = "fixture.ts") {
  const source = parse(text, file),
    calls = [];
  function visit(node, owner = null) {
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node))
      owner = node.name?.getText(source) ?? owner;
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (callee.endsWith(".transition") || callee === "isCancellable") {
        const args = node.arguments.map((arg) => arg.getText(source));
        calls.push({
          file,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          owner,
          callee,
          arguments: args,
          disputeFlag: args.length > 8 ? args[8] : "omitted",
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(source);
  return calls;
}

export function classContract(text, name, file = "fixture.ts") {
  const source = parse(text, file);
  const nodes = source.statements.filter(
    (node) => ts.isClassDeclaration(node) && node.name?.text === name,
  );
  assert.equal(nodes.length, 1, `Missing/ambiguous DTO class: ${name}`);
  const node = nodes[0];
  return {
    file,
    name,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    hash: hash(node.getText(source)),
    fields: node.members.filter(ts.isPropertyDeclaration).map((field) => ({
      name: field.name.getText(source),
      decorators: (ts.getDecorators(field) ?? []).map((decorator) =>
        decorator.getText(source),
      ),
    })),
  };
}

export function scanOrderStatusWrites(text, file = "fixture.ts") {
  const source = parse(text, file),
    writes = [];
  function visit(node, owner = null) {
    if (ts.isMethodDeclaration(node))
      owner = node.name?.getText(source) ?? owner;
    if (
      ts.isCallExpression(node) &&
      /\.order\.update(?:Many)?$/.test(node.expression.getText(source))
    ) {
      const argument = node.arguments[0];
      const property = (object, name) =>
        ts.isObjectLiteralExpression(object)
          ? object.properties.find(
              (item) =>
                ts.isPropertyAssignment(item) &&
                item.name.getText(source) === name,
            )
          : undefined;
      if (argument) {
        const data = property(argument, "data");
        const status = data ? property(data.initializer, "status") : null;
        if (status)
          writes.push({
            file,
            owner,
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
            callee: node.expression.getText(source),
            status: status.initializer.getText(source),
            note: "Direct declared status write; not proof of bypass or full spread/dynamic-data analysis",
          });
      }
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(source);
  return writes;
}

function caseLabels(text) {
  const source = parse(text, "method.ts"),
    labels = [];
  function visit(node) {
    if (ts.isCaseClause(node)) {
      assert(
        ts.isStringLiteral(node.expression),
        "Dynamic case requires review",
      );
      labels.push(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return labels;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(resolve(directory, entry.name))
      : [resolve(directory, entry.name)],
  );
}

export function jobRegistrations(text, file = "fixture.ts") {
  const source = parse(text, file),
    jobs = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "this.runner.register"
    ) {
      const object = node.arguments[0];
      assert(
        object && ts.isObjectLiteralExpression(object),
        "Dynamic job registration requires review",
      );
      const field = (name) =>
        object.properties.find(
          (item) =>
            ts.isPropertyAssignment(item) && item.name.getText(source) === name,
        )?.initializer;
      const name = field("name"),
        interval = field("intervalMs"),
        run = field("run");
      assert(
        name && ts.isStringLiteral(name) && interval && run,
        "Incomplete/literal job registration required",
      );
      jobs.push({
        name: name.text,
        file,
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        hash: hash(object.getText(source)),
        intervalExpression: interval.getText(source),
        runExpression: run.getText(source),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(
    new Set(jobs.map((item) => item.name)).size,
    jobs.length,
    "Duplicate job registration",
  );
  return jobs;
}

export function delegationArguments(text, callee) {
  const source = parse(`class Evidence {\n${text}\n}`, "method.ts"),
    matches = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === callee)
      matches.push(node.arguments.map((argument) => argument.getText(source)));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1, `Missing/ambiguous delegation: ${callee}`);
  return matches[0];
}

export const commandDefinitions = [
  {
    id: "Z0-CMD-01",
    signature: "POST /v1/customer/orders/:id/cancel",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "cancel",
    service: "cancelByCustomer",
    dto: "CancelOrderDto",
  },
  {
    id: "Z0-CMD-02",
    signature: "POST /v1/admin/orders/:id/cancel",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "cancel",
    service: "cancelByAdmin",
    dto: "CancelOrderDto",
  },
  {
    id: "Z0-CMD-03",
    signature: "POST /v1/customer/orders/:id/dispute",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "dispute",
    service: "raiseDispute",
    dto: "DisputeOrderDto",
  },
  {
    id: "Z0-CMD-04",
    signature: "POST /v1/admin/orders/:id/resolve-dispute",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "resolveDispute",
    service: "resolveDispute",
    dto: "ResolveDisputeDto",
  },
  {
    id: "Z0-CMD-05",
    signature: "POST /v1/customer/orders/:id/confirm",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "confirm",
    service: "confirm",
    dto: null,
  },
  {
    id: "Z0-CMD-06",
    signature: "POST /v1/customer/orders/:id/revision",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "requestRevision",
    service: "requestRevision",
    dto: "RevisionRequestDto",
  },
  {
    id: "Z0-CMD-07",
    signature: "POST /v1/customer/orders/:id/submit",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "submit",
    service: "submit",
    dto: null,
  },
  {
    id: "Z0-CMD-08",
    signature: "POST /v1/admin/orders/:id/triage",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "triage",
    service: "triage",
    dto: "TriageDecisionDto",
  },
  {
    id: "Z0-CMD-09",
    signature: "POST /v1/admin/orders/:id/quote",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "quote",
    service: "quote",
    dto: "QuoteOrderDto",
  },
  {
    id: "Z0-CMD-10",
    signature: "POST /v1/customer/orders/:id/accept-quote",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "acceptQuote",
    service: "acceptQuote",
    dto: null,
  },
  {
    id: "Z0-CMD-11",
    signature: "POST /v1/admin/orders/:id/assign",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "assign",
    service: "assign",
    dto: "AssignOrderDto",
  },
  {
    id: "Z0-CMD-12",
    signature: "POST /v1/admin/orders/:id/reassign",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "reassign",
    service: "reassign",
    dto: "AssignOrderDto",
  },
  {
    id: "Z0-CMD-13",
    signature: "POST /v1/customer/orders/:id/pay",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "pay",
    service: "initiatePayment",
    dto: "PaymentIntentDto",
  },
  {
    id: "Z0-CMD-14",
    signature: "POST /v1/customer/orders/:id/payments/:paymentId/verify",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "verifyPayment",
    service: "verifyPayment",
    dto: null,
  },
  {
    id: "Z0-CMD-15",
    signature: "POST /v1/customer/orders/:id/milestones/:milestoneId/approve",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "approveMilestone",
    service: "approveMilestone",
    dto: null,
  },
  {
    id: "Z0-CMD-16",
    signature: "POST /v1/customer/orders",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "create",
    service: "createDraft",
    dto: "CreateOrderDto",
  },
  {
    id: "Z0-CMD-17",
    signature: "PATCH /v1/customer/orders/:id/draft",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "updateDraft",
    service: "updateDraft",
    dto: "UpdateOrderDraftDto",
  },
  {
    id: "Z0-CMD-18",
    signature: "POST /v1/customer/orders/:id/messages",
    file: "apps/api/src/orders/orders.controller.ts",
    handler: "addMessage",
    service: "addCustomerMessage",
    dto: "OrderMessageDto",
  },
  {
    id: "Z0-CMD-19",
    signature: "POST /v1/admin/orders/:id/milestones",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "configureMilestones",
    service: "configureMilestones",
    dto: "ConfigureMilestonesDto",
  },
  {
    id: "Z0-CMD-20",
    signature: "POST /v1/admin/orders/:id/reports",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "addManagementReport",
    service: "addManagementReport",
    dto: "CreateManagementReportDto",
  },
  {
    id: "Z0-CMD-21",
    signature: "POST /v1/admin/orders/:id/messages",
    file: "apps/api/src/orders/orders.admin.controller.ts",
    handler: "addMessage",
    service: "addAdminMessage",
    dto: "OrderMessageDto",
  },
  {
    id: "Z0-CMD-22",
    signature: "POST /v1/executor/orders/:id/start",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "start",
    service: "executorStart",
    dto: null,
  },
  {
    id: "Z0-CMD-23",
    signature: "POST /v1/executor/orders/:id/accept",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "accept",
    receiver: "executor",
    serviceFile: "apps/api/src/executor/executor.service.ts",
    service: "acceptOrder",
    dto: null,
  },
  {
    id: "Z0-CMD-24",
    signature: "PATCH /v1/executor/orders/:id/checklist/:itemId",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "updateChecklist",
    receiver: "executor",
    serviceFile: "apps/api/src/executor/executor.service.ts",
    service: "updateChecklistItem",
    dto: "UpdateExecutionChecklistDto",
    dtoFile: "apps/api/src/executor/dto/executor.dto.ts",
  },
  {
    id: "Z0-CMD-25",
    signature: "POST /v1/executor/orders/:id/progress-report",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "progressReport",
    service: "progressReport",
    dto: "ProgressReportDto",
  },
  {
    id: "Z0-CMD-26",
    signature: "POST /v1/executor/orders/:id/deliver",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "deliver",
    service: "deliver",
    dto: "DeliverOrderDto",
  },
  {
    id: "Z0-CMD-27",
    signature: "POST /v1/executor/orders/:id/milestones/:milestoneId/deliver",
    file: "apps/api/src/executor/executor.controller.ts",
    handler: "deliverMilestone",
    service: "deliverMilestone",
    dto: "DeliverMilestoneDto",
  },
  ...[
    ["28", "approve", "approve"],
    ["29", "request-rework", "requestRework"],
    ["30", "reject", "reject"],
  ].map(([id, path, method]) => ({
    id: `Z0-CMD-${id}`,
    signature: `POST /v1/admin/qc/:id/${path}`,
    file: "apps/api/src/qc/qc.controller.ts",
    handler: method,
    receiver: "qc",
    serviceFile: "apps/api/src/qc/qc.service.ts",
    service: method,
    dto: "SubmitQcReviewDto",
    dtoFile: "apps/api/src/qc/dto/qc.dto.ts",
    nestedDtos: ["QcReviewItemDto"],
  })),
  {
    id: "Z0-CMD-31",
    signature: "POST /v1/admin/jobs/:name/run",
    file: "apps/api/src/jobs/jobs.admin.controller.ts",
    handler: "run",
    receiver: "jobs",
    serviceFile: "apps/api/src/jobs/jobs.service.ts",
    service: "run",
    dto: null,
  },
];

export function inspectOrderCommands() {
  const serviceFile = "apps/api/src/orders/orders.service.ts",
    serviceText = read(serviceFile);
  const dtoFile = "apps/api/src/orders/dto/order.dto.ts";
  const files = walk(resolve(root, "apps/api/src"))
    .filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.endsWith(".spec.ts") &&
        !file.endsWith(".d.ts"),
    )
    .map((file) => portable(relative(root, file)))
    .sort();
  const scans = files.map((file) => ({
    file,
    hash: hash(read(file)),
    calls: scanCalls(read(file), file),
  }));
  const calls = scans.flatMap((item) => item.calls);
  const stateFile = "apps/api/src/orders/order-state-machine.ts";
  const states = stateDeclarations(read(stateFile));
  const sourceRefs = {
    submit: ["D3 §7.2/14.1", "D4 §1.3", "DEC02"],
    triage: ["D3 §10.3", "D5 §12.3", "DEC02/16"],
    quote: ["D3 §10.3/13.1", "D4 §1.3", "DEC02"],
    acceptQuote: ["D3 §7.2/14.2", "D4 §1.3", "DEC02"],
    assign: ["D3 §10.4/4.2", "D4 §1.3/1.5", "DEC13"],
    reassign: ["D3 §10.4/11", "DEC13"],
    initiatePayment: ["D3 §12.2", "D4 §2.5", "DEC02/06"],
    verifyPayment: ["D3 §12.2/14.2", "D4 §1.3/2.5"],
    approveMilestone: ["D3 §14.3/12.4", "D4 §2.5/2.6"],
    createDraft: ["D3 §7.2/13.2", "D5 §9.2", "DEC02"],
    updateDraft: ["D3 §7.2/13.2", "D5 §9.2"],
    addCustomerMessage: ["D3 §15.1/15.2/19", "D5 §9.5"],
    configureMilestones: ["D3 §14.3/12.4"],
    addManagementReport: ["D3 §15.3/19", "D5 §12.3"],
    addAdminMessage: ["D3 §15.1/15.2/19"],
    executorStart: ["D3 §8/14.2", "D4 §1.3"],
    acceptOrder: ["D3 §8/10.4", "D5 §10"],
    updateChecklistItem: ["D3 §8/16.1", "D5 §10"],
    progressReport: ["D3 §15.3", "D5 §10"],
    deliver: ["D3 §16.1/16.2", "D4 §1.3"],
    deliverMilestone: ["D3 §14.3/16.2", "D4 §2.5/2.6"],
    approve: ["D3 §10.5/16.1", "D4 §1.3"],
    requestRework: ["D3 §10.5/16.1", "D4 §1.3"],
    reject: ["D3 §10.5/16.1", "D4 §1.3"],
    run: ["D3 §23/19", "D4 §1.5/2.5"],
  };
  const commands = commandDefinitions.map((definition) => {
    const route = controllerRoutes(read(definition.file), definition.file).find(
      (route) => `${route.method} ${route.path}` === definition.signature,
    );
    assert(
      route && route.handler === definition.handler,
      `Route/handler drift: ${definition.id}`,
    );
    const commandServiceFile = definition.serviceFile ?? serviceFile;
    const commandDtoFile = definition.dtoFile ?? dtoFile;
    const evidence = functionEvidence(
      read(commandServiceFile),
      definition.service,
      true,
    );
    const method = functionEvidence(
      read(definition.file),
      definition.handler,
      true,
    );
    const delegatedArguments = delegationArguments(
      method.text,
      `this.${definition.receiver ?? "orders"}.${definition.service}`,
    );
    const transitions = scanCalls(
      `class Evidence {\n${evidence.text}\n}`,
      commandServiceFile,
    ).map((call) => ({ ...call, line: evidence.line + call.line - 2 }));
    return {
      ...definition,
      route,
      controllerMethod: {
        line: method.line,
        hash: method.hash,
        delegatedArguments,
      },
      serviceMethod: {
        file: commandServiceFile,
        line: evidence.line,
        hash: evidence.hash,
      },
      dtoContract: definition.dto
        ? classContract(read(commandDtoFile), definition.dto, commandDtoFile)
        : null,
      ...(definition.nestedDtos
        ? {
            nestedDtoContracts: definition.nestedDtos.map((name) =>
              classContract(read(commandDtoFile), name, commandDtoFile),
            ),
          }
        : {}),
      transitionCalls: transitions,
      sourceDocRefs: sourceRefs[definition.service] ?? [
        "D4 §1.3/1.4",
        "D3 §16.4/19",
        "DEC12/13/16",
      ],
      runtimeAcceptance: false,
    };
  });
  const resolutionEvidence = functionEvidence(
    serviceText,
    "resolveDispute",
    true,
  );
  const dependencies = [
    "apps/api/src/orders/domain/order-workflow.service.ts",
    "apps/api/src/orders/domain/order-dispute.service.ts",
    "apps/api/src/orders/domain/order-assignment.service.ts",
    "apps/api/src/finance/payments.service.ts",
    "apps/api/src/finance/idempotency.service.ts",
    "apps/api/src/finance/escrow.service.ts",
    "apps/api/src/common/guards/admin-scope.guard.ts",
    "apps/api/src/common/guards/roles.guard.ts",
    "apps/api/src/common/guards/jwt-auth.guard.ts",
    "apps/api/src/main.ts",
    "apps/api/src/app.module.ts",
  ];
  const downstreamDefinitions = [
    ["apps/api/src/finance/payments.service.ts", "initiatePayment"],
    ["apps/api/src/finance/payments.service.ts", "verifyAndSettlePayment"],
    [
      "apps/api/src/finance/payments.service.ts",
      "verifyAndSettleInTransaction",
    ],
    [
      "apps/api/src/orders/domain/order-assignment.service.ts",
      "loadEligibleExecutor",
    ],
    ["apps/api/src/orders/domain/order-messaging.service.ts", "create"],
    [
      "apps/api/src/orders/domain/order-reports.ts",
      "createVersionedOrderReport",
      "function",
    ],
    ...[
      "applyQcApproval",
      "applyQcRejection",
      "assertExecutorOwnsOrder",
      "assertExecutorFileIds",
    ].map((name) => [serviceFile, name]),
    ["apps/api/src/qc/qc.service.ts", "decide"],
    ...[
      "onModuleInit",
      "recheckPayments",
      "releaseEligibleEscrows",
      "recalculateStaffPerformance",
      "detectStaffRisks",
      "recalculateExecutorScores",
      "dispatchNotificationChannels",
      "scanPendingFiles",
      "expireSignedUrls",
      "cleanupStorageFiles",
      "intervalMinutes",
      "generatePeriodicReports",
    ].map((name) => ["apps/api/src/jobs/jobs.service.ts", name]),
    ...["run", "start", "errorMessage"].map((name) => [
      "apps/api/src/jobs/job-runner.service.ts",
      name,
    ]),
    ["apps/api/src/jobs/job-runner.service.ts", "createJobRunKey", "function"],
  ];
  const scheduledJobs = jobRegistrations(
    read("apps/api/src/jobs/jobs.service.ts"),
    "apps/api/src/jobs/jobs.service.ts",
  );
  const jobNamesFile = "apps/api/src/jobs/job.types.ts";
  const jobTypes = parse(read(jobNamesFile), jobNamesFile);
  const jobDeclaration = jobTypes.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(jobTypes) === "JOB_NAMES");
  assert(
    jobDeclaration?.initializer &&
      ts.isAsExpression(jobDeclaration.initializer) &&
      ts.isArrayLiteralExpression(jobDeclaration.initializer.expression),
    "Job allowlist must remain an explicit literal array",
  );
  const allowedJobNames = jobDeclaration.initializer.expression.elements.map(
    (node) => {
      assert(ts.isStringLiteral(node), "Nonliteral job allowlist");
      return node.text;
    },
  );
  assert.deepEqual(
    scheduledJobs.map((item) => item.name).sort(),
    [...allowedJobNames].sort(),
    "Registered jobs and manual allowlist differ",
  );
  const controllers = [...new Set(commandDefinitions.map((item) => item.file))];
  const writeRoutes = controllers
    .flatMap((file) => controllerRoutes(read(file), file))
    .filter((route) => !["GET", "HEAD", "OPTIONS"].includes(route.method))
    .map((route) => `${route.method} ${route.path}`)
    .sort();
  const missingRoutes = writeRoutes.filter(
    (signature) =>
      !commandDefinitions.some((item) => item.signature === signature),
  );
  assert.deepEqual(
    missingRoutes,
    [],
    "Unreviewed write route in scoped order controllers",
  );
  return {
    schemaVersion: 1,
    kind: "static-command-contract-evidence",
    phaseAccepted: false,
    databaseQueried: false,
    commands,
    scheduledJobs,
    allowedJobNames,
    downstreamMethods: downstreamDefinitions.map(([file, name, kind]) => {
      const evidence = functionEvidence(read(file), name, kind !== "function");
      return { file, name, line: evidence.line, hash: evidence.hash };
    }),
    inputs: Object.fromEntries(
      [
        ...new Set([
          serviceFile,
          dtoFile,
          stateFile,
          jobNamesFile,
          "apps/api/prisma/schema.prisma",
          ...commandDefinitions.flatMap((item) => [
            item.file,
            item.serviceFile ?? serviceFile,
            item.dtoFile ?? dtoFile,
          ]),
          ...dependencies,
          ...downstreamDefinitions.map(([file]) => file),
        ]),
      ].map((file) => [file, hash(read(file))]),
    ),
    scopedWriteRouteCoverage: {
      controllers,
      writeRoutes,
      missingRoutes,
      note: "All write routes of these five scoped controllers are classified; this is not complete Z0, full system coverage or behavioral acceptance.",
    },
    scan: {
      productionSourceFiles: scans.length,
      sourceSetHash: hash(
        JSON.stringify(scans.map(({ file, hash }) => ({ file, hash }))),
      ),
      helperCallSites: calls.filter((call) => call.callee === "isCancellable"),
      explicitDisputeFlagCalls: calls.filter(
        (call) => call.disputeFlag !== "omitted",
      ),
      directOrderStatusWrites: scans.flatMap((item) =>
        scanOrderStatusWrites(read(item.file), item.file),
      ),
      note: "Syntactic call-site inventory, not proof of branch reachability or permission. Omitted flags/defaults and forwarding are shown separately.",
    },
    resolveCaseLabels: caseLabels(
      `class Evidence {\n${resolutionEvidence.text}\n}`,
    ),
    currentCancellation: {
      customerStates: [
        ...functionEvidence(
          serviceText,
          "cancelByCustomer",
          true,
        ).text.matchAll(/OrderStatus\.(\w+)/g),
      ]
        .map((match) => match[1])
        .filter((state) => state !== "cancelled"),
      adminTableCandidates: Object.keys(states.ORDER_TRANSITIONS).filter(
        (state) =>
          states.ORDER_TRANSITIONS[state].includes("cancelled") &&
          states.ORDER_TRANSITION_SOURCES[state]?.cancelled?.includes("admin"),
      ),
      adminExplicitlyBlocksDisputed: functionEvidence(
        serviceText,
        "cancelByAdmin",
        true,
      ).text.includes("order.status === OrderStatus.disputed"),
      note: "Table candidates include disputed but command explicitly rejects it; per-command effective states must be reviewed with both conditions.",
    },
    limits:
      "Thirty-one write routes of five scoped controllers and twelve job registrations classified. Job delegates are evidence references, not a complete transitive-call/cleanup/provider audit. Other endpoints, Z0 streams and HTTP/concurrency/ledger gates remain open.",
  };
}

export function checkCommandReview(record, facts) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(
    record.phaseAccepted,
    false,
    "Cannot accept Z0 from this subset",
  );
  assert.deepEqual(
    record.facts,
    facts,
    "Command source/decorator/DTO/call evidence drift",
  );
  assert.equal(record.contracts.length, commandDefinitions.length);
  assert.deepEqual(
    record.contracts.map((item) => item.id).sort(),
    commandDefinitions.map((item) => item.id).sort(),
    "Missing/duplicated command contract",
  );
  for (const contract of record.contracts) {
    assert(
      contract.actor &&
        contract.ownership &&
        contract.preconditions &&
        contract.money &&
        contract.replayConcurrency &&
        contract.auditHistory &&
        Array.isArray(contract.testsNeeded) &&
        contract.testsNeeded.length > 0 &&
        contract.status ===
          "reviewed-current-contract-runtime-acceptance-pending",
      "Incomplete contract or fabricated acceptance",
    );
  }
  for (const finding of record.findings)
    assert(
      finding.id &&
        finding.risk &&
        finding.nextStep &&
        finding.accepted === false,
      "Incomplete finding or fabricated closure",
    );
  assert.deepEqual(
    record.scheduledJobs.map((item) => item.name).sort(),
    facts.allowedJobNames.slice().sort(),
    "Missing/duplicated scheduled job contract",
  );
  for (const job of record.scheduledJobs)
    assert(
      job.actor &&
        job.preconditions &&
        job.effects &&
        job.replayConcurrency &&
        job.auditHistory &&
        job.testsNeeded?.length &&
        job.runtimeAccepted === false,
      "Incomplete job contract or fabricated acceptance",
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const facts = inspectOrderCommands();
    if (process.argv.includes("--check"))
      checkCommandReview(
        JSON.parse(read("docs/zeus/z0-order-command-review.json")),
        facts,
      );
    if (process.argv.includes("--json"))
      process.stdout.write(JSON.stringify(facts) + "\n");
    else
      console.log(
        JSON.stringify({
          commandContracts: facts.commands.length,
          productionSourceFiles: facts.scan.productionSourceFiles,
          helperProductionCallSites: facts.scan.helperCallSites.length,
          explicitDisputeFlagCalls: facts.scan.explicitDisputeFlagCalls.map(
            (call) => ({
              owner: call.owner,
              flag: call.disputeFlag,
              file: call.file,
              line: call.line,
            }),
          ),
          resolveCaseLabels: facts.resolveCaseLabels,
          phaseOrRuntimeAccepted: false,
        }),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
