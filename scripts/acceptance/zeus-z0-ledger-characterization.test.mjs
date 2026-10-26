import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { functionEvidence } from "./zeus-z0-domain-contracts.mjs";

// Source-backed, exact-method probes with in-memory dependencies. No real
// service constructor, PrismaClient, database, HTTP, clock/timer or funds.
// A green GAP probe reproduces an open gap; it does not accept or fix it.
const root = new URL("../../", import.meta.url);
const requireApi = createRequire(new URL("apps/api/package.json", root));
const ts = requireApi("typescript");
const { Prisma, WalletTxDirection } = requireApi("@prisma/client");
const { BadRequestException, ConflictException, NotFoundException } =
  requireApi("@nestjs/common");
const ledgerFile = "apps/api/src/finance/ledger.service.ts";
const idempotencyFile = "apps/api/src/finance/idempotency.service.ts";
const reconciliationFile =
  "apps/api/src/finance/finance-reconciliation.service.ts";
const read = (file) => readFileSync(new URL(file, root), "utf8");

function harness(file, names, dependencies, bindings = {}, functions = []) {
  const bodies = names
    .map((name) => functionEvidence(read(file), name, true).text)
    .join("\n");
  const standalone = functions
    .map((name) => functionEvidence(read(file), name).text)
    .join("\n");
  const js = ts.transpileModule(
    `${standalone}\nexport class Harness { constructor(d){Object.assign(this,d);}\n${bodies}\n}`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const scope = {
    Prisma,
    WalletTxDirection,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ...bindings,
  };
  const exports = {};
  new Function("exports", ...Object.keys(scope), js)(
    exports,
    ...Object.values(scope),
  );
  return new exports.Harness(dependencies);
}

function consistencyFixture({
  account = true,
  balance = 80,
  credit = 100,
  debit = 20,
  walletExists = true,
} = {}) {
  const effects = [],
    tx = {
      ledgerAccount: {
        findUnique: async () => (account ? { id: "account" } : null),
      },
      ledgerEntry: {
        aggregate: async ({ where }) => ({
          _sum: { amount: where.creditAccountId ? credit : debit },
        }),
      },
      wallet: {
        findUnique: async () => {
          effects.push("wallet-read");
          return walletExists ? { balance } : null;
        },
      },
    };
  const service = harness(ledgerFile, ["verifyWalletConsistency"], {
    prisma: tx,
  });
  return { service, effects, tx };
}
test("valid account comparison uses credit minus debit, detects both correct and wrong cache", async () => {
  const good = consistencyFixture();
  assert.deepEqual(await good.service.verifyWalletConsistency("user"), {
    consistent: true,
    ledgerBalance: 80,
    walletBalance: 80,
  });
  const bad = consistencyFixture({ balance: 81 });
  assert.deepEqual(await bad.service.verifyWalletConsistency("user"), {
    consistent: false,
    ledgerBalance: 80,
    walletBalance: 81,
  });
});
for (const balance of [100, -50])
  test(`regression L02: missing account reports existing wallet balance ${balance} without guessing ledger balance`, async () => {
    const f = consistencyFixture({ account: false, balance });
    assert.deepEqual(await f.service.verifyWalletConsistency("user"), {
      consistent: false,
      ledgerBalance: null,
      walletBalance: balance,
      reason: "missing_ledger_account",
    });
    assert.deepEqual(f.effects, ["wallet-read"]);
  });

test("missing account with zero or absent wallet retains the existing empty-state result", async () => {
  for (const walletExists of [true, false]) {
    const f = consistencyFixture({ account: false, balance: 0, walletExists });
    assert.deepEqual(await f.service.verifyWalletConsistency("user"), {
      consistent: true,
      ledgerBalance: 0,
      walletBalance: 0,
    });
    assert.deepEqual(f.effects, ["wallet-read"]);
  }
});

test("missing-account wallet read failure propagates instead of returning false all-clear", async () => {
  const f = consistencyFixture({ account: false });
  f.tx.wallet.findUnique = async () => {
    throw new Error("fixture database unavailable");
  };
  await assert.rejects(
    () => f.service.verifyWalletConsistency("user"),
    /database unavailable/,
  );
});

test("supplied transaction is used for both missing-account and wallet reads, not the root client", async () => {
  const f = consistencyFixture({ account: false, balance: 100 });
  const root = {
    ledgerAccount: {
      findUnique: async () => {
        throw new Error("root client must not be used");
      },
    },
  };
  const service = harness(ledgerFile, ["verifyWalletConsistency"], {
    prisma: root,
  });
  assert.equal(
    (await service.verifyWalletConsistency("user", f.tx)).consistent,
    false,
  );
  assert.deepEqual(f.effects, ["wallet-read"]);
});
test("zero/empty ledger aggregate is treated as zero only in the existing-account path", async () => {
  const f = consistencyFixture({ balance: 0, credit: null, debit: null });
  assert.equal(
    (await f.service.verifyWalletConsistency("user")).consistent,
    true,
  );
  assert.deepEqual(f.effects, ["wallet-read"]);
});
test("mismatch scan records CRITICAL audit/outbox and notifies active finance/super admins without repair", async () => {
  const queries = [],
    effects = [];
  const tx = {
    wallet: { findMany: async () => [{ userId: "user" }] },
    user: {
      findMany: async (query) => {
        queries.push(query);
        return [{ id: "finance" }];
      },
    },
    auditLog: { create: async (args) => effects.push(["audit", args.data]) },
    outboxEvent: {
      create: async (args) => effects.push(["outbox", args.data]),
    },
    notificationLog: {
      createMany: async (args) => effects.push(["notify", args.data]),
    },
  };
  const service = harness(ledgerFile, ["verifyAllWallets"], {
    prisma: tx,
    verifyWalletConsistency: async () => ({
      consistent: false,
      ledgerBalance: 0,
      walletBalance: 100,
    }),
  });
  const result = await service.verifyAllWallets(tx);
  assert.equal(result.checked, 1);
  assert.equal(result.consistent, false);
  assert.deepEqual(queries[0].where.adminScope, {
    in: ["finance_admin", "super_admin"],
  });
  assert.equal(queries[0].where.status, "active");
  assert.equal(effects[1][1].payload.severity, "CRITICAL");
  assert.deepEqual(
    effects.map((item) => item[0]),
    ["audit", "outbox", "notify"],
  );
});

function entryFixture(existing = null) {
  const effects = [];
  const tx = {
    ledgerEntry: {
      findUnique: async () => existing,
      create: async ({ data }) => {
        effects.push(["entry", data]);
        return { id: "entry", ...data };
      },
    },
  };
  const service = harness(ledgerFile, ["postEntry"], {
    prisma: {
      ...tx,
      $transaction: async (work) => {
        effects.push(["transaction"]);
        return work(tx);
      },
    },
    projectToWallet: async (_tx, account, _entry, direction) =>
      effects.push(["projection", account, direction]),
  });
  const input = {
    debitAccountId: "clearing",
    creditAccountId: "escrow",
    amount: 100,
    referenceType: "payment",
    referenceId: "payment",
    idempotencyKey: "fixture-ledger-key",
    createdByUserId: "actor",
  };
  return { service, effects, input, tx };
}
test("new ledger entry invokes both projections inside selected transaction and preserves actor", async () => {
  const f = entryFixture();
  const entry = await f.service.postEntry(f.input);
  assert.equal(entry.createdByUserId, "actor");
  assert.deepEqual(
    f.effects.map((item) => item[0]),
    ["transaction", "entry", "projection", "projection"],
  );
  assert.deepEqual(
    f.effects.slice(2).map((item) => item.slice(1)),
    [
      ["clearing", "debit"],
      ["escrow", "credit"],
    ],
  );
});
test("fresh nonpositive entry rejected before transaction/create/projection", async () => {
  for (const amount of [0, -1]) {
    const f = entryFixture();
    await assert.rejects(
      () => f.service.postEntry({ ...f.input, amount }),
      BadRequestException,
    );
    assert.deepEqual(f.effects, []);
  }
});
test("characterization GAP L04: internal ledger key replays existing entry even with changed amount/accounts", async () => {
  const existing = {
    id: "original",
    amount: 100,
    debitAccountId: "a",
    creditAccountId: "b",
  };
  const f = entryFixture(existing);
  assert.deepEqual(
    await f.service.postEntry({
      ...f.input,
      amount: -1,
      debitAccountId: "different",
      referenceId: "different",
    }),
    existing,
  );
  assert.deepEqual(f.effects, []); // No new money posted; compatibility not checked here.
});

function idempotencyFixture() {
  let saved = null;
  const tx = {
    idempotencyKey: {
      findUnique: async () => saved,
      create: async ({ data }) => {
        saved = { id: "idempotency", ...data, responseSnapshot: null };
        return saved;
      },
      update: async ({ data }) => Object.assign(saved, data),
    },
  };
  const service = harness(
    idempotencyFile,
    ["requireKey", "execute", "replay"],
    { prisma: { $transaction: (work) => work(tx) } },
    {
      createHash,
      KEY_PATTERN: /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/,
      IDEMPOTENCY_TTL_MS: 86_400_000,
    },
    ["canonicalize", "requestFingerprint"],
  );
  return service;
}
test("outer request idempotency DOES reject changed payload, unlike internal ledger replay", async () => {
  const service = idempotencyFixture();
  await service.execute({
    key: "fixture-replay-key",
    scope: "fixture",
    request: { amount: 100 },
    work: async () => ({ done: true }),
  });
  await assert.rejects(
    () =>
      service.execute({
        key: "fixture-replay-key",
        scope: "fixture",
        request: { amount: 101 },
        work: async () => {
          throw new Error("Must not execute");
        },
      }),
    ConflictException,
  );
});
function nightlyFixture(hour = 2) {
  let executions = 0,
    consistent = true;
  const service = harness(
    reconciliationFile,
    ["runNightly"],
    {
      ledger: {
        verifyAllWallets: async () => {
          executions++;
          return { consistent };
        },
      },
      idempotency: idempotencyFixture(),
      logger: { log: () => {} },
    },
    { tehranHour: () => hour, tehranDateKey: () => "2026-10-24" },
  );
  return {
    service,
    executions: () => executions,
    change: () => {
      consistent = false;
    },
  };
}
test("nightly reconciliation is present and skips outside Tehran hour 02 unless explicitly forced", async () => {
  const f = nightlyFixture(12);
  assert.deepEqual(await f.service.runNightly(), {
    skipped: true,
    reason: "outside_schedule",
  });
  assert.equal(f.executions(), 0);
  assert.equal((await f.service.runNightly(true)).consistent, true);
  assert.equal(f.executions(), 1);
});
test("characterization L03: force reuses daily snapshot rather than forcing a second fresh scan", async () => {
  const f = nightlyFixture();
  assert.equal((await f.service.runNightly()).consistent, true);
  f.change();
  assert.equal((await f.service.runNightly(true)).consistent, true);
  assert.equal(f.executions(), 1); // Uses exact outer execute/replay, not a made-up cache.
});
test("lifecycle scheduling is separate from JobRunner and clears timer; no actual timer is created", () => {
  const effects = [],
    fakeTimer = { unref: () => effects.push("unref") };
  const service = harness(
    reconciliationFile,
    ["onModuleInit", "onModuleDestroy"],
    {
      runNightly: () => {
        effects.push("initial-run");
        return Promise.resolve({});
      },
    },
    {
      setInterval: (callback, ms) => {
        assert.equal(typeof callback, "function");
        assert.equal(ms, 3_600_000);
        effects.push("hourly-timer");
        return fakeTimer;
      },
      clearInterval: (timer) => {
        assert.equal(timer, fakeTimer);
        effects.push("clear");
      },
    },
  );
  service.onModuleInit();
  service.onModuleDestroy();
  assert.deepEqual(effects, ["hourly-timer", "unref", "initial-run", "clear"]);
});
