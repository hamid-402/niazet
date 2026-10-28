import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { controllerRoutes } from "./zeus-z0-traceability.mjs";
import {
  classContract,
  commandDefinitions,
} from "./zeus-z0-order-commands.mjs";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ts = createRequire(resolve(root, "apps/api/package.json"))("typescript");
const read = (file) =>
  readFileSync(resolve(root, file), "utf8").replaceAll("\r\n", "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const serviceFile = "apps/api/src/tickets/tickets.service.ts";
const customerFile = "apps/api/src/tickets/tickets.controller.ts";
const supportFile = "apps/api/src/tickets/tickets.support.controller.ts";
const dtoFile = "apps/api/src/tickets/dto/ticket.dto.ts";

// Class + method is the identity: files may declare several controllers with
// identically named methods. A bare method-name search must not select one.
export function classMethodEvidence(
  text,
  className,
  methodName,
  file = "fixture.ts",
) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  assert.equal(
    source.parseDiagnostics.length,
    0,
    `Invalid TypeScript: ${file}`,
  );
  const classes = source.statements.filter(
    (node) => ts.isClassDeclaration(node) && node.name?.text === className,
  );
  assert.equal(classes.length, 1, `Missing/ambiguous class: ${className}`);
  const methods = classes[0].members.filter(
    (node) =>
      ts.isMethodDeclaration(node) && node.name.getText(source) === methodName,
  );
  assert.equal(
    methods.length,
    1,
    `Missing/ambiguous method: ${className}.${methodName}`,
  );
  const node = methods[0];
  return {
    file,
    className,
    methodName,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    hash: hash(node.getText(source)),
    text: node.getText(source),
  };
}

