import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildTicketReview,
  checkTicketReview,
  classMethodEvidence,
} from "./zeus-z0-ticket-commands.mjs";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";

// Exact source methods with in-memory collaborators only. No Nest application,
// PrismaClient, HTTP, provider, timer or database is started. A fake transaction
// delegates work; it does NOT prove SQL rollback or distributed concurrency.
// GAP cases characterize open behavior, not remediation or phase acceptance.
const root = new URL("../../", import.meta.url);
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const ts = apiRequire("typescript");
const {
  UserRole,
  TicketStatus,
  MessageVisibility,
  ReportStatus,
  CapabilityType,
} = apiRequire("@prisma/client");
const { BadRequestException, ForbiddenException, NotFoundException } =
  apiRequire("@nestjs/common");
const { validate } = apiRequire("class-validator");
const read = (file) => readFileSync(new URL(file, root), "utf8");
const sourceFile = "apps/api/src/tickets/tickets.service.ts";

function evaluate(text, bindings = {}) {
  const result = ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  });
  const exports = {};
  new Function("exports", ...Object.keys(bindings), result.outputText)(
    exports,
    ...Object.values(bindings),
  );
  return exports;
}
const time = evaluate(read("apps/api/src/common/utils/tehran-time.ts"));
const hours = evaluate(read("apps/api/src/common/utils/business-hours.ts"), {
  require: (name) => {
    assert.equal(name, "./tehran-time");
    return time;
  },
});
const dto = evaluate(read("apps/api/src/tickets/dto/ticket.dto.ts"), {
  require: apiRequire,
});
const reportText = functionEvidence(
  read("apps/api/src/orders/domain/order-reports.ts"),
  "createVersionedOrderReport",
).text;
const { createVersionedOrderReport } = evaluate(
  `export ${reportText.replace(/^export\s+/, "")}`,
  { ReportStatus },
);
const methodNames = [
  "create",
  "addCustomerMessage",
  "findOneForCustomer",
  "assign",
  "reply",
  "escalate",
  "resolve",
  "close",
  "ensureExists",
  "assertSupportCanAct",
  "assertCustomerAttachment",
  "assertSupportAttachment",
  "supportPerformance",
  "flagOverdueTickets",
];
const methodText = methodNames
  .map(
    (name) =>
      classMethodEvidence(read(sourceFile), "TicketsService", name, sourceFile)
        .text,
  )
  .join("\n");
const { Harness } = evaluate(
  `export class Harness {constructor(d){Object.assign(this,d);}\n${methodText}\n}`,
  {
    UserRole,
    TicketStatus,
    MessageVisibility,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    ...hours,
    generateReferenceCode: (prefix) => `${prefix}-fixture`,
    createVersionedOrderReport,
  },
);

const rolesFile = "apps/api/src/common/guards/roles.guard.ts";
const roleBody = classMethodEvidence(
  read(rolesFile),
  "RolesGuard",
  "canActivate",
  rolesFile,
).text;
const { RoleProbe } = evaluate(
  `export class RoleProbe {constructor(reflector){this.reflector=reflector;} ${roleBody}}`,
  {
    UserRole,
    CapabilityType,
    ForbiddenException,
    ROLES_KEY: "fixture-role-key",
  },
);
function guard(required, user) {
  const probe = new RoleProbe({ getAllAndOverride: () => required });
  return probe.canActivate({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });
}

test("actual RolesGuard accepts customer capability but not support capability escalation", () => {
  assert.equal(
    guard(["customer"], { role: "executor", capabilities: ["customer"] }),
    true,
  );
  assert.throws(
    () =>
      guard(["support", "admin"], {
        role: "customer",
        capabilities: ["support"],
      }),
    ForbiddenException,
  );
});
test("actual ticket role guard rejects anonymous and executor-only users", () => {
  assert.throws(
    () => guard(["support", "admin"], undefined),
    ForbiddenException,
  );
  assert.throws(
    () => guard(["support", "admin"], { role: "executor", capabilities: [] }),
    ForbiddenException,
  );
});
test("actual RolesGuard permits support/admin ticket roles regardless of admin scope (scope review remains open)", () => {
  assert.equal(
    guard(["support", "admin"], { role: "support", capabilities: [] }),
    true,
  );
  for (const adminScope of ["ops", "finance", "super"])
    assert.equal(
      guard(["support", "admin"], {
        role: "admin",
        adminScope,
        capabilities: [],
      }),
      true,
    );
});

