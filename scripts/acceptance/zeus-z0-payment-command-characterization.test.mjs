import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";

// Current-behavior probes of exact method declarations, executed in memory.
// All tx/gateway/ledger dependencies below are explicit fakes. No live app,
// environment file, Prisma client, database, HTTP or provider is instantiated.
// Passing a GAP characterization test reproduces a gap; it does not accept it.
const root = new URL("../../", import.meta.url);
const requireApi = createRequire(new URL("apps/api/package.json", root));
const ts = requireApi("typescript");
const enums = requireApi("@prisma/client");
const { BadRequestException, ConflictException, NotFoundException } =
  requireApi("@nestjs/common");
const read = (path) => readFileSync(new URL(path, root), "utf8");

function methodHarness(file, method, dependencies) {
  const evidence = functionEvidence(read(file), method, true);
  const source = `export class Harness { constructor(dependencies) { Object.assign(this, dependencies); }\n${evidence.text}\n}`;
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const bindings = {
    BadRequestException,
    ConflictException,
    NotFoundException,
    OrderStatus: enums.OrderStatus,
    OrderStatusSource: enums.OrderStatusSource,
    MessageVisibility: enums.MessageVisibility,
    PaymentStatus: enums.PaymentStatus,
    LedgerAccountType: enums.LedgerAccountType,
    LedgerReferenceType: enums.LedgerReferenceType,
    EscrowStatus: enums.EscrowStatus,
  };
  const exports = {};
  // There are no imports/decorators/constructors from the backend module: only
  // the reviewed method body and these bounded in-memory dependencies.
  new Function("exports", ...Object.keys(bindings), js)(
    exports,
    ...Object.values(bindings),
  );
  return new exports.Harness(dependencies);
}

function triageFixture() {
  const order = { id: "order-fixture", status: "pending_triage" },
    transitions = [];
  const service = methodHarness(
    "apps/api/src/orders/orders.service.ts",
    "triage",
    {
      prisma: { order: { findUnique: async () => ({ ...order }) } },
      transition: async (_id, to, source, _actor, _note, extra) => {
        transitions.push({ to, source, extra });
        order.status = to;
        return { ...order };
      },
    },
  );
  return { service, order, transitions };
}

test("characterization GAP: assign_direct falls back to pending_quote, never assigned", async () => {
  const { service, order, transitions } = triageFixture();
  await service.triage("admin-fixture", order.id, {
    decision: "assign_direct",
  });
  assert.deepEqual(
    transitions.map((item) => item.to),
    ["triaging", "pending_quote"],
  );
  assert.equal(order.status, "pending_quote");
});
test("characterization GAP: missing auto_quote price is rejected after entering triaging", async () => {
  const { service, order, transitions } = triageFixture();
  await assert.rejects(
    () => service.triage("admin-fixture", order.id, { decision: "auto_quote" }),
    BadRequestException,
  );
  assert.deepEqual(
    transitions.map((item) => item.to),
    ["triaging"],
  );
  assert.equal(order.status, "triaging");
});
test("current auto_quote accepts zero, distinct from manual QuoteOrderDto minimum", async () => {
  const { service, order, transitions } = triageFixture();
  await service.triage("admin-fixture", order.id, {
    decision: "auto_quote",
    finalPrice: 0,
  });
  assert.equal(order.status, "quoted");
  assert.equal(transitions[1].extra.finalPrice, 0);
});

function paymentFixture(
  orderStatus,
  verified = true,
  paymentStatus = "verifying",
) {
  const order = {
    id: "order-fixture",
    customerId: "customer-fixture",
    status: orderStatus,
    version: 1,
    finalPrice: 100000,
  };
  const payment = {
    id: "payment-fixture",
    orderId: order.id,
    customerId: order.customerId,
    status: paymentStatus,
    gateway: "mock",
    gatewayRef: "fixture-ref",
    amount: 100000,
  };
  const effects = {
    gateway: [],
    ledger: [],
    escrow: [],
    history: [],
    invoices: [],
    outbox: [],
    audit: [],
  };
  const tx = {
    payment: {
      findFirst: async () => ({ ...payment }),
      update: async ({ data }) => Object.assign(payment, data),
      updateMany: async ({ data }) => {
        Object.assign(payment, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...payment }),
    },
    escrowHold: {
      create: async ({ data }) => {
        const value = { id: "escrow-fixture", ...data };
        effects.escrow.push(value);
        return value;
      },
      findUnique: async () => ({ id: "existing-escrow-fixture" }),
    },
    orderMilestone: { count: async () => 0 },
    order: {
      findUniqueOrThrow: async () => ({ ...order }),
      updateMany: async ({ data }) => {
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    orderStatusHistory: {
      create: async ({ data }) => effects.history.push(data),
    },
    customerProfile: { findUnique: async () => null },
    invoice: { upsert: async (args) => effects.invoices.push(args) },
    auditLog: { create: async ({ data }) => effects.audit.push(data) },
    outboxEvent: { create: async ({ data }) => effects.outbox.push(data) },
  };
  const service = methodHarness(
    "apps/api/src/finance/payments.service.ts",
    "verifyAndSettleInTransaction",
    {
      gateway: {
        name: "mock",
        verifyPayment: async (args) => {
          effects.gateway.push(args);
          return { verified };
        },
      },
      ledger: {
        getSystemAccount: async (type) => ({ id: type }),
        postEntry: async (entry) => effects.ledger.push(entry),
      },
    },
  );
  const run = () =>
    service.verifyAndSettleInTransaction(
      {
        orderId: order.id,
        paymentId: payment.id,
        customerId: order.customerId,
        idempotencyKey: "fixture-12345678",
      },
      tx,
    );
  return { run, order, payment, effects };
}

test("positive control: verified pending_payment goes to paid with one held ledger entry", async () => {
  const { run, order, payment, effects } = paymentFixture("pending_payment");
  await run();
  assert.equal(payment.status, "succeeded");
  assert.equal(order.status, "paid");
  assert.equal(effects.ledger.length, 1);
  assert.equal(effects.escrow.length, 1);
  assert.equal(effects.history.length, 1);
  assert.equal(effects.invoices.length, 1);
  assert.equal(effects.ledger[0].amount, 100000);
});
for (const status of ["cancelled", "closed"]) {
  test(`characterization GAP: late verify can settle to escrow while order remains ${status}`, async () => {
    const { run, order, payment, effects } = paymentFixture(status);
    const result = await run();
    assert.equal(result.alreadyProcessed, false);
    assert.equal(payment.status, "succeeded");
    assert.equal(order.status, status);
    assert.equal(effects.ledger.length, 1);
    assert.equal(effects.escrow.length, 1);
    assert.equal(effects.history.length, 0);
    assert.equal(effects.invoices.length, 0);
    assert.equal(effects.outbox[0].eventType, "payment.succeeded");
  });
}
test("negative control: gateway refusal never creates escrow or ledger entry", async () => {
  const { run, payment, effects } = paymentFixture("pending_payment", false);
  assert.equal((await run()).verificationFailed, true);
  assert.equal(payment.status, "failed");
  assert.equal(effects.ledger.length, 0);
  assert.equal(effects.escrow.length, 0);
});
test("already succeeded payment does not verify or post money again in this branch", async () => {
  const { run, effects } = paymentFixture("paid", true, "succeeded");
  assert.equal((await run()).alreadyProcessed, true);
  assert.equal(effects.gateway.length, 0);
  assert.equal(effects.ledger.length, 0);
});
