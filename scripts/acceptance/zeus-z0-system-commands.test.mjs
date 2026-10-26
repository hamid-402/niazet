import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { classMethodEvidence } from "./zeus-z0-ticket-commands.mjs";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";
import {
  buildSystemCommandReview,
  checkSystemCommandReview,
} from "./zeus-z0-system-command-review.mjs";
import { methodSurface } from "./zeus-z0-command-surface.mjs";

// Source-method characterization only, never PrismaClient/Nest app/provider/HTTP.
// The in-memory transaction collaborator cannot prove real SQL rollback/races.
// All GAP assertions reproduce current open behavior, never mark a fix done.
const root = new URL("../../", import.meta.url);
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const ts = apiRequire("typescript"),
  prismaEnums = apiRequire("@prisma/client"),
  errors = apiRequire("@nestjs/common");
const read = (file) => readFileSync(new URL(file, root), "utf8");
function evaluate(source, extra = {}) {
  const exports = {};
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  new Function("exports", "require", ...Object.keys(extra), js)(
    exports,
    apiRequire,
    ...Object.values(extra),
  );
  return exports;
}
function constants(file, names, extra = {}) {
  const source = ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => names.includes(declaration.name.getText(source)));
  assert.equal(declarations.length, names.length, `Missing constants: ${file}`);
  return evaluate(
    declarations
      .map((declaration) => `export const ${declaration.getText(source)};`)
      .join("\n"),
    { ...prismaEnums, ...extra },
  );
}
function harness(file, className, methods, dependencies, extra = {}) {
  const text = methods
    .map((name) => classMethodEvidence(read(file), className, name, file).text)
    .join("\n");
  const { Probe } = evaluate(
    `export class Probe {constructor(d){Object.assign(this,d);}\n${text}\n}`,
    { ...prismaEnums, ...errors, ...extra },
  );
  return new Probe(dependencies);
}
const authFile = "apps/api/src/auth/auth.service.ts",
  sessionFile = "apps/api/src/auth/auth-session.service.ts",
  accountFile = "apps/api/src/account/account.service.ts",
  ledgerFile = "apps/api/src/finance/ledger.service.ts";
const refresh = evaluate(read("apps/api/src/auth/refresh-token.ts"));
const review = buildSystemCommandReview();

test("65 remaining contracts account for every route with real local service/DTO/source evidence", () => {
  checkSystemCommandReview(review);
  assert.equal(new Set(review.contracts.map((r) => r.signature)).size, 65);
  assert.equal(review.methods.length, 177);
  assert.equal(review.readSideEffects.length, 16);
  assert(
    review.contracts.every(
      (r) =>
        r.route &&
        r.methodRefs.every((ref) => review.methods.some((m) => m.key === ref)),
    ),
  );
  assert(
    review.findings.every(
      (f) => f.status.startsWith("open-") && !f.runtimeFixed,
    ),
  );
});
for (const [name, mutate] of [
  [
    "phase acceptance",
    (r) => {
      r.phaseAccepted = true;
    },
  ],
  [
    "fake runtime fix",
    (r) => {
      r.findings[0].runtimeFixed = true;
    },
  ],
  [
    "omitted route",
    (r) => {
      r.contracts.pop();
    },
  ],
  [
    "stale source",
    (r) => {
      r.methods[0].hash = "stale";
    },
  ],
])
  test(`system review rejects ${name}`, () => {
    const changed = structuredClone(review);
    mutate(changed);
    assert.throws(() => checkSystemCommandReview(changed, review));
  });
test("local call graph keeps unresolved calls explicit and does not recurse indefinitely", () => {
  const surface = [
    ...methodSurface(
      "apps/api/src/finance/finance.admin.controller.ts",
      "FinanceAdminController",
      "releaseEscrow",
    ).values(),
  ];
  assert(
    surface.some(
      (item) =>
        item.className === "LedgerService" && item.methodName === "postEntry",
    ),
  );
  assert(
    surface.some((item) => item.calls.some((call) => call.target === null)),
  );
  assert.equal(new Set(surface.map((entry) => entry.key)).size, surface.length);
  assert.throws(() => methodSurface(authFile, "AuthService", "not-a-method"));
});