function fixture(options = {}) {
  const ticket = {
    id: "ticket",
    code: "TCK-fixture",
    customerId: "customer",
    orderId: "order",
    subject: "subject",
    assignedToUserId: "support",
    status: "assigned",
    slaDueAt: new Date("2026-01-01Z"),
    ...options.ticket,
  };
  const effects = [],
    queries = [],
    messages = [],
    events = [],
    reports = [];
  const prisma = {
    ticket: {
      findUnique: async (args) => {
        queries.push(["ticket.findUnique", args]);
        return options.missing ? null : { ...ticket };
      },
      create: async (args) => {
        effects.push(["ticket.create", args]);
        return args.data;
      },
      update: async (args) => {
        if (options.failTicketUpdate) throw new Error("ticket update failed");
        effects.push(["ticket.update", args]);
        Object.assign(ticket, args.data);
        return { ...ticket };
      },
      count: async (args) => {
        queries.push(["ticket.count", args]);
        return 0;
      },
      findMany: async (args) => {
        queries.push(["ticket.findMany", args]);
        return [{ ...ticket }];
      },
    },
    order: {
      findUnique: async (args) => {
        queries.push(["order.findUnique", args]);
        return options.foreignOrder
          ? { customerId: "other" }
          : { customerId: "customer" };
      },
    },
    orderPublicHandler: {
      findFirst: async (args) => {
        queries.push(["handler.findFirst", args]);
        return options.invalidHandler ? null : { id: "handler" };
      },
    },
    orderFile: {
      findFirst: async (args) => {
        queries.push(["file.findFirst", args]);
        return options.invalidAttachment ? null : { id: "attachment" };
      },
    },
    systemSetting: { findUnique: async () => ({ value: [] }) },
    user: {
      findFirst: async (args) => {
        queries.push(["user.findFirst", args]);
        return options.inactiveAssignee ? null : { id: args.where.id };
      },
    },
    ticketMessage: {
      create: async (args) => {
        messages.push(args.data);
        effects.push(["message.create", args]);
        return args.data;
      },
      count: async (args) => {
        queries.push(["message.count", args]);
        return 3;
      },
    },
    ticketSlaEvent: {
      create: async (args) => {
        events.push(args.data);
        effects.push(["sla.create", args]);
        return args.data;
      },
      count: async (args) => {
        queries.push(["sla.count", args]);
        return events.length;
      },
    },
    ticketEscalation: {
      create: async (args) => {
        if (options.failEscalation) throw new Error("escalation row failed");
        effects.push(["escalation.create", args]);
        return args.data;
      },
    },
    auditLog: {
      create: async (args) => {
        effects.push(["audit.create", args]);
        return args.data;
      },
    },
    orderReport: {
      aggregate: async () => ({
        _max: { version: reports.length ? reports.at(-1).version : null },
      }),
      create: async (args) => {
        reports.push(args.data);
        effects.push(["report.create", args]);
        return args.data;
      },
    },
  };
  prisma.$transaction = async (work) => work(prisma);
  const notifications = {
    notifyUser: async (...args) => {
      effects.push(["notification", args]);
      if (options.failNotification) throw new Error("outbox failed");
    },
  };
  const service = new Harness({ prisma, notifications });
  const actor = { id: "support", role: "support", capabilities: [] };
  return {
    service,
    ticket,
    prisma,
    actor,
    effects,
    queries,
    messages,
    events,
    reports,
  };
}