const rows = [
  [
    "01",
    customerFile,
    "TicketsController",
    "POST /v1/customer/tickets",
    "create",
    "create",
    "CreateTicketDto",
    "API15",
  ],
  [
    "02",
    customerFile,
    "TicketsController",
    "POST /v1/customer/tickets/:id/messages",
    "addMessage",
    "addCustomerMessage",
    "AddTicketMessageDto",
    "API17",
  ],
  [
    "03",
    supportFile,
    "TicketsSupportController",
    "PATCH /v1/support/tickets/:id/assign",
    "assign",
    "assign",
    "AssignTicketDto",
    "API19",
  ],
  [
    "04",
    supportFile,
    "TicketsSupportController",
    "POST /v1/support/tickets/:id/claim",
    "claim",
    "assign",
    null,
    "D03",
  ],
  [
    "05",
    supportFile,
    "TicketsSupportController",
    "POST /v1/support/tickets/:id/reply",
    "reply",
    "reply",
    "AddTicketMessageDto",
    "ZEUS-API4-023",
  ],
  [
    "06",
    supportFile,
    "TicketsSupportController",
    "POST /v1/support/tickets/:id/escalate",
    "escalate",
    "escalate",
    "EscalateTicketDto",
    "ZEUS-API4-024",
  ],
  [
    "07",
    supportFile,
    "TicketsSupportController",
    "POST /v1/support/tickets/:id/resolve",
    "resolve",
    "resolve",
    null,
    "ZEUS-UI-031",
  ],
  [
    "08",
    supportFile,
    "TicketsSupportController",
    "POST /v1/support/tickets/:id/close",
    "close",
    "close",
    null,
    "API18",
  ],
];
export const ticketDefinitions = rows.map(
  ([id, file, className, signature, handler, service, dto, requirement]) => ({
    id: `Z0-TKT-${id}`,
    file,
    className,
    signature,
    handler,
    service,
    dto,
    requirement,
  }),
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(resolve(directory, entry.name))
      : [resolve(directory, entry.name)],
  );
}
export function inspectTicketCommands() {
  const files = walk(resolve(root, "apps/api/src"))
    .filter((file) => file.endsWith(".controller.ts"))
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .sort();
  const allRoutes = files.flatMap((file) => controllerRoutes(read(file), file));
  const writes = allRoutes.filter(
    (item) => !["GET", "HEAD", "OPTIONS"].includes(item.method),
  );
  const signature = (route) => `${route.method} ${route.path}`;
  assert.equal(
    new Set(writes.map(signature)).size,
    writes.length,
    "Duplicate write signature requires explicit review",
  );
  const reviewed = [...commandDefinitions, ...ticketDefinitions].map(
    (item) => item.signature,
  );
  assert.equal(
    new Set(reviewed).size,
    reviewed.length,
    "Duplicate reviewed route",
  );
  for (const item of reviewed)
    assert(
      writes.some((route) => signature(route) === item),
      `Reviewed route no longer exists: ${item}`,
    );
  const commands = ticketDefinitions.map((item) => {
    const routes = allRoutes.filter(
      (route) =>
        signature(route) === item.signature &&
        route.file === item.file &&
        route.className === item.className &&
        route.handler === item.handler,
    );
    assert.equal(routes.length, 1, `Missing/ambiguous route: ${item.id}`);
    const controller = classMethodEvidence(
      read(item.file),
      item.className,
      item.handler,
      item.file,
    );
    const service = classMethodEvidence(
      read(serviceFile),
      "TicketsService",
      item.service,
      serviceFile,
    );
    const { text: controllerText, ...controllerRef } = controller;
    const { text: serviceText, ...serviceRef } = service;
    assert(
      controllerText.includes(`this.tickets.${item.service}(`),
      `Delegation drift: ${item.id}`,
    );
    return {
      ...item,
      route: routes[0],
      controller: controllerRef,
      service: serviceRef,
      dto: item.dto ? classContract(read(dtoFile), item.dto, dtoFile) : null,
    };
  });
  const scoped = writes
    .filter((item) => [customerFile, supportFile].includes(item.file))
    .map(signature)
    .sort();
  assert.deepEqual(
    scoped,
    ticketDefinitions.map((item) => item.signature).sort(),
    "Unreviewed scoped ticket command",
  );
  const dependencies = [
    serviceFile,
    customerFile,
    supportFile,
    dtoFile,
    "apps/api/src/common/utils/business-hours.ts",
    "apps/api/src/common/utils/tehran-time.ts",
    "apps/api/src/common/guards/roles.guard.ts",
    "apps/api/src/common/guards/jwt-auth.guard.ts",
    "apps/api/src/auth/strategies/jwt.strategy.ts",
    "apps/api/src/auth/auth-session.service.ts",
    "apps/api/src/orders/domain/order-reports.ts",
    "apps/api/src/notifications/notifications.service.ts",
    "apps/api/src/main.ts",
    "apps/api/src/app.module.ts",
    "apps/api/prisma/schema.prisma",
    "docs/zeus/z0-decisions.json",
  ];
  const downstream = [
    "ensureExists",
    "assertSupportCanAct",
    "assertCustomerAttachment",
    "assertSupportAttachment",
    "findOneForCustomer",
    "findOneForSupport",
    "supportPerformance",
    "flagOverdueTickets",
  ].map((name) => {
    const { text, ...ref } = classMethodEvidence(
      read(serviceFile),
      "TicketsService",
      name,
      serviceFile,
    );
    return ref;
  });
  const report = functionEvidence(
    read(dependencies[10]),
    "createVersionedOrderReport",
  );
  downstream.push({
    file: dependencies[10],
    name: "createVersionedOrderReport",
    line: report.line,
    hash: report.hash,
  });
  const inputHashes = Object.fromEntries(
    dependencies.map((file) => [file, hash(read(file))]),
  );
  return {
    commands,
    downstream,
    inputHashes,
    routeInventory: {
      totalRoutes: allRoutes.length,
      nonReadRoutes: writes.length,
      reviewedRoutes: reviewed.length,
      scopedTicketRoutes: scoped,
      remaining: writes
        .filter((route) => !reviewed.includes(signature(route)))
        .map((route) => ({
          signature: signature(route),
          file: route.file,
          className: route.className,
          handler: route.handler,
          hash: route.methodHash,
        })),
      controllerSetHash: hash(
        JSON.stringify(files.map((file) => [file, hash(read(file))])),
      ),
      note: "Non-read HTTP inventory includes the nonbinding read-only pricing calculation POST. A classified route is not accepted runtime behavior, transitive review or complete Z0.",
    },
  };
}