function sessionFixture(options = {}) {
  const token = refresh.createRefreshToken();
  const effects = [],
    queries = [];
  const session = {
    id: token.sessionId,
    userId: "owner",
    familyId: "family",
    refreshTokenHash: token.tokenHash,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60000),
    user: { id: "owner", status: "active", role: "customer", capabilities: [] },
    ...options.session,
  };
  const prisma = {
    session: {
      findUnique: async (args) => {
        queries.push(args);
        return options.missing ? null : session;
      },
      findFirst: async (args) => {
        queries.push(args);
        return options.missing ? null : session;
      },
      updateMany: async (args) => {
        effects.push(["updateMany", args]);
        return { count: options.count ?? 1 };
      },
      update: async (args) => {
        effects.push(["update", args]);
        return args.data;
      },
      create: async (args) => {
        effects.push(["create", args]);
        return args.data;
      },
    },
  };
  prisma.$transaction = async (work, config) => {
    effects.push(["transaction-options", config]);
    return work(prisma);
  };
  const service = harness(
    sessionFile,
    "AuthSessionService",
    [
      "logout",
      "refresh",
      "loadSessionUser",
      "assertLoginAllowed",
      "toAuthenticatedUser",
      "revoke",
      "revokeOthers",
    ],
    {
      prisma,
      tokens: {
        refreshExpiry: () => new Date(Date.now() + 60000),
        signAccessToken: async () => "test-access-not-a-real-jwt",
      },
    },
    refresh,
  );
  return { service, token, session, effects, queries };
}
test("real refresh utility hashes opaque secret and refuses tamper/malformed token", () => {
  const a = refresh.createRefreshToken(),
    b = refresh.createRefreshToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.token, a.tokenHash);
  assert.equal(refresh.parseRefreshToken(a.token).sessionId, a.sessionId);
  assert.equal(refresh.refreshTokenMatches(a.token, a.tokenHash), true);
  assert.equal(refresh.refreshTokenMatches(b.token, a.tokenHash), false);
  assert.equal(refresh.parseRefreshToken("not-a-refresh-token"), null);
});
test("session rotation uses Serializable transaction, CAS and replacement in same family", async () => {
  const f = sessionFixture();
  const result = await f.service.refresh(f.token.token);
  assert.equal(f.effects[0][1].isolationLevel, "Serializable");
  const rotation = f.effects.find(([name]) => name === "updateMany")[1];
  assert.deepEqual(rotation.where, { id: f.session.id, revokedAt: null });
  const created = f.effects.find(([name]) => name === "create")[1].data;
  assert.equal(created.familyId, "family");
  assert.equal(created.userId, "owner");
  assert.equal(created.id, rotation.data.replacedById);
  assert.equal(
    refresh.refreshTokenMatches(result.refreshToken, created.refreshTokenHash),
    true,
  );
});
test("revoked refresh replay revokes remaining family and never issues replacement", async () => {
  const f = sessionFixture({ session: { revokedAt: new Date() } });
  await assert.rejects(
    () => f.service.refresh(f.token.token),
    errors.UnauthorizedException,
  );
  assert.deepEqual(f.effects.find(([name]) => name === "updateMany")[1].where, {
    familyId: "family",
    revokedAt: null,
  });
  assert(!f.effects.some(([name]) => name === "create"));
});
test("expired refresh and blocked account cannot rotate", async () => {
  const expired = sessionFixture({ session: { expiresAt: new Date(0) } });
  await assert.rejects(
    () => expired.service.refresh(expired.token.token),
    errors.UnauthorizedException,
  );
  const blocked = sessionFixture({
    session: { user: { id: "owner", status: "blocked" } },
  });
  await assert.rejects(
    () => blocked.service.refresh(blocked.token.token),
    errors.ForbiddenException,
  );
  assert(!blocked.effects.some(([name]) => name === "create"));
});
test("logout with matching cookie revokes own family only", async () => {
  const f = sessionFixture();
  await f.service.logout("owner", f.token.token);
  assert.deepEqual(f.effects[0][1].where, {
    familyId: "family",
    userId: "owner",
    revokedAt: null,
  });
});
test("wrong owner cannot revoke a refresh family", async () => {
  const f = sessionFixture();
  await f.service.logout("other", f.token.token);
  assert.deepEqual(f.effects, []);
});
test("GAP: successful logout without cookie does not revoke the authenticated session", async () => {
  const f = sessionFixture();
  const result = await f.service.logout("owner");
  assert(result.message);
  assert.deepEqual(f.effects, []);
});
test("revoke/revoke-others constrain own user and preserve current id", async () => {
  const f = sessionFixture();
  await f.service.revoke("owner", "selected");
  assert.deepEqual(f.effects[0][1].where, {
    id: "selected",
    userId: "owner",
    revokedAt: null,
  });
  await f.service.revokeOthers("owner", "current");
  assert.deepEqual(f.effects[1][1].where, {
    userId: "owner",
    id: { not: "current" },
    revokedAt: null,
  });
  await assert.rejects(
    () => f.service.revokeOthers("owner"),
    errors.UnauthorizedException,
  );
});
test("foreign/missing selected session returns NotFound without broadened revoke", async () => {
  const f = sessionFixture({ count: 0 });
  await assert.rejects(
    () => f.service.revoke("owner", "foreign"),
    errors.NotFoundException,
  );
  assert.equal(f.effects[0][1].where.userId, "owner");
});
test("authenticated session lookup checks owner, expiry and revokedAt and returns safe user", async () => {
  const f = sessionFixture();
  const user = await f.service.loadSessionUser("owner", f.session.id);
  assert.equal(f.queries[0].where.userId, "owner");
  assert.equal(f.queries[0].where.revokedAt, null);
  assert(f.queries[0].where.expiresAt.gt instanceof Date);
  assert(!Object.hasOwn(user, "refreshTokenHash"));
});
test("cookie is HttpOnly, strict same-site and production secure with exact auth path", () => {
  const cookies = [];
  const controller = harness(
    "apps/api/src/auth/auth.controller.ts",
    "AuthController",
    ["setRefreshCookie"],
    {
      config: {
        get: (name) =>
          ({ NODE_ENV: "production", REFRESH_TOKEN_TTL_DAYS: 30 })[name],
      },
    },
  );
  controller.setRefreshCookie(
    { cookie: (...args) => cookies.push(args) },
    "ephemeral-fixture",
  );
  assert.deepEqual(cookies[0][2], {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/v1/auth",
    maxAge: 30 * 86400000,
  });
});