test("class-aware extraction distinguishes same method in two controllers", () => {
  const source = "class A {create(){return 1}} class B {create(){return 2}}";
  assert.match(classMethodEvidence(source, "B", "create").text, /return 2/);
  assert.notEqual(
    classMethodEvidence(source, "A", "create").hash,
    classMethodEvidence(source, "B", "create").hash,
  );
});
test("class-aware extraction rejects missing, duplicate or malformed input", () => {
  for (const [source, cls, method] of [
    ["class A {}", "B", "create"],
    ["class A {}", "A", "create"],
    ["class A {create(){} create(){}}", "A", "create"],
    ["class A {} class A {}", "A", "create"],
    ["class A {", "A", "create"],
  ])
    assert.throws(() => classMethodEvidence(source, cls, method));
});
test("all eight ticket writes classified, whole-system remainder disclosed", () => {
  const review = buildTicketReview();
  checkTicketReview(review);
  const inv = review.facts.routeInventory;
  assert.equal(inv.totalRoutes, 180);
  assert.equal(inv.nonReadRoutes, 104);
  assert.equal(inv.reviewedRoutes, 39);
  assert.equal(inv.remaining.length, 65);
  assert(
    inv.remaining.some(
      (item) => item.signature === "POST /v1/pricing/calculate",
    ),
  );
});
for (const [label, mutate] of [
  [
    "fake phase closure",
    (r) => {
      r.phaseAccepted = true;
    },
  ],
  [
    "fake runtime closure",
    (r) => {
      r.runtimeAccepted = true;
    },
  ],
  [
    "dropped contract",
    (r) => {
      r.contracts.pop();
    },
  ],
  [
    "hidden finding",
    (r) => {
      r.findings.pop();
    },
  ],
  [
    "source drift",
    (r) => {
      r.facts.commands[0].service.hash = "stale";
    },
  ],
])
  test(`review rejects ${label}`, () => {
    const r = buildTicketReview();
    mutate(r);
    assert.throws(() => checkTicketReview(r));
  });

test("create rejects foreign order before creating ticket", async () => {
  const f = fixture({ foreignOrder: true });
  await assert.rejects(
    () =>
      f.service.create("customer", {
        orderId: "order",
        category: "other",
        subject: "s",
        message: "m",
      }),
    ForbiddenException,
  );
  assert.deepEqual(f.effects, []);
});
test("create requires active customer-visible handler within owned order", async () => {
  const f = fixture({ invalidHandler: true });
  await assert.rejects(
    () =>
      f.service.create("customer", {
        orderId: "order",
        relatedPublicHandlerCode: "public-code",
      }),
    ForbiddenException,
  );
  assert.deepEqual(
    f.queries.find(([name]) => name === "handler.findFirst")[1].where,
    {
      orderId: "order",
      publicHandlerCode: "public-code",
      visibleToCustomer: true,
      activeTo: null,
    },
  );
  assert.deepEqual(f.effects, []);
});
test("create attachment must be clean, owned and ticket kind within order", async () => {
  const f = fixture({ invalidAttachment: true });
  await assert.rejects(
    () =>
      f.service.create("customer", {
        orderId: "order",
        attachmentFileId: "attachment",
      }),
    ForbiddenException,
  );
  assert.deepEqual(
    f.queries.find(([name]) => name === "file.findFirst")[1].where,
    {
      id: "attachment",
      orderId: "order",
      uploadedByUserId: "customer",
      fileKind: "ticket_attachment",
      scanStatus: "clean",
    },
  );
  assert.deepEqual(f.effects, []);
});
test("create rejects attachment on ticket without linked order", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.create("customer", { attachmentFileId: "attachment" }),
    ForbiddenException,
  );
  assert.deepEqual(f.effects, []);
});
test("GAP: public handler code without order is stored without handler validation", async () => {
  const f = fixture();
  const created = await f.service.create("customer", {
    category: "other",
    subject: "s",
    message: "m",
    relatedPublicHandlerCode: "unvalidated-code",
  });
  assert.equal(created.relatedPublicHandlerCode, "unvalidated-code");
  assert.equal(created.messages.create.visibility, "customer_visible");
  assert(!f.queries.some(([name]) => name === "handler.findFirst"));
});
test("customer cannot append to another customer's ticket", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.addCustomerMessage("other", "ticket", { body: "text" }),
    NotFoundException,
  );
  assert.deepEqual(f.effects, []);
});
test("customer requested internal visibility is overridden to public", async () => {
  const f = fixture();
  await f.service.addCustomerMessage("customer", "ticket", {
    body: "text",
    visibility: "internal_only",
  });
  assert.equal(f.messages[0].visibility, "customer_visible");
});
test("customer detail query excludes internal notes at data-access layer", async () => {
  const f = fixture();
  await f.service.findOneForCustomer("customer", "ticket");
  assert.deepEqual(f.queries[0][1].include.messages.where, {
    visibility: "customer_visible",
  });
});
for (const [before, after] of [
  ["resolved", "waiting_internal"],
  ["waiting_internal", "waiting_internal"],
  ["waiting_customer", "waiting_customer"],
  ["closed", "closed"],
])
  test(`current customer message transition ${before} -> ${after} (gaps remain)`, async () => {
    const f = fixture({ ticket: { status: before } });
    await f.service.addCustomerMessage("customer", "ticket", { body: "reply" });
    assert.equal(f.messages.length, 1);
    assert.equal(f.ticket.status, after);
  });