const contracts = [
  {
    id: "Z0-TKT-01",
    actor:
      "Authenticated customer role or customer capability via RolesGuard; user.id supplied by JWT, not body.",
    ownership:
      "Optional order must belong to customer; supplied public handler must be active/customer-visible within that order. Attachment requires an order and own uploaded ticket_attachment with clean scan.",
    preconditions:
      "Category/priority enums; strings only for subject/message, no trim/min/max. No-order public-handler code has no lookup. SLA derives from current mutable holiday setting and priority, not a versioned snapshot.",
    effects:
      "Nested ticket + initial customer-visible message in one Prisma create; no order transition or financial call.",
    replayConcurrency:
      "No command idempotency key; retries can create multiple tickets/codes. Ownership/attachment reads outside create.",
    auditHistory:
      "Ticket/message sender and timestamps persisted; no explicit creation AuditLog in service.",
    testsNeeded: [
      "foreign order/handler/dirty or foreign attachment rejects without writes",
      "blank/oversized body DTO and no-order handler semantics",
      "calendar version and first meaningful public response under DEC04; legacy tickets preserved",
      "duplicate create and unique reference collision in isolated HTTP/DB",
    ],
  },
  {
    id: "Z0-TKT-02",
    actor:
      "Authenticated customer role/capability; current user id used as sender.",
    ownership:
      "Ticket customerId must equal caller; attachment same order, caller uploader, kind ticket_attachment and scan clean. Requested internal visibility ignored; customer message always public.",
    preconditions:
      "No explicit rejection for closed ticket. Resolved or waiting_internal becomes waiting_internal; waiting_customer stays waiting_customer on customer response.",
    effects:
      "Message create followed by optional ticket status update outside a shared transaction; no money/order command.",
    replayConcurrency:
      "No replay key; message may persist if later status write fails. No status/ownership CAS on the write.",
    auditHistory:
      "Message sender/time only; no status event or explicit AuditLog here.",
    testsNeeded: [
      "other customer gets NotFound without writes",
      "internal visibility cannot be requested by customer",
      "resolved/closed/waiting_customer reply transition and retry",
      "partial failure after message persistence and attachment rejection",
    ],
  },
  {
    id: "Z0-TKT-03",
    actor:
      "Support or any admin role via RolesGuard; no AdminScopeGuard/capability per command currently declared.",
    ownership:
      "Support may assign only to self; any admin may select an active primary-role support user. Existing other assignee does not block takeover.",
    preconditions:
      "Resolved/closed denied on a pre-transaction read; target role support and active. Assignment state otherwise overwritten to assigned.",
    effects:
      "Ticket update and ticket.assigned AuditLog in one transaction; no financial/order state change.",
    replayConcurrency:
      "Read occurs before transaction; update where id only, no expected old assignee/status. Concurrent claims can both succeed/overwrite; retry adds another AuditLog.",
    auditHistory:
      "Actor id/role, old/new assignee saved, but before is from the earlier read and not a guaranteed locked snapshot.",
    testsNeeded: [
      "support assigning other rejected; admin assigning inactive/non-support rejected",
      "closed/resolved assignment rejected",
      "competing support claims cannot silently steal after future fix",
      "transaction rollback and truthful before/after audit in isolated DB",
    ],
  },
  {
    id: "Z0-TKT-04",
    actor: "Support or any admin role; delegates assign(id, user.id, user).",
    ownership:
      "Same as assign; admin claiming self is rejected unless that user's primary role is support (current service query).",
    preconditions:
      "Same target-role and terminal-state checks as assign, not a distinct atomic claim command.",
    effects:
      "Delegated assignment transaction plus AuditLog; no money command.",
    replayConcurrency:
      "Same id-only update/overwrite window as assign, no first-claim CAS or replay key.",
    auditHistory: "ticket.assigned actor audit; not a separate claimed action.",
    testsNeeded: [
      "claim controller binds real current id",
      "two claimants and existing assignee",
      "admin self-claim current rejection recorded, not silently broadened",
    ],
  },
  {
    id: "Z0-TKT-05",
    actor:
      "Support or any admin role; support must own assignment, admin bypasses that comparison only.",
    ownership:
      "Own clean ticket_attachment within ticket.orderId; customer-facing details filter internal notes. Admin scope not checked in this controller.",
    preconditions:
      "No resolved/closed status guard. Body only IsString. internal_only explicitly internal; all other DTO-valid cases public.",
    effects:
      "Create message; public reply separately sets waiting_customer and queues ticket.reply via notifyUser without tx; internal note neither changes status nor queues. No first-response SLA event/snapshot.",
    replayConcurrency:
      "No replay key/shared transaction; failed ticket update or Outbox insertion can leave message/status persisted and retry duplicate replies.",
    auditHistory:
      "Sender/time/visibility persisted, but no explicit reply AuditLog or meaningful-first-response attribution; queue is not delivered receipt.",
    testsNeeded: [
      "unassigned/other support and dirty/foreign attachment denied",
      "internal note invisible in customer query and not first response",
      "closed reply and whitespace body characterized",
      "notification failure/retry and atomic first public response under concurrency",
      "per-command admin capability negative cases under DEC13",
    ],
  },
  {
    id: "Z0-TKT-06",
    actor: "Support assigned to ticket or any admin role via controller/guard.",
    ownership:
      "ensureExists and support-assignee check; no admin scope in this route.",
    preconditions:
      "No terminal-state check; reason IsString only, no trim/nonblank. Reason actually stored, not discarded.",
    effects:
      "Separate ticket->escalated update, SLA event and escalation row; no money/order transition.",
    replayConcurrency:
      "No shared transaction/replay key/CAS. Failure may leave escalated status/event without reason row; repeated escalation adds rows.",
    auditHistory:
      "Escalation carries actor/reason/time, SLA event has no actor. No dedicated AuditLog.",
    testsNeeded: [
      "wrong assignee no writes",
      "blank reason currently passes DTO and persists",
      "closed/resolved escalation and transaction failure",
      "authorized trimmed reason actually consumed after scoped fix",
    ],
  },
  {
    id: "Z0-TKT-07",
    actor:
      "Support assigned to ticket or any admin role; no explicit admin command capability currently.",
    ownership:
      "Ticket exists in transaction; support assignment checked against actor. Related order id comes from ticket, not arbitrary request body.",
    preconditions:
      "No current-state guard; repeated resolve or closed->resolved permitted by method.",
    effects:
      "Within tx set resolved/resolvedAt; if linked order, append versioned public support report. Does not modify Order.status, escrow or ledger.",
    replayConcurrency:
      "No replay key/status CAS; repeats change resolvedAt and can append more reports. Report version uses aggregate+1; DB/concurrency acceptance separate.",
    auditHistory:
      "Resolved timestamp + report author, no explicit resolve AuditLog; no SLA first-response event.",
    testsNeeded: [
      "foreign assignment denied with transaction rollback",
      "closed/repeated resolve and related report duplicates",
      "report version collision and failure rollback in isolated DB",
      "resolution duration separate from approved first-response clock",
    ],
  },
  {
    id: "Z0-TKT-08",
    actor:
      "Support assigned to ticket or any admin role; customer has no close route here.",
    ownership:
      "Ticket exists; support assignment checked. Admin scope/capability not independently checked.",
    preconditions:
      "Only resolved allowed by pre-write check; repeated close currently fails instead of returning prior result.",
    effects:
      "Update status closed/closedAt by id; no order or financial mutation.",
    replayConcurrency:
      "Check then id-only update outside transaction; concurrent change after read not protected by CAS.",
    auditHistory:
      "closedAt only, no explicit actor/reason AuditLog in this method.",
    testsNeeded: [
      "wrong assignee, nonexistent and non-resolved denied",
      "resolved close accepted; repeated close and racing reply",
      "command-specific permission/audit per DEC13",
    ],
  },
];