test("GAP: pending registration can overwrite staged credentials before ownership proof", async () => {
  const effects = [];
  const service = harness(
    authFile,
    "AuthService",
    ["register"],
    {
      prisma: {
        user: {
          findUnique: async () => ({
            id: "pending",
            status: "pending_verification",
          }),
          update: async (args) => {
            effects.push(args);
            return { id: "pending", phone: "09120000000" };
          },
        },
      },
      requestOtp: async () => {
        throw new Error("SMS unavailable");
      },
    },
    { bcrypt: { hash: async () => "new-test-hash" } },
  );
  await assert.rejects(
    () =>
      service.register({
        phone: "09120000000",
        fullName: "pending name",
        password: "FixtureOnly!123",
      }),
    /SMS unavailable/,
  );
  assert.equal(effects[0].data.passwordHash, "new-test-hash");
});
test("existing verified account registration conflicts and never overwrites credentials", async () => {
  const service = harness(
    authFile,
    "AuthService",
    ["register"],
    { prisma: { user: { findUnique: async () => ({ status: "active" }) } } },
    {
      bcrypt: {
        hash: async () => {
          throw new Error("must not hash");
        },
      },
    },
  );
  await assert.rejects(
    () => service.register({ phone: "09120000000" }),
    errors.ConflictException,
  );
});
test("GAP: failed financial provisioning can leave verified user active and OTP consumed", async () => {
  const effects = [],
    user = { id: "new-user", role: "customer", status: "pending_verification" };
  const service = harness(
    authFile,
    "AuthService",
    ["verifyOtp", "assertLoginAllowed", "ensureFinancialAccounts"],
    {
      findValidOtp: async () => ({ id: "otp" }),
      prisma: {
        otpCode: {
          updateMany: async (args) => {
            effects.push(["consume", args]);
            return { count: 1 };
          },
        },
        user: {
          findUnique: async () => user,
          update: async (args) => {
            Object.assign(user, args.data);
            effects.push(["activate", args]);
            return user;
          },
        },
        ledgerAccount: {
          upsert: async () => {
            throw new Error("ledger unavailable");
          },
        },
      },
      sessions: {
        issue: async () => {
          throw new Error("must not issue");
        },
      },
    },
  );
  await assert.rejects(
    () =>
      service.verifyOtp({
        phone: "09120000000",
        purpose: "register",
        code: "123456",
      }),
    /ledger unavailable/,
  );
  assert.equal(user.status, "active");
  assert.deepEqual(
    effects.map(([name]) => name),
    ["consume", "activate"],
  );
});
test("OTP consume CAS failure prevents activation/session", async () => {
  const service = harness(authFile, "AuthService", ["verifyOtp"], {
    findValidOtp: async () => ({ id: "otp" }),
    prisma: { otpCode: { updateMany: async () => ({ count: 0 }) } },
  });
  await assert.rejects(
    () => service.verifyOtp({ purpose: "register" }),
    errors.BadRequestException,
  );
});
test("actual public OTP DTO rejects password_reset purpose despite internal service union", async () => {
  const { validate } = apiRequire("class-validator"),
    mod = evaluate(read("apps/api/src/auth/dto/otp.dto.ts"));
  for (const Cls of [mod.RequestOtpDto, mod.VerifyOtpDto]) {
    const instance = Object.assign(new Cls(), {
      phone: "09120000000",
      code: "123456",
      purpose: "password_reset",
    });
    assert(
      (await validate(instance)).some((item) => item.property === "purpose"),
    );
  }
});

