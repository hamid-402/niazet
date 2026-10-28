import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// No main AppModule, jobs, seed or live adapter. A minimal HTTP test module
// uses the production guards/controller/services with real DB-backed sessions.
// The configured database is NEVER
// connected: only postgres maintenance and a newly created random local DB.
const apiRoot = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const requireApi = createRequire(join(apiRoot, "package.json"));
const { PrismaClient } = requireApi("@prisma/client");
const { ConfigService } = requireApi("@nestjs/config");
const { LedgerService } = requireApi("./dist/finance/ledger.service.js");
const { IdempotencyService } = requireApi(
  "./dist/finance/idempotency.service.js",
);
const { WalletPaymentsService } = requireApi(
  "./dist/finance/wallet-payments.service.js",
);
const { PaymentsService } = requireApi("./dist/finance/payments.service.js");
const { EscrowService } = requireApi("./dist/finance/escrow.service.js");
const { OrderWorkflowService } = requireApi(
  "./dist/orders/domain/order-workflow.service.js",
);
const { AuthSessionService } = requireApi(
  "./dist/auth/auth-session.service.js",
);
const { PaymentGatewayService } = requireApi(
  "./dist/finance/zarinpal.gateway.js",
);
const { MockPaymentGateway } = requireApi("./dist/finance/payment-gateway.js");
const line = readFileSync(join(apiRoot, ".env"), "utf8")
  .split(/\r?\n/)
  .find((v) => /^\s*DATABASE_URL=/.test(v));