test("support cannot assign a ticket to somebody else", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.assign("ticket", "other-support", f.actor),
    ForbiddenException,
  );
  assert.deepEqual(f.effects, []);
});
for (const status of ["resolved", "closed"])
  test(`assignment rejects ${status}`, async () => {
    const f = fixture({ ticket: { status } });
    await assert.rejects(
      () => f.service.assign("ticket", "support", f.actor),
      BadRequestException,
    );
    assert.deepEqual(f.effects, []);
  });
test("assignment requires active primary support role and audits real actor", async () => {
  const f = fixture();
  await f.service.assign("ticket", "support", { id: "admin", role: "admin" });
  assert.deepEqual(
    f.queries.find(([name]) => name === "user.findFirst")[1].where,
    { id: "support", role: "support", status: "active" },
  );
  const audit = f.effects.find(([name]) => name === "audit.create")[1].data;
  assert.equal(audit.actorUserId, "admin");
  assert.equal(audit.action, "ticket.assigned");
  assert.deepEqual(f.effects[0][1].where, { id: "ticket" });
});
test("GAP: existing assignment can be taken by another support user", async () => {
  const f = fixture({ ticket: { assignedToUserId: "previous-support" } });
  await f.service.assign("ticket", "support", f.actor);
  assert.equal(f.ticket.assignedToUserId, "support");
});
test("GAP: two claims using same earlier snapshot both succeed with id-only write", async () => {
  const f = fixture({ ticket: { assignedToUserId: null, status: "open" } });
  const initial = { ...f.ticket };
  let readCount = 0,
    release;
  const bothRead = new Promise((resolve) => {
    release = resolve;
  });
  f.prisma.ticket.findUnique = async () => {
    readCount += 1;
    if (readCount === 2) release();
    await bothRead;
    return { ...initial };
  };
  await Promise.all([
    f.service.assign("ticket", "a", { id: "a", role: "support" }),
    f.service.assign("ticket", "b", { id: "b", role: "support" }),
  ]);
  const writes = f.effects.filter(([name]) => name === "ticket.update");
  assert.equal(writes.length, 2);
  assert(writes.every(([, args]) => Object.keys(args.where).join() === "id"));
  assert.equal(f.effects.filter(([name]) => name === "audit.create").length, 2);
});
for (const assignedToUserId of [null, "other-support"])
  test(`reply rejects support not assigned (${assignedToUserId})`, async () => {
    const f = fixture({ ticket: { assignedToUserId } });
    await assert.rejects(
      () => f.service.reply(f.actor, "ticket", { body: "text" }),
      ForbiddenException,
    );
    assert.deepEqual(f.effects, []);
  });