function accountFixture() {
  const queries = [],
    effects = [];
  const query = (name, value) => async (args) => {
    queries.push([name, args]);
    return value;
  };
  const prisma = {
    user: { findUniqueOrThrow: query("user", { id: "owner" }) },
    order: { findMany: query("orders", []) },
    ticket: { findMany: query("tickets", []) },
    invoice: { findMany: query("invoices", []) },
    notificationLog: { findMany: query("notifications", []) },
    privacyRequest: {
      create: async (args) => {
        effects.push(args);
        return { id: `request-${effects.length}`, ...args.data };
      },
      findFirst: async () => null,
    },
  };
  const service = harness(
    accountFile,
    "AccountService",
    ["exportData", "requestDeletion", "nullable"],
    {
      prisma,
      audit: { record: async (args) => queries.push(["audit", args]) },
    },
    constants(accountFile, ["PROFILE_SELECT"]),
  );
  return { service, queries, effects };
}
test("account export scopes all main queries and filters private ticket/report content", async () => {
  const f = accountFixture();
  await f.service.exportData({ id: "owner", role: "customer" });
  for (const [name, args] of f.queries.filter(([name]) => name !== "audit"))
    assert.equal(
      args.where[
        name === "user"
          ? "id"
          : name === "notifications"
            ? "userId"
            : "customerId"
      ],
      "owner",
    );
  const ticket = f.queries.find(([name]) => name === "tickets")[1];
  assert.deepEqual(ticket.select.messages.where, {
    visibility: "customer_visible",
  });
  const orders = f.queries.find(([name]) => name === "orders")[1];
  assert.deepEqual(orders.select.reports.where, { visibleToCustomer: true });
  assert.equal(f.effects[0].data.status, "completed");
});
test("GAP: export order-file metadata has no visibility/kind predicate", async () => {
  const f = accountFixture();
  await f.service.exportData({ id: "owner", role: "customer" });
  const files = f.queries.find(([name]) => name === "orders")[1].select.files;
  assert.equal(files.where, undefined);
  assert.equal(files.select.originalName, true);
  assert.equal(files.select.fileKind, true);
});
test("deletion request trims reason and never deletes data; GAP competing requests can duplicate", async () => {
  const f = accountFixture();
  await Promise.all([
    f.service.requestDeletion(
      { id: "owner", role: "customer" },
      { reason: "  request  " },
    ),
    f.service.requestDeletion(
      { id: "owner", role: "customer" },
      { reason: "  request  " },
    ),
  ]);
  assert.equal(f.effects.length, 2);
  assert(
    f.effects.every(
      (args) =>
        args.data.reason === "request" &&
        args.data.userId === "owner" &&
        args.data.requestType === "account_deletion",
    ),
  );
});