const findings = [
  [
    "01",
    "DEC04 calendar/metric gap",
    "Current normal SLA is 9 working hours, Thursday+Friday excluded; urgent=4/high=8/low=27. Ticket has slaDueAt/resolvedAt/closedAt but no versioned calendar/target or first meaningful public response marker. Existing breach/summary is not the approved first-response metric.",
    "D07",
    "Add an additive versioned policy/calendar snapshot and atomic eligible first-public-response event for new tickets only; separate resolution metric. Preserve old deadlines and unknown history. Do not change shared helper or data before scoped authorization/tests.",
  ],
  [
    "02",
    "Non-atomic claim/assignment",
    "Support can take an already assigned ticket for self; pre-read then id-only transactional update permits both concurrent claims and stale audit-before values.",
    "D03",
    "Define authorized reassignment separately from claim; use expected-assignee/status CAS/locking and transaction-bound audit. Test two real DB connections and replay, without silently changing who may reassign.",
  ],
  [
    "03",
    "Terminal ticket and reopen drift",
    "reply/escalate/resolve lack terminal-state guards; public reply can reopen closed to waiting_customer, resolve can reopen closed and duplicate reports, while customer response on waiting_customer leaves status unchanged.",
    "ZEUS-UI-031",
    "Explicit ticket transition and replay contract with non-destructive history; compare current UI and owner expectations, then scoped implementation and tests for all terminal/reopen paths.",
  ],
  [
    "04",
    "Blank text/reason accepted",
    "Ticket DTO string validators accept whitespace/empty strings; escalation persists reason but does not normalize or ensure meaningful nonblank value. This conflicts with the approved real server-side sensitive-reason rule.",
    "DEC16",
    "Trim and bound text server-side; nonblank reason must be consumed in escalation/audit. Keep internal/public visibility and customer-confirmation no-fake-note contract. DTO/behavior fix needs scoped authority.",
  ],
  [
    "05",
    "Partial persistence and duplicate retry",
    "Reply/customer response/escalation use separate writes and Outbox may fail after message/status persists. Caller may see failure and resend, producing duplicates; notifyUser supports tx but reply does not supply it.",
    "ZEUS-API4-023",
    "Atomic domain+Outbox transaction and payload-bound idempotency; preserve user text on retry; inject DB/Outbox/report failure and test rollback/concurrent replay.",
  ],
  [
    "06",
    "Unsupported support KPI",
    "supportPerformance counts every customer-visible message; aggregate without userId includes customer-authored messages, not only support replies. No meaningful-first-response denominator or period/provenance. It must not drive automated HR effects.",
    "ZEUS-UI-032",
    "Role- and event-qualified metrics with interval, denominator and unknown state; separate first response/resolution and require human audited command for any sensitive staffing effect per DEC16.",
  ],
  [
    "07",
    "Repeated breach events",
    "flagOverdueTickets selects waiting_customer and has no first-response marker or breach-event deduplication; repeated calls append breach rows and urgent update for same still-overdue ticket, inflating KPI.",
    "D07",
    "Versioned policy and one breach event per ticket/clock/policy generation; first-response clock must not pause while waiting_customer. Backfill neither historical first-response nor zero scores from unknown data.",
  ],
  [
    "08",
    "Admin command authority wider than DEC13 target",
    "Support controller declares support/admin RolesGuard only, no AdminScopeGuard. Current service skips assignee restriction for all admin roles; no Ops/Finance/Super per-command proxy capability. This is authenticated broad admin access, not anonymous access or proof of production exploit.",
    "DEC13",
    "Implement explicit allowed command+subject capability and separate actor/owner audit in an independently authorized access package; preserve Support's zero financial authority and no impersonation.",
  ],
];