test("support attachment checks actual uploader, order, kind and scan status", async () => {
  const f = fixture({ invalidAttachment: true });
  await assert.rejects(
    () =>
      f.service.reply(f.actor, "ticket", {
        body: "text",
        attachmentFileId: "file",
      }),
    ForbiddenException,
  );
  assert.deepEqual(
    f.queries.find(([name]) => name === "file.findFirst")[1].where,
    {
      id: "file",
      orderId: "order",
      uploadedByUserId: "support",
      fileKind: "ticket_attachment",
      scanStatus: "clean",
    },
  );
  assert.deepEqual(f.effects, []);
});
test("internal support note does not update status or enqueue public reply", async () => {
  const f = fixture();
  await f.service.reply(f.actor, "ticket", {
    body: "internal",
    visibility: "internal_only",
  });
  assert.equal(f.ticket.status, "assigned");
  assert.equal(f.messages[0].visibility, "internal_only");
  assert.deepEqual(
    f.effects.map(([name]) => name),
    ["message.create"],
  );
});
test("public reply updates status and queues to ticket customer, not delivered receipt", async () => {
  const f = fixture();
  await f.service.reply(f.actor, "ticket", { body: "public" });
  assert.equal(f.ticket.status, "waiting_customer");
  const notification = f.effects.find(([name]) => name === "notification")[1];
  assert.equal(notification[0], "customer");
  assert.equal(notification[1], "ticket.reply");
  assert.equal(notification.length, 4, "No transaction argument is forwarded");
});
test("GAP: public support reply reopens a closed ticket", async () => {
  const f = fixture({ ticket: { status: "closed" } });
  await f.service.reply(f.actor, "ticket", { body: "text" });
  assert.equal(f.ticket.status, "waiting_customer");
});
test("GAP: Outbox failure leaves reply and status persisted; retry duplicates message", async () => {
  const f = fixture({ failNotification: true });
  for (let n = 0; n < 2; n += 1)
    await assert.rejects(
      () => f.service.reply(f.actor, "ticket", { body: "same retry" }),
      /outbox failed/,
    );
  assert.equal(f.messages.length, 2);
  assert.equal(f.ticket.status, "waiting_customer");
});
test("GAP: customer message remains when subsequent reopen update fails", async () => {
  const f = fixture({ ticket: { status: "resolved" }, failTicketUpdate: true });
  await assert.rejects(
    () => f.service.addCustomerMessage("customer", "ticket", { body: "text" }),
    /ticket update failed/,
  );
  assert.equal(f.messages.length, 1);
  assert.equal(f.ticket.status, "resolved");
});
test("GAP: escalation stores whitespace reason and accepts closed state", async () => {
  const f = fixture({ ticket: { status: "closed" } });
  const result = await f.service.escalate("ticket", f.actor, "   ");
  assert.equal(result.reason, "   ");
  assert.equal(result.escalatedByUserId, "support");
  assert.equal(f.ticket.status, "escalated");
});
test("GAP: escalation failure leaves status and SLA event without reason row", async () => {
  const f = fixture({ failEscalation: true });
  await assert.rejects(
    () => f.service.escalate("ticket", f.actor, "real reason"),
    /escalation row failed/,
  );
  assert.equal(f.ticket.status, "escalated");
  assert.equal(f.events.length, 1);
  assert(!f.effects.some(([name]) => name === "escalation.create"));
});
test("GAP: repeated resolve from closed appends two real versioned report calls", async () => {
  const f = fixture({ ticket: { status: "closed" } });
  await f.service.resolve("ticket", f.actor);
  await f.service.resolve("ticket", f.actor);
  assert.equal(f.ticket.status, "resolved");
  assert.deepEqual(
    f.reports.map((r) => r.version),
    [1, 2],
  );
  assert(
    f.reports.every(
      (r) =>
        r.authorUserId === "support" &&
        r.orderId === "order" &&
        r.visibleToCustomer === true,
    ),
  );
  assert(!f.effects.some(([name]) => /order\.update|ledger|escrow/.test(name)));
});
for (const method of ["escalate", "resolve", "close"])
  test(`${method} rejects non-owner support before writes`, async () => {
    const f = fixture({
      ticket: { assignedToUserId: "other-support", status: "resolved" },
    });
    await assert.rejects(
      () => f.service[method]("ticket", f.actor, "reason"),
      ForbiddenException,
    );
    assert.deepEqual(f.effects, []);
  });