test("GAP: ledger correction replay ignores original-entry and reason mismatch", async () => {
  const old = { id: "previous-correction", correctionOfId: "original-a" },
    queries = [];
  const service = harness(ledgerFile, "LedgerService", ["postCorrection"], {
    prisma: {
      ledgerEntry: {
        findUnique: async (args) => {
          queries.push(args);
          return old;
        },
      },
    },
  });
  const result = await service.postCorrection({
    originalEntryId: "original-b",
    reason: "different",
    createdByUserId: "admin-b",
    idempotencyKey: "same-key",
  });
  assert.equal(result, old);
  assert.deepEqual(queries, [
    { where: { idempotencyKey: "ledger-correction:same-key" } },
  ]);
});
test("GAP: same original ledger entry can be reversed under two different keys", async () => {
  const entries = [],
    audits = [];
  const original = {
    id: "original",
    debitAccountId: "debit",
    creditAccountId: "credit",
    amount: 500,
    referenceType: "escrow_refund",
    referenceId: "reference",
  };
  const tx = {
    ledgerEntry: { findUnique: async () => original },
    auditLog: { create: async (args) => audits.push(args) },
  };
  const service = harness(ledgerFile, "LedgerService", ["postCorrection"], {
    prisma: {
      ledgerEntry: { findUnique: async () => null },
      $transaction: async (work) => work(tx),
    },
    postEntry: async (entry) => {
      entries.push(entry);
      return { id: `correction-${entries.length}` };
    },
  });
  for (const key of ["first-key", "second-key"])
    await service.postCorrection({
      originalEntryId: "original",
      reason: "reason",
      createdByUserId: "admin",
      idempotencyKey: key,
    });
  assert.equal(entries.length, 2);
  assert(
    entries.every(
      (entry) =>
        entry.correctionOfId === "original" &&
        entry.amount === 500 &&
        entry.debitAccountId === "credit" &&
        entry.creditAccountId === "debit",
    ),
  );
  assert.equal(audits.length, 2);
});
test("GAP: withdrawal approval does not query spendable balance or current Shaba verification", async () => {
  const writes = [],
    withdrawal = {
      id: "withdrawal",
      status: "pending",
      amount: 5000,
      executorProfile: { userId: "executor", shabaVerifiedAt: null },
    };
  const tx = {
    withdrawal: {
      findUnique: async () => withdrawal,
      update: async (args) => {
        writes.push(args);
        return args.data;
      },
    },
    auditLog: { create: async () => {} },
    outboxEvent: { create: async () => {} },
  };
  // No wallet or account balance reader provided: any attempted check must fail.
  const service = harness(
    "apps/api/src/finance/withdrawals.service.ts",
    "WithdrawalsService",
    ["decide"],
    {
      idempotency: { execute: (params) => params.work(tx) },
      ledger: {
        getOrCreateUserAccount: async () => ({ id: "executor-account" }),
        getSystemAccount: async () => ({ id: "clearing" }),
        postEntry: async (args) => writes.push(args),
      },
    },
  );
  await service.decide("withdrawal", true, "finance", "reason", "fixture-key");
  assert.equal(writes[0].amount, 5000);
  assert.equal(writes[1].data.status, "approved");
  assert(writes[1].data.processedAt instanceof Date);
});
test("withdrawal reject does not debit Ledger and non-pending decision conflicts", async () => {
  const tx = {
    withdrawal: {
      findUnique: async () => ({ status: "pending", amount: 5000 }),
      update: async (args) => args.data,
    },
    auditLog: { create: async () => {} },
    outboxEvent: { create: async () => {} },
  };
  const service = harness(
    "apps/api/src/finance/withdrawals.service.ts",
    "WithdrawalsService",
    ["decide"],
    { idempotency: { execute: (params) => params.work(tx) } },
  );
  assert.equal(
    (await service.decide("w", false, "finance", "reason", "fixture-key"))
      .status,
    "rejected",
  );
  tx.withdrawal.findUnique = async () => ({ status: "approved" });
  await assert.rejects(
    () => service.decide("w", true, "finance", "reason", "fixture-key"),
    errors.ConflictException,
  );
});
test("GAP: feedback replay binds owner/order but not changed payload; raw internal id returned", async () => {
  const saved = {
    id: "feedback",
    customerId: "owner",
    orderId: "order",
    targetInternalId: "private-profile",
    rating: 1,
  };
  const service = harness(
    "apps/api/src/feedback/feedback.service.ts",
    "FeedbackService",
    ["create"],
    { prisma: { feedback: { findUnique: async () => saved } } },
  );
  const result = await service.create(
    "owner",
    "order",
    { feedbackType: "rating", rating: 5 },
    "same-key",
  );
  assert.equal(result.rating, 1);
  assert.equal(result.targetInternalId, "private-profile");
  await assert.rejects(
    () => service.create("other", "order", {}, "same-key"),
    errors.ForbiddenException,
  );
});