const configured = new URL(
  process.env.DATABASE_URL?.trim() ||
    line
      ?.slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2"),
);
assert.match(configured.protocol, /^postgres(?:ql)?:$/);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname),
  "LOCAL ONLY",
);
const sourceName = decodeURIComponent(configured.pathname.slice(1));
const name = `niazat_zeus_z1_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
const validateName = () => {
  assert.match(name, /^niazat_zeus_z1_\d+_[a-f0-9]{8}$/);
  assert.notEqual(name, sourceName);
};
validateName();
const maintenance = new URL(configured);
maintenance.pathname = "/postgres";
const isolated = new URL(configured);
isolated.pathname = `/${name}`;
const control = new PrismaClient({
  datasources: { db: { url: maintenance.toString() } },
});
let created = false,
  db,
  httpApp;
const passed = [];
const redact = (value) =>
  String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "<database URL>");
const key = () => randomUUID();
const rejectsStatus = (work, status) =>
  assert.rejects(work, (error) => error.getStatus?.() === status);

async function run() {
  try {
    await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    const migration = spawnSync(
      process.execPath,
      [
        join(apiRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: isolated.toString() },
        encoding: "utf8",
        windowsHide: true,
        timeout: 60_000,
      },
    );
    assert.equal(
      migration.status,
      0,
      redact(`${migration.stdout}\n${migration.stderr}`),
    );
    db = new PrismaClient({
      datasources: { db: { url: isolated.toString() } },
    });
    assert.equal(
      (await db.$queryRaw`SELECT current_database() AS name`)[0].name,
      name,
    );
    const migrateAgain = spawnSync(
      process.execPath,
      [
        join(apiRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: isolated.toString() },
        encoding: "utf8",
        windowsHide: true,
        timeout: 60_000,
      },
    );
    assert.equal(migrateAgain.status, 0, redact(migrateAgain.stderr));
    passed.push("additive_migration_and_redeploy");
    const config = new ConfigService({
      NODE_ENV: "test",
      ZEUS_WALLET_ENABLED: true,
      PAYMENT_GATEWAY_DRIVER: "mock",
      WEB_URL: "http://localhost:3002",
    });
    const ledger = new LedgerService(db),
      idempotency = new IdempotencyService(db);
    const gateway = new PaymentGatewayService(
      config,
      new MockPaymentGateway(config),
    );
    const wallets = new WalletPaymentsService(
      db,
      ledger,
      idempotency,
      gateway,
      config,
    );
    const payments = new PaymentsService(db, ledger, gateway, idempotency);
    const escrow = new EscrowService(db, ledger, idempotency);
    const workflow = new OrderWorkflowService(db);
    let phone = 9100100000;
    const user = (role = "customer", adminScope = null) =>
      db.user.create({
        data: {
          phone: String(++phone),
          fullName: "ISOLATED Z1 fixture",
          role,
          adminScope,
          status: "active",
        },
      });
    const owner = await user(),
      other = await user(),
      finance = await user("admin", "finance_admin");
    const service = await db.serviceLine.create({
      data: {
        slug: `isolated-${key()}`,
        title: "Fixture",
        category: "fixture",
        description: "No production data",
      },
    });
    const order = (
      userId = owner.id,
      amount = 100,
      status = "pending_payment",
    ) =>
      db.order.create({
        data: {
          code: `TEST-${key()}`,
          customerId: userId,
          serviceId: service.id,
          title: "Isolated only",
          briefDescription: "fixture",
          finalPrice: amount,
          status,
        },
      });
    for (const accountType of [
      "payment_gateway_clearing",
      "platform_escrow",
      "platform_commission",
    ])
      await db.ledgerAccount.create({ data: { accountType } });
    const balance = async (id) =>
      (await ledger.verifyWalletConsistency(id)).walletBalance;
    const fundingKey = key(),
      start = await wallets.initiate(owner.id, 1000, fundingKey);
    assert.equal(
      new URL(start.redirectUrl).searchParams.get("topUpId"),
      start.id,
    );
    assert.deepEqual(await wallets.initiate(owner.id, 1000, fundingKey), start);
    await rejectsStatus(
      () => wallets.initiate(owner.id, 1001, fundingKey),
      409,
    );
    await rejectsStatus(() => wallets.verify(other.id, start.id, key()), 404);
    assert.equal(await balance(owner.id), 0);
    passed.push("owned_topup_intent_payload_replay_and_callback");
    const verifyKey = key();
    await wallets.verify(owner.id, start.id, verifyKey);
    await wallets.verify(owner.id, start.id, verifyKey);
    await wallets.verify(owner.id, start.id, key());
    assert.equal(await balance(owner.id), 1000);
    assert.equal(
      await db.ledgerEntry.count({ where: { referenceId: start.id } }),
      1,
    );
    assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
    assert.equal((await wallets.list(other.id)).length, 0);
    passed.push("topup_ledger_projection_exactly_once_and_private_list");
    const paidOrder = await order();
    await rejectsStatus(
      () => wallets.payOrder(other.id, paidOrder.id, key()),
      404,
    );
    const payKey = key(),
      paid = await wallets.payOrder(owner.id, paidOrder.id, payKey);
    await wallets.payOrder(owner.id, paidOrder.id, payKey);
    await rejectsStatus(
      () => wallets.payOrder(owner.id, paidOrder.id, key()),
      400,
    );
    assert.equal(await balance(owner.id), 900);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: paidOrder.id } }))
        .status,
      "paid",
    );
    assert.equal(
      await db.payment.count({ where: { orderId: paidOrder.id } }),
      1,
    );
    assert.equal(
      await db.invoice.count({ where: { orderId: paidOrder.id } }),
      1,
    );
    assert.equal(
      await db.orderStatusHistory.count({
        where: {
          orderId: paidOrder.id,
          financialEffectType: "wallet_to_escrow",
        },
      }),
      1,
    );
    assert.equal(paid.escrow.amount, 100);
    passed.push("wallet_order_escrow_invoice_history_owner_replay");
    const refundKey = key(),
      refundRequest = {
        orderId: paidOrder.id,
        amount: 40,
        reason: "isolated acceptance",
        note: "Explicit finance fixture",
        decidedByUserId: finance.id,
        idempotencyKey: refundKey,
      };
    await escrow.refund(refundRequest);
    await escrow.refund(refundRequest);
    assert.equal(await balance(owner.id), 940);
    assert.equal(
      (await db.escrowHold.findUniqueOrThrow({ where: { id: paid.escrow.id } }))
        .refundedAmount,
      40,
    );
    assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
    passed.push("existing_partial_refund_ledger_cache_and_replay_compatible");
    const phaseOwner = await user();
    const phaseFunding = await wallets.initiate(phaseOwner.id, 120, key());
    await Promise.all([
      wallets.verify(phaseOwner.id, phaseFunding.id, key()),
      wallets.verify(phaseOwner.id, phaseFunding.id, key()),
    ]);
    assert.equal(await balance(phaseOwner.id), 120);
    assert.equal(
      await db.ledgerEntry.count({ where: { referenceId: phaseFunding.id } }),
      1,
    );
    const phased = await order(phaseOwner.id, 100);
    const m1 = await db.orderMilestone.create({
      data: { orderId: phased.id, sequence: 1, title: "Phase one", amount: 40 },
    });
    const m2 = await db.orderMilestone.create({
      data: { orderId: phased.id, sequence: 2, title: "Phase two", amount: 60 },
    });
    await rejectsStatus(
      () => wallets.payOrder(phaseOwner.id, phased.id, key()),
      400,
    );
    await rejectsStatus(
      () =>
        payments.initiatePayment({
          orderId: phased.id,
          customerId: phaseOwner.id,
          amount: 100,
          idempotencyKey: key(),
        }),
      409,
    );
    await wallets.payOrder(phaseOwner.id, phased.id, key(), m1.id);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: phased.id } })).status,
      "pending_payment",
    );
    assert.equal(await db.invoice.count({ where: { orderId: phased.id } }), 0);
    await wallets.payOrder(phaseOwner.id, phased.id, key(), m2.id);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: phased.id } })).status,
      "paid",
    );
    assert.equal(await db.invoice.count({ where: { orderId: phased.id } }), 1);
    assert.equal(await balance(phaseOwner.id), 20);
    const malformed = await order(phaseOwner.id, 10);
    const badMilestone = await db.orderMilestone.create({
      data: {
        orderId: malformed.id,
        sequence: 1,
        title: "Mismatch",
        amount: 5,
      },
    });
    await rejectsStatus(
      () =>
        wallets.payOrder(phaseOwner.id, malformed.id, key(), badMilestone.id),
      409,
    );
    await rejectsStatus(
      () =>
        payments.initiatePayment({
          orderId: malformed.id,
          customerId: phaseOwner.id,
          amount: 5,
          milestoneId: badMilestone.id,
          idempotencyKey: key(),
        }),
      409,
    );
    const otherCurrency = await order(phaseOwner.id, 10);
    await db.order.update({
      where: { id: otherCurrency.id },
      data: { currency: "USD" },
    });
    await rejectsStatus(
      () => wallets.payOrder(phaseOwner.id, otherCurrency.id, key()),
      400,
    );
    await rejectsStatus(
      () =>
        payments.initiatePayment({
          orderId: otherCurrency.id,
          customerId: phaseOwner.id,
          amount: 10,
          idempotencyKey: key(),
        }),
      400,
    );
    passed.push(
      "concurrent_topup_milestone_totals_partial_invoice_and_currency_guards",
    );
    const expensive = await order(owner.id, 1000);
    await rejectsStatus(
      () => wallets.payOrder(owner.id, expensive.id, key()),
      400,
    );
    assert.equal(
      await db.payment.count({ where: { orderId: expensive.id } }),
      0,
    );
    const [raceA, raceB] = await Promise.all([
      order(owner.id, 700),
      order(owner.id, 700),
    ]);
    const race = await Promise.allSettled([
      wallets.payOrder(owner.id, raceA.id, key()),
      wallets.payOrder(owner.id, raceB.id, key()),
    ]);
    assert.equal(
      race.filter((r) => r.status === "fulfilled").length,
      1,
      race
        .map((r) =>
          r.status === "rejected" ? redact(r.reason.stack) : "fulfilled",
        )
        .join("\n"),
    );
    assert.equal(
      race.filter(
        (r) =>
          r.status === "rejected" &&
          [400, 409].includes(r.reason.getStatus?.()),
      ).length,
      1,
      race
        .map((r) =>
          r.status === "rejected" ? redact(r.reason.stack) : "fulfilled",
        )
        .join("\n"),
    );
    assert.equal(await balance(owner.id), 240);
    assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
    passed.push(
      "insufficient_balance_and_concurrent_last_funds_no_double_spend",
    );
    // This trigger deliberately fails AFTER ledger projection: all mutations must roll back.
    const abort = await order(owner.id, 50);
    const tables = [
      "ledgerEntry",
      "wallet",
      "walletTransaction",
      "payment",
      "escrowHold",
      "invoice",
      "orderStatusHistory",
      "auditLog",
      "outboxEvent",
      "idempotencyKey",
    ];
    const snapshot = () =>
      Promise.all(
        tables.map((t) => db[t].findMany({ orderBy: { id: "asc" } })),
      ).then(JSON.stringify);
    const beforeAbort = await snapshot();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION z1_abort_wallet_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'payment.succeeded' THEN RAISE EXCEPTION 'isolated forced outbox failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      "CREATE TRIGGER z1_abort_wallet_event BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION z1_abort_wallet_event()",
    );
    await assert.rejects(
      () => wallets.payOrder(owner.id, abort.id, key()),
      /isolated forced outbox failure/,
    );
    assert.equal(await snapshot(), beforeAbort);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: abort.id } })).status,
      "pending_payment",
    );
    await db.$executeRawUnsafe(
      "DROP TRIGGER z1_abort_wallet_event ON outbox_events",
    );
    await db.$executeRawUnsafe("DROP FUNCTION z1_abort_wallet_event()");
    passed.push(
      "atomic_rollback_ledger_projection_order_audit_outbox_idempotency",
    );
    const pendingOrder = await order(owner.id, 50);
    const inFlight = await payments.initiatePayment({
      orderId: pendingOrder.id,
      customerId: owner.id,
      amount: 50,
      idempotencyKey: key(),
    });
    await rejectsStatus(
      () => wallets.payOrder(owner.id, pendingOrder.id, key()),
      409,
    );
    await workflow.transition(
      pendingOrder.id,
      "cancelled",
      "customer",
      owner.id,
      "cancel before payment",
    );
    const beforeLate = await db.ledgerEntry.count();
    const late = await payments.verifyAndSettlePayment({
      paymentId: inFlight.payment.id,
      orderId: pendingOrder.id,
      customerId: owner.id,
      idempotencyKey: key(),
    });
    assert.equal(late.requiresFinancialReview, true);
    assert.equal(await db.ledgerEntry.count(), beforeLate);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: pendingOrder.id } }))
        .status,
      "cancelled",
    );
    assert.equal(
      await db.escrowHold.count({ where: { orderId: pendingOrder.id } }),
      0,
    );
    assert.equal(
      await db.auditLog.count({
        where: {
          action: "payment.review_required",
          entityId: inFlight.payment.id,
        },
      }),
      1,
    );
    passed.push(
      "payment_rail_conflict_and_late_verification_never_revives_order",
    );
    const transitionOrder = await order(owner.id, 50, "draft");
    for (const field of ["id", "customerId", "status", "version"])
      await rejectsStatus(
        () =>
          workflow.transition(
            transitionOrder.id,
            "submitted",
            "customer",
            owner.id,
            "fixture",
            { [field]: field === "version" ? 0 : "override" },
          ),
        400,
      );
    await rejectsStatus(
      () =>
        workflow.transition(transitionOrder.id, "submitted", "customer", null),
      400,
    );
    await workflow.transition(
      transitionOrder.id,
      "submitted",
      "customer",
      owner.id,
      "approved command",
    );
    assert.equal(
      await db.auditLog.count({
        where: {
          action: "order.status.transitioned",
          entityId: transitionOrder.id,
        },
      }),
      1,
    );
    passed.push("workflow_protected_fields_actor_and_atomic_audit");
    const expiresAt = new Date(Date.now() + 60000);
    const session = await db.session.create({
      data: {
        userId: owner.id,
        familyId: key(),
        refreshTokenHash: "fixture-only",
        expiresAt,
      },
    });
    const foreign = await db.session.create({
      data: {
        userId: other.id,
        familyId: key(),
        refreshTokenHash: "fixture-other",
        expiresAt,
      },
    });
    await new AuthSessionService(db, {}).logout(
      owner.id,
      undefined,
      session.id,
    );
    assert(
      (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
        .revokedAt,
    );
    assert.equal(
      (await db.session.findUniqueOrThrow({ where: { id: foreign.id } }))
        .revokedAt,
      null,
    );
    passed.push("bearer_only_logout_revokes_owned_session_not_foreign");
    await assert.rejects(() =>
      db.walletFundingIntent.create({
        data: {
          userId: owner.id,
          amount: -1,
          gateway: "mock",
          idempotencyKey: key(),
        },
      }),
    );
    await assert.rejects(() =>
      db.publicServiceReview.create({
        data: { orderId: paidOrder.id, customerId: owner.id, rating: 6 },
      }),
    );
    await assert.rejects(() =>
      db.publicServiceReview.create({
        data: {
          orderId: paidOrder.id,
          customerId: owner.id,
          rating: 5,
          publishedAt: new Date(),
        },
      }),
    );
    await assert.rejects(() =>
      db.orderContractSnapshot.create({ data: { orderId: key() } }),
    );
    const unknown = await db.orderContractSnapshot.create({
      data: { orderId: paidOrder.id },
    });
    assert.equal(unknown.deadlineEffective, null);
    assert.equal(unknown.basePrice, null);
    assert.equal(await db.userLoginState.count(), 0);
    assert.equal(await db.ticketSlaPolicySnapshot.count(), 0);
    passed.push(
      "new_constraints_foreign_keys_and_unknown_history_not_fabricated",
    );
    // A disabled new feature performs no additive-table access after code rollback.
    const disabled = new WalletPaymentsService(
      db,
      ledger,
      idempotency,
      gateway,
      new ConfigService({}),
    );
    assert.throws(
      () => disabled.list(owner.id),
      (e) => e.getStatus?.() === 503,
    );
    assert.equal(await balance(owner.id), 240);
    const journal = await db.ledgerEntry.findMany();
    assert(
      journal.every(
        (e) => e.amount > 0 && e.debitAccountId !== e.creditAccountId,
      ),
    );
    passed.push(
      "disabled_rollback_retains_financial_data_no_destructive_migration",
    );
    const { Test } = requireApi("@nestjs/testing");
    const { Reflector } = requireApi("@nestjs/core");
    const { ValidationPipe } = requireApi("@nestjs/common");
    const { JwtService } = requireApi("@nestjs/jwt");
    const { AuthTokenService } = requireApi(
      "./dist/auth/auth-token.service.js",
    );
    const { JwtStrategy } = requireApi(
      "./dist/auth/strategies/jwt.strategy.js",
    );
    const { JwtAuthGuard } = requireApi(
      "./dist/common/guards/jwt-auth.guard.js",
    );
    const { RolesGuard } = requireApi("./dist/common/guards/roles.guard.js");
    const { RateLimitGuard } = requireApi(
      "./dist/common/guards/rate-limit.guard.js",
    );
    const { WalletPaymentsController } = requireApi(
      "./dist/finance/wallet-payments.controller.js",
    );
    const { AuthController } = requireApi("./dist/auth/auth.controller.js");
    const { AuthService } = requireApi("./dist/auth/auth.service.js");
    const deliveredCodes = new Map();
    config.set("JWT_ACCESS_SECRET", key() + key()); // New fixture-only key, never a main secret.
    const sessions = new AuthSessionService(
      db,
      new AuthTokenService(new JwtService(), config),
    );
    const strategy = new JwtStrategy(config, sessions);
    const auth = new AuthService(
      db,
      config,
      {
        sendOtp: async (phone, code) => {
          deliveredCodes.set(phone, code);
        },
      },
      sessions,
    );
    const module = await Test.createTestingModule({
      controllers: [WalletPaymentsController, AuthController],
      providers: [
        RolesGuard,
        { provide: WalletPaymentsService, useValue: wallets },
        { provide: JwtStrategy, useValue: strategy },
        { provide: AuthService, useValue: auth },
        { provide: AuthSessionService, useValue: sessions },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    httpApp = module.createNestApplication({ logger: false });
    const reflector = new Reflector();
    httpApp.useGlobalGuards(
      new JwtAuthGuard(reflector),
      new RateLimitGuard(reflector),
    );
    httpApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await httpApp.listen(0, "127.0.0.1");
    const httpBase = await httpApp.getUrl();
    const request = (method, path, token, body, idempotencyKey) =>
      fetch(`${httpBase}/v1/customer/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const signed = await sessions.issue(owner),
      otherSigned = await sessions.issue(other);
    const token = signed.accessToken;
    assert.equal((await request("GET", "wallet/top-ups")).status, 401);
    assert.equal(
      (await request("GET", "wallet/top-ups", "invalid-fixture-token")).status,
      401,
    );
    for (const actor of [
      finance,
      await user("support"),
      await user("executor"),
    ]) {
      const issued = await sessions.issue(actor);
      assert.equal(
        (await request("GET", "wallet/top-ups", issued.accessToken)).status,
        403,
      );
      if (actor.role === "executor") {
        await db.userCapability.create({
          data: { userId: actor.id, capability: "customer" },
        });
        assert.equal(
          (await request("GET", "wallet/top-ups", issued.accessToken)).status,
          200,
        );
      }
    }
    passed.push("http_real_jwt_session_role_matrix_and_dual_capability");
    assert.equal(
      (
        await request(
          "POST",
          "wallet/top-ups",
          token,
          { amount: 10, customerId: other.id },
          key(),
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("POST", "wallet/top-ups", token, { amount: 10 })).status,
      400,
    );
    assert.equal(
      (await request("POST", "wallet/top-ups", token, { amount: 1.5 }, key()))
        .status,
      400,
    );
    const httpKey = key();
    const initiatedResponse = await request(
      "POST",
      "wallet/top-ups",
      token,
      { amount: 20 },
      httpKey,
    );
    assert.equal(initiatedResponse.status, 201);
    const httpIntent = await initiatedResponse.json();
    const repeatedResponse = await request(
      "POST",
      "wallet/top-ups",
      token,
      { amount: 20 },
      httpKey,
    );
    assert.equal(repeatedResponse.status, 201);
    assert.equal((await repeatedResponse.json()).id, httpIntent.id);
    assert.equal(
      (await request("POST", "wallet/top-ups", token, { amount: 21 }, httpKey))
        .status,
      409,
    );
    assert.equal(
      (
        await request(
          "POST",
          `wallet/top-ups/${httpIntent.id}/verify`,
          otherSigned.accessToken,
          {},
          key(),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "POST",
          `wallet/top-ups/${httpIntent.id}/verify`,
          token,
          {},
          key(),
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          "POST",
          `wallet/top-ups/${httpIntent.id}/verify`,
          token,
          {},
          key(),
        )
      ).status,
      201,
    );
    const ownList = await (
      await request("GET", "wallet/top-ups", token)
    ).json();
    const otherList = await (
      await request("GET", "wallet/top-ups", otherSigned.accessToken)
    ).json();
    assert(ownList.some((item) => item.id === httpIntent.id));
    assert(!otherList.some((item) => item.id === httpIntent.id));
    assert(
      ownList.every(
        (item) =>
          !Object.hasOwn(item, "gatewayRef") &&
          !Object.hasOwn(item, "idempotencyKey"),
      ),
    );
    assert.equal(await balance(owner.id), 260);
    passed.push("http_topup_dto_idempotency_owner_verification_private_dto");
    const httpOrder = await order(owner.id, 10),
      httpPayKey = key();
    assert.equal(
      (
        await request(
          "POST",
          `orders/${httpOrder.id}/pay-from-wallet`,
          otherSigned.accessToken,
          {},
          key(),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "POST",
          `orders/${httpOrder.id}/pay-from-wallet`,
          token,
          { amount: 1 },
          key(),
        )
      ).status,
      400,
    );
    const httpPayment = await request(
      "POST",
      `orders/${httpOrder.id}/pay-from-wallet`,
      token,
      {},
      httpPayKey,
    );
    assert.equal(httpPayment.status, 201);
    assert.equal(
      (
        await request(
          "POST",
          `orders/${httpOrder.id}/pay-from-wallet`,
          token,
          {},
          httpPayKey,
        )
      ).status,
      201,
    );
    assert.equal(await balance(owner.id), 250);
    assert.equal(
      await db.payment.count({ where: { orderId: httpOrder.id } }),
      1,
    );
    assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
    passed.push("http_wallet_payment_owner_server_amount_and_replay");
    const limitedUser = await user(),
      limited = await sessions.issue(limitedUser);
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await request(
            "POST",
            "wallet/top-ups",
            limited.accessToken,
            { amount: 0 },
            key(),
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await request(
          "POST",
          "wallet/top-ups",
          limited.accessToken,
          { amount: 0 },
          key(),
        )
      ).status,
      429,
    );
    assert.equal(
      await db.walletFundingIntent.count({ where: { userId: limitedUser.id } }),
      0,
    );
    await sessions.logout(owner.id, signed.refreshToken);
    assert.equal((await request("GET", "wallet/top-ups", token)).status, 401);
    passed.push("http_rate_limit_and_revoked_session_rejected_without_write");

    // Additional Z1.2 acceptance; original wallet/HTTP scenarios above remain.
    const proofCandidate = await order(owner.id, 50);
    await rejectsStatus(
      () => workflow.transition(proofCandidate.id, "paid", "system", null),
      400,
    );
    await rejectsStatus(
      () =>
        workflow.transition(
          proofCandidate.id,
          "paid",
          "system",
          null,
          "forged proof",
          {},
          undefined,
          {
            type: "wallet_to_escrow",
            amount: 50,
            context: { paymentId: paid.payment.id, escrowId: paid.escrow.id },
          },
        ),
      409,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: proofCandidate.id } }))
        .status,
      "pending_payment",
    );
    await rejectsStatus(
      () =>
        escrow.release({
          orderId: paidOrder.id,
          decidedByUserId: finance.id,
          note: "Cannot release before acceptance",
          idempotencyKey: key(),
        }),
      400,
    );
    const refundBeforeExpiry = await db.escrowHold.findUniqueOrThrow({
      where: { id: paid.escrow.id },
    });
    await db.idempotencyKey.deleteMany({
      where: { scope: `escrow.refund:${paidOrder.id}`, key: refundKey },
    }); // Isolated expired-cache fixture only.
    await rejectsStatus(() => escrow.refund(refundRequest), 409);
    assert.deepEqual(
      await db.escrowHold.findUniqueOrThrow({ where: { id: paid.escrow.id } }),
      refundBeforeExpiry,
    );
    assert.equal(
      await db.refund.count({ where: { orderId: paidOrder.id } }),
      1,
    );
    passed.push(
      "common_paid_proof_early_release_and_durable_refund_replay_guard",
    );

    const { OrdersService } = requireApi("./dist/orders/orders.service.js");
    const { AuditService } = requireApi("./dist/audit/audit.service.js");
    const serviceOrders = new OrdersService(
      db,
      payments,
      escrow,
      {},
      new AuditService(db),
      idempotency,
      workflow,
      {},
      {},
      {},
      {},
      config,
    );
    config.set("AUTO_CONFIRM_DAYS", "7");
    const extraFunding = await wallets.initiate(owner.id, 1000, key());
    await wallets.verify(owner.id, extraFunding.id, key());
    const executor = await user("executor");
    const profile = await db.executorProfile.create({
      data: {
        userId: executor.id,
        publicHandlerCode: "Z1-TEST",
        displayAlias: "Isolated executor",
      },
    });
    const makeDelivered = async (phased = false, old = true) => {
      const fixture = await order(owner.id, 100);
      if (phased) {
        for (const [sequence, amount] of [
          [1, 40],
          [2, 60],
        ]) {
          await db.orderMilestone.create({
            data: {
              orderId: fixture.id,
              sequence,
              title: `Stage ${sequence}`,
              amount,
            },
          });
        }
        for (const m of await db.orderMilestone.findMany({
          where: { orderId: fixture.id },
        }))
          await wallets.payOrder(owner.id, fixture.id, key(), m.id);
      } else await wallets.payOrder(owner.id, fixture.id, key());
      await db.orderAssignment.create({
        data: {
          orderId: fixture.id,
          executorProfileId: profile.id,
          assignedByUserId: finance.id,
        },
      });
      // Explicit test-only delivery fixture; not a claim of QC/browser coverage.
      await db.order.update({
        where: { id: fixture.id },
        data: {
          status: "delivered",
          deliveredAt: new Date(Date.now() - (old ? 8 : 1) * 86400000),
        },
      });
      return fixture;
    };
    const auto = await makeDelivered();
    const autoKey = key();
    await serviceOrders.confirmAutomatically(auto.id, autoKey);
    await serviceOrders.confirmAutomatically(auto.id, autoKey);
    const autoHistory = await db.orderStatusHistory.findMany({
      where: { orderId: auto.id, toStatus: { in: ["confirmed", "closed"] } },
    });
    assert.equal(autoHistory.length, 2);
    assert(
      autoHistory.every((h) => h.source === "system" && h.actorUserId === null),
    );
    const autoAudit = await db.auditLog.findFirst({
      where: { entityId: auto.id, action: "escrow.release" },
    });
    assert.equal(autoAudit.actorUserId, null);
    assert.equal(autoAudit.actorRole, null);
    const autoHold = await db.escrowHold.findFirst({
      where: { orderId: auto.id },
    });
    const autoEntries = await db.ledgerEntry.findMany({
      where: { referenceId: autoHold.id },
    });
    assert.equal(autoEntries.length, 2);
    assert(autoEntries.every((e) => e.createdByUserId === null));
    passed.push(
      "automatic_confirmation_system_actor_null_and_idempotent_settlement",
    );
    const early = await makeDelivered(false, false);
    await rejectsStatus(
      () => serviceOrders.confirmAutomatically(early.id, key()),
      400,
    );
    await db.order.update({
      where: { id: early.id },
      data: { deliveredAt: new Date(Date.now() - 8 * 86400000) },
    });
    await db.dispute.create({
      data: {
        orderId: early.id,
        raisedByUserId: owner.id,
        reason: "fixture",
        note: "Open dispute must block automation",
      },
    });
    await rejectsStatus(
      () => serviceOrders.confirmAutomatically(early.id, key()),
      400,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: early.id } })).status,
      "delivered",
    );
    assert.equal(
      (await db.escrowHold.findFirst({ where: { orderId: early.id } }))
        .releasedAmount,
      0,
    );
    passed.push(
      "auto_confirm_rechecks_cutoff_and_open_dispute_inside_transaction",
    );
    const raceConfirm = await makeDelivered();
    const confirmations = await Promise.allSettled([
      serviceOrders.confirmAutomatically(raceConfirm.id, key()),
      serviceOrders.confirm(owner.id, raceConfirm.id, key()),
    ]);
    assert.equal(
      confirmations.filter((r) => r.status === "fulfilled").length,
      1,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: raceConfirm.id } }))
        .status,
      "closed",
    );
    assert.equal(
      await db.orderStatusHistory.count({
        where: { orderId: raceConfirm.id, toStatus: "confirmed" },
      }),
      1,
    );
    assert.equal(
      (await db.escrowHold.findFirst({ where: { orderId: raceConfirm.id } }))
        .releasedAmount,
      100,
    );
    const staged = await makeDelivered(true);
    await serviceOrders.confirm(owner.id, staged.id, key());
    const stagedHolds = await db.escrowHold.findMany({
      where: { orderId: staged.id },
    });
    assert.equal(stagedHolds.length, 2);
    assert(stagedHolds.every((h) => h.amount === h.releasedAmount));
    assert((await ledger.verifyWalletConsistency(executor.id)).consistent);
    passed.push(
      "manual_auto_confirm_race_and_all_milestone_escrows_released_once",
    );
    const ops = await user("admin", "ops_admin");
    const cancelStaged = await makeDelivered(true);
    await db.order.update({
      where: { id: cancelStaged.id },
      data: { status: "paid" },
    });
    await serviceOrders.cancelByAdmin(
      ops.id,
      cancelStaged.id,
      "Full staged cancellation",
      key(),
    );
    const cancelledHolds = await db.escrowHold.findMany({
      where: { orderId: cancelStaged.id },
    });
    assert.equal(
      cancelledHolds.reduce((s, h) => s + h.refundedAmount, 0),
      100,
    );
    assert(
      cancelledHolds.every(
        (h) => h.releasedAmount + h.refundedAmount === h.amount,
      ),
    );
    const disputeStaged = await makeDelivered(true);
    await db.order.update({
      where: { id: disputeStaged.id },
      data: { status: "disputed" },
    });
    await db.dispute.create({
      data: {
        orderId: disputeStaged.id,
        raisedByUserId: owner.id,
        reason: "fixture",
        note: "Full staged refund fixture",
      },
    });
    await serviceOrders.resolveDispute(
      ops.id,
      disputeStaged.id,
      { resolutionType: "refund_full", note: "Return every staged escrow" },
      key(),
    );
    const disputedHolds = await db.escrowHold.findMany({
      where: { orderId: disputeStaged.id },
    });
    assert.equal(
      disputedHolds.reduce((s, h) => s + h.refundedAmount, 0),
      100,
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: disputeStaged.id } }))
        .status,
      "cancelled",
    );
    assert((await ledger.verifyWalletConsistency(owner.id)).consistent);
    passed.push("full_cancel_and_dispute_refund_cover_every_milestone_escrow");
    const gatewayOrder = await order(owner.id, 50);
    const gatewayIntent = await payments.initiatePayment({
      orderId: gatewayOrder.id,
      customerId: owner.id,
      amount: 50,
      idempotencyKey: key(),
    });
    await payments.verifyAndSettlePayment({
      paymentId: gatewayIntent.payment.id,
      orderId: gatewayOrder.id,
      customerId: owner.id,
      idempotencyKey: key(),
    });
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: gatewayOrder.id } }))
        .status,
      "paid",
    );
    assert.equal(
      await db.auditLog.count({
        where: {
          entityId: gatewayOrder.id,
          action: "order.status.transitioned",
        },
      }),
      1,
    );
    passed.push(
      "gateway_payment_uses_same_verified_transition_and_audit_as_wallet",
    );
    const authRequest = async (path, body, bearer) => {
      const response = await fetch(`${httpBase}/v1/auth/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    const signup = {
      phone: "09120006001",
      fullName: "Verified owner",
      password: "Owner-Strong123!",
    };
    const firstSignup = await authRequest("register", signup);
    assert.equal(firstSignup.status, 201);
    assert(
      !Object.hasOwn(firstSignup.body, "devOtp"),
      "No OTP disclosure in test/production responses",
    );
    const pendingIdentity = await db.user.findUniqueOrThrow({
      where: { phone: signup.phone },
    });
    assert.equal(pendingIdentity.passwordHash, null);
    const attacker = await authRequest("register", {
      ...signup,
      fullName: "Attacker name",
      password: "Attacker-Strong123!",
    });
    assert.equal(attacker.status, 201);
    assert.deepEqual(
      await db.user.findUniqueOrThrow({ where: { phone: signup.phone } }),
      pendingIdentity,
      "Anonymous re-registration must preserve user bytes",
    );
    const attackerCode = deliveredCodes.get(signup.phone);
    const originalProof = {
      phone: signup.phone,
      fullName: signup.fullName,
      password: signup.password,
      purpose: "register",
      registrationAttemptId: firstSignup.body.registrationAttemptId,
      code: attackerCode,
    };
    assert.equal((await authRequest("otp/verify", originalProof)).status, 400);
    const { registrationAttemptId: omittedAttempt, ...missingAttempt } =
      originalProof;
    assert(omittedAttempt);
    assert.equal((await authRequest("otp/verify", missingAttempt)).status, 400);
    assert.equal(
      (
        await authRequest("otp/verify", {
          ...originalProof,
          phone: "09120006009",
        })
      ).status,
      400,
    );
    const restarted = await authRequest("register", signup);
    assert.equal(restarted.status, 201);
    const ownerProof = {
      ...originalProof,
      registrationAttemptId: restarted.body.registrationAttemptId,
      code: deliveredCodes.get(signup.phone),
    };
    assert.equal(
      (
        await authRequest("otp/verify", {
          ...ownerProof,
          password: "Attacker-Strong123!",
        })
      ).status,
      400,
    );
    const verified = await authRequest("otp/verify", ownerProof);
    assert.equal(verified.status, 200);
    assert.equal(
      (await authRequest("me", undefined, verified.body.accessToken)).status,
      200,
    );
    const activatedOwner = await db.user.findUniqueOrThrow({
      where: { phone: signup.phone },
    });
    assert.equal(activatedOwner.fullName, signup.fullName);
    assert.equal(activatedOwner.status, "active");
    const bcrypt = requireApi("bcrypt");
    assert(await bcrypt.compare(signup.password, activatedOwner.passwordHash));
    assert(
      !(await bcrypt.compare(
        "Attacker-Strong123!",
        activatedOwner.passwordHash,
      )),
    );
    assert.equal((await authRequest("otp/verify", ownerProof)).status, 400);
    assert.equal(
      (
        await authRequest("login", {
          phone: signup.phone,
          password: signup.password,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await authRequest("login", {
          phone: signup.phone,
          password: "Attacker-Strong123!",
        })
      ).status,
      401,
    );
    assert.equal(
      await db.wallet.count({ where: { userId: activatedOwner.id } }),
      1,
    );
    assert.equal(
      (
        await db.userLoginState.findUniqueOrThrow({
          where: { userId: activatedOwner.id },
        })
      ).lastSuccessfulLoginAt instanceof Date,
      true,
    );
    passed.push(
      "http_registration_proof_binds_request_credentials_and_phone_without_preproof_overwrite",
    );

    const otpOnly = { phone: "09120006002", fullName: "OTP only owner" };
    const otpStart = await authRequest("register", otpOnly);
    assert.equal(otpStart.status, 201);
    assert.equal(
      (
        await authRequest("otp/verify", {
          ...otpOnly,
          purpose: "register",
          registrationAttemptId: otpStart.body.registrationAttemptId,
          code: deliveredCodes.get(otpOnly.phone),
        })
      ).status,
      200,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { phone: otpOnly.phone } }))
        .passwordHash,
      null,
    );
    assert.equal(
      (
        await authRequest("otp/request", {
          phone: otpOnly.phone,
          purpose: "login",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await authRequest("otp/verify", {
          phone: otpOnly.phone,
          purpose: "login",
          code: deliveredCodes.get(otpOnly.phone),
        })
      ).status,
      200,
    );
    assert.equal(
      (await authRequest("password/forgot", { phone: signup.phone })).status,
      200,
    );
    assert.equal(
      (
        await authRequest("password/reset", {
          phone: signup.phone,
          code: deliveredCodes.get(signup.phone),
          password: "Reset-Strong123!",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await authRequest("login", {
          phone: signup.phone,
          password: "Reset-Strong123!",
        })
      ).status,
      200,
    );
    assert.equal(
      (await authRequest("me", undefined, verified.body.accessToken)).status,
      401,
    );
    passed.push("otp_only_password_reset_and_old_session_revocation_preserved");

    const badSignup = {
      phone: "09120006003",
      fullName: "Lockout owner",
      password: "Lockout-Strong123!",
    };
    const badStart = await auth.register(badSignup);
    const goodCode = deliveredCodes.get(badSignup.phone);
    const badProof = {
      ...badSignup,
      purpose: "register",
      registrationAttemptId: badStart.registrationAttemptId,
      code: goodCode === "000000" ? "111111" : "000000",
    };
    for (let i = 0; i < 5; i++)
      await rejectsStatus(() => auth.verifyOtp(badProof), 400);
    await rejectsStatus(
      () => auth.verifyOtp({ ...badProof, code: goodCode }),
      400,
    );
    assert.equal(
      (
        await db.otpCode.findUniqueOrThrow({
          where: { id: badStart.registrationAttemptId },
        })
      ).attempts,
      5,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { phone: badSignup.phone } }))
        .status,
      "pending_verification",
    );
    const concurrentStart = await auth.register({
      phone: "09120006004",
      fullName: "Concurrent owner",
      password: "Concurrent-Strong123!",
    });
    const concurrentProof = {
      phone: "09120006004",
      fullName: "Concurrent owner",
      password: "Concurrent-Strong123!",
      purpose: "register",
      registrationAttemptId: concurrentStart.registrationAttemptId,
      code: deliveredCodes.get("09120006004"),
    };
    const verifyRace = await Promise.allSettled([
      auth.verifyOtp(concurrentProof),
      auth.verifyOtp(concurrentProof),
    ]);
    assert.equal(verifyRace.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      await db.auditLog.count({
        where: {
          action: "auth.registration.verified",
          entityId: concurrentStart.userId,
        },
      }),
      1,
    );
    passed.push(
      "registration_failed_attempts_commit_and_concurrent_activation_is_single",
    );
  } finally {
    if (httpApp) await httpApp.close();
    if (db) await db.$disconnect();
    if (created) {
      validateName();
      assert.equal(decodeURIComponent(isolated.pathname.slice(1)), name);
      await control.$queryRawUnsafe(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        name,
      );
      await control.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    }
    await control.$disconnect();
  }
  console.log(
    JSON.stringify({
      packet:
        "ZEUS-EXEC-009 (includes original ZEUS-EXEC-007 wallet scenarios)",
      postgres: "passed",
      cases: passed,
      temporaryDatabaseRemoved: true,
      mainDatabaseConnected: false,
      liveProvidersUsed: false,
    }),
  );
}
run().catch((error) => {
  console.error(redact(error.stack ?? error.message));
  process.exitCode = 1;
});