export function buildTicketReview() {
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    kind: "static-current-ticket-command-contract",
    phaseAccepted: false,
    runtimeAccepted: false,
    databaseQueried: false,
    facts: inspectTicketCommands(),
    contracts: contracts.map((item) => ({
      ...item,
      money:
        "No payment/refund/withdrawal/ledger command in reviewed method; transitive HTTP/DB acceptance remains separate.",
      status: "reviewed-current-contract-runtime-acceptance-pending",
    })),
    findings: findings.map(([id, title, evidence, requirement, nextStep]) => ({
      id: `Z0-TKT-GAP-${id}`,
      title,
      evidence,
      requirement,
      nextStep,
      accepted: false,
      targetPhases: ["Z1", "Z5", "Z9"],
    })),
    authority:
      "Documentation and isolated in-memory characterization only. DEC04/13/16 target approvals are not protected runtime/auth/DB exceptions. Fixed preservation baseline and the three existing invoice/pricing/reconciliation exceptions remain unchanged.",
    limits:
      "Eight scoped write routes reviewed, not full Z0 or all remaining commands. AST/hash/DTO evidence is not authentication, SQL rollback, live notification, distributed concurrency, privacy export or E2E acceptance. GAP tests deliberately reproduce open behavior and must not be called fixes.",
  };
}

export function checkTicketReview(record, expected = buildTicketReview()) {
  assert.equal(
    record.phaseAccepted,
    false,
    "Ticket subset cannot accept phase",
  );
  assert.equal(
    record.runtimeAccepted,
    false,
    "Static review cannot accept runtime",
  );
  assert.equal(record.databaseQueried, false);
  assert.deepEqual(
    record,
    expected,
    "Ticket contract/source/route inventory drift; review before regenerating",
  );
  assert.equal(record.contracts.length, 8);
  assert.equal(record.findings.length, 8);
  assert(record.findings.every((finding) => finding.accepted === false));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const review = buildTicketReview();
  if (process.argv.includes("--json"))
    console.log(JSON.stringify(review, null, 2));
  else {
    if (process.argv.includes("--check"))
      checkTicketReview(
        JSON.parse(read("docs/zeus/z0-ticket-command-review.json")),
        review,
      );
    const inventory = review.facts.routeInventory;
    console.log(
      JSON.stringify({
        ticketContracts: review.contracts.length,
        openFindings: review.findings.length,
        totalRoutes: inventory.totalRoutes,
        nonReadRoutes: inventory.nonReadRoutes,
        reviewedRoutes: inventory.reviewedRoutes,
        remainingRoutes: inventory.remaining.length,
        phaseAccepted: false,
      }),
    );
  }
}
