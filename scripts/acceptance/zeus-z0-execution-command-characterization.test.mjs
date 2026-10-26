import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";

// Exact method bodies only, in-memory fakes only. No application constructors,
// PrismaClient, HTTP, timers, provider, cleanup or real file mutation is invoked.
// GAP tests characterize current behavior; green does not mean remediation.
const root = new URL("../../", import.meta.url);
const requireApi = createRequire(new URL("apps/api/package.json", root));
const ts = requireApi("typescript");
const {
  Prisma,
  OrderStatus,
  OrderStatusSource,
  UserRole,
  QcResult,
  MessageVisibility,
} = requireApi("@prisma/client");
const {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} = requireApi("@nestjs/common");
const read = (file) => readFileSync(new URL(file, root), "utf8");
const ordersFile = "apps/api/src/orders/orders.service.ts";
const executorFile = "apps/api/src/executor/executor.service.ts";
const qcFile = "apps/api/src/qc/qc.service.ts";
const jobsFile = "apps/api/src/jobs/jobs.service.ts";
const runnerFile = "apps/api/src/jobs/job-runner.service.ts";
function harness(file, names, dependencies, extra = {}) {
  const bodies = names
    .map((name) => functionEvidence(read(file), name, true).text)
    .join("\n");
  const js = ts.transpileModule(
    `export class Harness { constructor(d){Object.assign(this,d);}\n${bodies}\n}`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const bindings = {
    Prisma,
    OrderStatus,
    OrderStatusSource,
    UserRole,
    QcResult,
    MessageVisibility,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    HOUR: 3_600_000,
    MINUTE: 60_000,
    ...extra,
  };
  const exports = {};
  new Function("exports", ...Object.keys(bindings), js)(
    exports,
    ...Object.values(bindings),
  );
  return new exports.Harness(dependencies);
}

function checklistFixture({
  assignment = true,
  accepted = true,
  status = "in_progress",
  item = true,
} = {}) {
  const writes = [],
    queries = [];
  const tx = {
    orderAssignment: {
      findFirst: async (args) => {
        queries.push(args);
        return assignment
          ? {
              id: "assignment",
              acceptedAt: accepted ? new Date() : null,
              order: { status },
            }
          : null;
      },
    },
    executionChecklistItem: {
      findFirst: async (args) => {
        queries.push(args);
        return item ? { id: "item" } : null;
      },
      update: async (args) => {
        writes.push(args);
        return args.data;
      },
    },
    auditLog: { create: async (args) => writes.push(args) },
  };
  const service = harness(executorFile, ["updateChecklistItem"], {
    getOwnProfile: async () => ({ id: "profile" }),
    prisma: { $transaction: (work) => work(tx) },
  });
  return {
    run: () => service.updateChecklistItem("executor", "order", "item", true),
    writes,
    queries,
  };
}
test("checklist checks active assignment, own profile and item within assignment before writing", async () => {
  const f = checklistFixture();
  await f.run();
  assert.deepEqual(f.queries[0].where, {
    orderId: "order",
    executorProfileId: "profile",
    unassignedAt: null,
  });
  assert.deepEqual(f.queries[1].where, {
    id: "item",
    assignmentId: "assignment",
  });
  assert.equal(f.writes.length, 2);
});
for (const [name, options, error] of [
  ["not assigned", { assignment: false }, ForbiddenException],
  ["not accepted", { accepted: false }, BadRequestException],
  ["closed", { status: "closed" }, BadRequestException],
  ["foreign item", { item: false }, NotFoundException],
])
  test(`checklist rejects ${name} without writes`, async () => {
    const f = checklistFixture(options);
    await assert.rejects(f.run, error);
    assert.deepEqual(f.writes, []);
  });

function qcFixture({
  firstExecutor = "executor",
  status = "qc_in_review",
  result = null,
  files = ["safe-output"],
  claim = 1,
} = {}) {
  const effects = [],
    queries = [];
  const tx = {
    qcReview: {
      findUnique: async () => ({
        id: "review",
        orderId: "order",
        result,
        order: {
          status,
          files,
          serviceLine: {
            qcChecklistTemplates: [{ items: [{ id: "criterion" }] }],
          },
        },
      }),
      updateMany: async (args) => {
        effects.push(["claim", args]);
        return { count: claim };
      },
    },
    orderAssignment: {
      findFirst: async (args) => {
        queries.push(args);
        return { executorProfile: { userId: firstExecutor } };
      },
    },
    qcReviewItem: { createMany: async (args) => effects.push(["items", args]) },
    orderAcceptanceCriteria: {
      updateMany: async (args) => effects.push(["criteria", args]),
    },
    auditLog: { create: async (args) => effects.push(["audit", args]) },
  };
  const service = harness(
    qcFile,
    ["decide"],
    {
      prisma: {
        $transaction: async (work, options) => {
          assert.equal(options.isolationLevel, "Serializable");
          return work(tx);
        },
      },
      orders: {
        applyQcApproval: async (...args) => {
          effects.push(["approve", args]);
          return "approved";
        },
        applyQcRejection: async (...args) => {
          effects.push(["rework", args]);
          return "rework";
        },
      },
    },
    {
      createVersionedOrderReport: async (_tx, args) =>
        effects.push(["report", args]),
    },
  );
  const run = (
    reviewer = "reviewer",
    items = [{ checklistItemId: "criterion", passed: true }],
    decision = "passed",
  ) => service.decide("review", reviewer, { items }, decision);
  return { run, effects, queries };
}
test("QC independent reviewer passes complete checklist with CAS, report and audit, no financial dependency", async () => {
  const f = qcFixture();
  assert.equal(await f.run(), "approved");
  assert.deepEqual(
    f.effects.map((item) => item[0]),
    ["items", "claim", "criteria", "report", "audit", "approve"],
  );
});
test("QC rejects the first active executor reviewing their own order before writes", async () => {
  const f = qcFixture({ firstExecutor: "reviewer" });
  await assert.rejects(f.run, ForbiddenException);
  assert.deepEqual(f.effects, []);
});
test("QC rejects terminal order, missing safe output and already-decided review before writes", async () => {
  for (const options of [
    { status: "closed" },
    { files: [] },
    { result: "passed" },
  ]) {
    const f = qcFixture(options);
    await assert.rejects(f.run, BadRequestException);
    assert.deepEqual(f.effects, []);
  }
});
test("QC rejects duplicate/foreign checklist items and inconsistent pass or rework", async () => {
  for (const [items, decision] of [
    [[{ checklistItemId: "foreign", passed: true }], "passed"],
    [
      [
        { checklistItemId: "criterion", passed: true },
        { checklistItemId: "criterion", passed: true },
      ],
      "passed",
    ],
    [[{ checklistItemId: "criterion", passed: false }], "passed"],
    [[{ checklistItemId: "criterion", passed: true }], "needs_rework"],
  ]) {
    const f = qcFixture();
    await assert.rejects(
      () => f.run("reviewer", items, decision),
      BadRequestException,
    );
    assert.deepEqual(f.effects, []);
  }
});
test("QC lost CAS rejects before report/history; in-memory fake does not prove database rollback", async () => {
  const f = qcFixture({ claim: 0 });
  await assert.rejects(f.run, BadRequestException);
  assert.deepEqual(
    f.effects.map((item) => item[0]),
    ["items", "claim"],
  );
});
test("characterization GAP: QC checks only the returned first assignment, not every active executor", async () => {
  const f = qcFixture({ firstExecutor: "another-executor" });
  // Simulate a second active assignment belonging to reviewer. No HTTP access,
  // second-row creation or dual-role capability is asserted by this method probe.
  assert.equal(await f.run("second-active-executor"), "approved");
  assert.deepEqual(f.queries[0].where, {
    orderId: "order",
    unassignedAt: null,
  });
  assert.equal(f.queries.length, 1);
});

for (const status of ["closed", "disputed"])
  test(`characterization GAP: milestone delivery does not read ${status} parent status`, async () => {
    const effects = [];
    const tx = {
      order: {
        findUnique: async () => {
          throw new Error("Parent status unexpectedly read");
        },
      },
      orderAssignment: {
        findFirst: async () => ({
          id: "assignment",
          order: { status },
          acceptedAt: null,
        }),
      },
      orderMilestone: {
        findFirst: async () => ({
          id: "milestone",
          paymentStatus: "succeeded",
          deliveryStatus: "pending",
        }),
        update: async (args) => {
          effects.push(args);
          return args.data;
        },
      },
      orderMessage: { create: async (args) => effects.push(args) },
      outboxEvent: { create: async (args) => effects.push(args) },
    };
    const service = harness(ordersFile, ["deliverMilestone"], {
      prisma: { $transaction: (work) => work(tx) },
    });
    assert.equal(
      (
        await service.deliverMilestone("executor", "order", "milestone", {
          summary: "fixture",
        })
      ).deliveryStatus,
      "delivered",
    );
    assert.equal(effects.length, 3); // No escrow/release operation in this method.
  });

test("characterization GAP: auto-confirm delegates customer identity to confirmation history and settlement", async () => {
  const now = new Date("2026-10-24T12:00:00Z"),
    queries = [],
    transitions = [],
    releases = [];
  const tx = {
    order: { findFirst: async () => ({ status: "delivered" }) },
    outboxEvent: { create: async () => ({}) },
  };
  const orders = harness(ordersFile, ["confirm"], {
    idempotency: { execute: ({ work }) => work(tx) },
    transition: async (...args) => {
      transitions.push(args);
      return { status: args[1] };
    },
    escrow: {
      releaseInTransaction: async (args) => {
        releases.push(args);
        return { executorAmount: 90, commissionAmount: 10 };
      },
    },
  });
  const jobs = harness(jobsFile, ["releaseEligibleEscrows"], {
    config: { get: () => undefined },
    prisma: {
      order: {
        findMany: async (args) => {
          queries.push(args);
          return [{ id: "order", customerId: "customer" }];
        },
      },
    },
    orders,
  });
  assert.deepEqual(await jobs.releaseEligibleEscrows(now), {
    processed: 1,
    skipped: 0,
  });
  assert.equal(queries[0].where.status, "delivered");
  assert.deepEqual(queries[0].where.disputes, { none: { status: "open" } });
  assert.equal(now - queries[0].where.deliveredAt.lte, 7 * 24 * 3_600_000);
  assert.equal(transitions[0][2], "customer");
  assert.equal(transitions[0][3], "customer");
  assert.equal(releases[0].decidedByRole, "customer");
  assert.equal(releases[0].decidedByUserId, "customer");
  assert.equal(transitions[1][2], "system");
  assert.equal(transitions[1][3], null);
});

const keyEvidence = functionEvidence(
  read(runnerFile),
  "createJobRunKey",
  false,
);
const keyJs = ts.transpileModule(keyEvidence.text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const keyExports = {};
new Function("exports", keyJs)(keyExports);
test("job key is a time bucket, not a cross-bucket lease or retry sequence", () => {
  assert.equal(
    keyExports.createJobRunKey("job", new Date(1000), 1000),
    "job:1",
  );
  assert.equal(
    keyExports.createJobRunKey("job", new Date(1999), 1000),
    "job:1",
  );
  assert.equal(
    keyExports.createJobRunKey("job", new Date(2000), 1000),
    "job:2",
  );
});
function runnerFixture({
  duplicateClaim = false,
  downstreamUniqueError = false,
} = {}) {
  const effects = [];
  const uniqueError = () =>
    new Prisma.PrismaClientKnownRequestError("fixture unique conflict", {
      code: "P2002",
      clientVersion: "fixture",
    });
  const service = harness(
    runnerFile,
    ["run"],
    {
      jobs: new Map([
        [
          "fixture",
          {
            intervalMs: 1000,
            run: async () => {
              effects.push("work");
              if (downstreamUniqueError) throw uniqueError();
              return { processed: 1 };
            },
          },
        ],
      ]),
      prisma: {
        backgroundJobRun: {
          create: async () => {
            if (duplicateClaim) throw uniqueError();
            return { id: "run" };
          },
          update: async ({ data }) => effects.push(data.status),
        },
      },
      metrics: {
        jobCompleted: (_name, status) => effects.push(`metric:${status}`),
      },
      errorMessage: (error) => error.message,
    },
    { createJobRunKey: keyExports.createJobRunKey },
  );
  return { run: () => service.run("fixture", new Date(1000)), effects };
}
test("job duplicate bucket claim skips work; successful claim records completion", async () => {
  const duplicate = runnerFixture({ duplicateClaim: true });
  assert.equal((await duplicate.run()).details.reason, "already_run");
  assert.deepEqual(duplicate.effects, ["metric:skipped"]);
  const success = runnerFixture();
  assert.deepEqual(await success.run(), { processed: 1 });
  assert.deepEqual(success.effects, ["work", "succeeded", "metric:succeeded"]);
});
test("characterization GAP: downstream P2002 is also returned as already_run after failed run record", async () => {
  const f = runnerFixture({ downstreamUniqueError: true });
  assert.equal((await f.run()).details.reason, "already_run");
  assert.deepEqual(f.effects, [
    "work",
    "failed",
    "metric:failed",
    "metric:skipped",
  ]);
});