test("close accepts only resolved and refuses repeated close", async () => {
  const f = fixture({ ticket: { status: "resolved" } });
  await f.service.close("ticket", f.actor);
  assert.equal(f.ticket.status, "closed");
  await assert.rejects(
    () => f.service.close("ticket", f.actor),
    BadRequestException,
  );
  assert.equal(f.effects.length, 1);
});
test("GAP: admin service path bypasses support-assignee comparison without checking scope", async () => {
  const f = fixture({ ticket: { assignedToUserId: "other-support" } });
  await f.service.reply(
    { id: "finance-admin", role: "admin", adminScope: "finance" },
    "ticket",
    { body: "text" },
  );
  assert.equal(f.messages[0].senderUserId, "finance-admin");
  // This is an exact service-method probe plus static route evidence, not HTTP.
  const route = buildTicketReview().facts.commands.find(
    (c) => c.id === "Z0-TKT-05",
  ).route;
  assert(route.classDecorators.some((text) => text.includes("RolesGuard")));
  assert(
    !route.classDecorators.some((text) => text.includes("AdminScopeGuard")),
  );
});
test("GAP: support performance aggregate query does not filter sender role", async () => {
  const f = fixture();
  await f.service.supportPerformance();
  const where = f.queries.find(([name]) => name === "message.count")[1].where;
  assert.deepEqual(where, { visibility: "customer_visible" });
});
test("GAP: repeated overdue scan appends breach twice and includes waiting_customer", async () => {
  const f = fixture({ ticket: { status: "waiting_customer" } });
  await f.service.flagOverdueTickets();
  await f.service.flagOverdueTickets();
  assert.equal(f.events.length, 2);
  assert(f.events.every((event) => event.eventType === "breach"));
  assert(
    !f.queries
      .find(([name]) => name === "ticket.findMany")[1]
      .where.status.notIn.includes("waiting_customer"),
  );
});
test("GAP: actual string DTOs accept empty/whitespace subject, message, reply and reason", async () => {
  for (const instance of [
    Object.assign(new dto.CreateTicketDto(), {
      category: "other",
      subject: "",
      message: "   ",
    }),
    Object.assign(new dto.AddTicketMessageDto(), { body: "   " }),
    Object.assign(new dto.EscalateTicketDto(), { reason: "   " }),
  ])
    assert.deepEqual(await validate(instance), []);
});
test("current DTO rejects invalid visibility/category and non-string reason", async () => {
  for (const instance of [
    Object.assign(new dto.CreateTicketDto(), {
      category: "invalid",
      subject: "s",
      message: "m",
    }),
    Object.assign(new dto.AddTicketMessageDto(), {
      body: "text",
      visibility: "secret",
    }),
    Object.assign(new dto.EscalateTicketDto(), { reason: 4 }),
  ])
    assert((await validate(instance)).length > 0);
});
test("GAP: actual current SLA priority targets are 27/9/8/4, not uniform first response", () => {
  assert.deepEqual(
    ["low", "normal", "high", "urgent"].map(hours.slaTargetHoursForPriority),
    [27, 9, 8, 4],
  );
});
test("GAP: current calendar skips Thursday although DEC04 target includes it", () => {
  // Thursday 2026-10-22 09:00 Tehran +4 currently lands Saturday 13:00.
  const due = hours.addBusinessHours(new Date("2026-10-22T05:30:00.000Z"), 4);
  assert.equal(due.toISOString(), "2026-10-24T09:30:00.000Z");
});
test("actual business calendar honors holiday and rejects invalid hours", () => {
  const due = hours.addBusinessHours(
    new Date("2026-10-24T05:30:00.000Z"),
    4,
    new Set(["2026-10-24"]),
  );
  assert.equal(due.toISOString(), "2026-10-25T09:30:00.000Z");
  for (const number of [-1, NaN, Infinity])
    assert.throws(() => hours.addBusinessHours(new Date(), number), RangeError);
});