test("GAP: primitive catalog active flag reaches service without DTO validation", () => {
  const row = review.contracts.find(
    (item) => item.signature === "PATCH /v1/admin/services/:id/active",
  );
  const controller = review.methods.find(
    (item) => item.key === row.methodRefs[0],
  );
  assert.deepEqual(controller.dtos, []);
  const entry = classMethodEvidence(
    read(controller.file),
    controller.className,
    controller.methodName,
    controller.file,
  );
  assert.match(entry.text, /@Body\('isActive'\)/);
});
test("GAP: current system holiday validation accepts nonexistent calendar dates", () => {
  const service = harness(
    "apps/api/src/users/settings.service.ts",
    "SettingsService",
    ["validate"],
    {},
  );
  assert.deepEqual(
    service.validate(
      { valueType: "date_array", key: "calendar.iran_holidays" },
      ["2026-99-99"],
    ),
    ["2026-99-99"],
  );
});
test("AI human-approval setting cannot be disabled by any raw false value", () => {
  const service = harness(
    "apps/api/src/users/settings.service.ts",
    "SettingsService",
    ["validate"],
    {},
  );
  assert.throws(
    () =>
      service.validate(
        { valueType: "boolean", key: "ai.human_approval_required" },
        false,
      ),
    errors.BadRequestException,
  );
  assert.equal(
    service.validate(
      { valueType: "boolean", key: "ai.human_approval_required" },
      true,
    ),
    true,
  );
});
test("GAP: zero-sample risk currently returns numeric zero, not unknown", () => {
  const file = "apps/api/src/executor/performance-metrics.ts";
  const declarations = ["calculateRiskScore", "round2", "clamp"]
    .map((name) => functionEvidence(read(file), name).text)
    .join("\n");
  const { calculateRiskScore } = evaluate(
    declarations + "\nexport { calculateRiskScore };",
  );
  assert.equal(
    calculateRiskScore({
      onTimeSamples: 0,
      qcSamples: 0,
      ratingSamples: 0,
      complaints: 0,
      compliments: 0,
    }),
    0,
  );
});
test("real onboarding policy requires evidence and respects rejected/reopen/terminal stages", () => {
  const file = "apps/api/src/executor/onboarding-policy.ts";
  const policy = evaluate(read(file));
  assert.equal(
    policy.nextOnboardingStage("registered", "approve_step"),
    "identity_verification",
  );
  assert.throws(
    () => policy.nextOnboardingStage("identity_verification", "approve_step"),
    errors.BadRequestException,
  );
  assert.equal(policy.nextOnboardingStage("rejected", "reopen"), "registered");
  assert.throws(
    () => policy.nextOnboardingStage("approved", "approve_step", "evidence"),
    errors.BadRequestException,
  );
});
