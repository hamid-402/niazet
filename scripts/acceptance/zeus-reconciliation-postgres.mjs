import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { matchesReconciliationApproval } from "../orbit-reconciliation-approval.mjs";

// Only a newly created random LOCAL database is writable. Never start Nest,
// lifecycle timers, seed, providers or the main app. No source DB client exists.
const apiRoot = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const requireApi = createRequire(join(apiRoot, "package.json"));
const { PrismaClient } = requireApi("@prisma/client");
const ledgerPath = "apps/api/src/finance/ledger.service.ts";
const source = readFileSync(new URL(`../../${ledgerPath}`, import.meta.url));
assert(
  matchesReconciliationApproval(ledgerPath, source),
  "Build/test only the approved source.",
);
assert(
  existsSync(join(apiRoot, "dist/finance/ledger.service.js")),
  "Run API build first.",
);
const { LedgerService } = requireApi("./dist/finance/ledger.service.js");
assert(
  LedgerService.prototype.verifyWalletConsistency
    .toString()
    .includes("missing_ledger_account"),
  "Compiled diagnosis is stale; build first.",
);

function databaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const line = readFileSync(join(apiRoot, ".env"), "utf8")
    .split(/\r?\n/)
    .find((value) => /^\s*DATABASE_URL=/.test(value));
  assert(line, "Configure DATABASE_URL for isolated local acceptance.");
  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
}

const configured = new URL(databaseUrl());
assert.match(configured.protocol, /^postgres(?:ql)?:$/);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname),
  "Only local PostgreSQL is authorized by this runner.",
);
const sourceName = decodeURIComponent(configured.pathname.slice(1));
const name = `niazat_reconcile_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
assert.match(name, /^niazat_reconcile_\d+_[a-f0-9]{8}$/);
assert.notEqual(name, sourceName);
const maintenance = new URL(configured);
maintenance.pathname = "/postgres";
maintenance.searchParams.set("schema", "public");
const isolated = new URL(configured);
isolated.pathname = `/${name}`;
isolated.searchParams.set("schema", "public");
const control = new PrismaClient({
  datasources: { db: { url: maintenance.toString() } },
});
let created = false,
  db;
const passed = [];
const redact = (message) =>
  String(message)
    .replaceAll(configured.toString(), "<configured database>")
    .replaceAll(isolated.toString(), "<isolated database>")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "<database URL>");

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
      `Isolated migration failed: ${redact(`${migration.stdout ?? ""}\n${migration.stderr ?? ""}`).slice(-2500)}`,
    );
    db = new PrismaClient({
      datasources: { db: { url: isolated.toString() } },
    });
    assert.equal(
      (await db.$queryRaw`SELECT current_database() AS name`)[0].name,
      name,
    );
    const ledger = new LedgerService(db);
    let phone = 9100000000;
    const user = (role = "customer", adminScope = null, status = "active") =>
      db.user.create({
        data: {
          phone: String(++phone),
          fullName: "Isolated reconciliation fixture",
          role,
          adminScope,
          status,
        },
      });
    const cases = [];
    for (const balance of [100, -50, 0]) {
      const owner = await user();
      await db.wallet.create({ data: { userId: owner.id, balance } });
      cases.push({ userId: owner.id, balance });
    }
    const empty = await user();
    const valid = await user();
    const account = await db.ledgerAccount.create({
      data: { ownerUserId: valid.id, accountType: "customer_wallet" },
    });
    const clearing = await db.ledgerAccount.create({
      data: { accountType: "payment_gateway_clearing" },
    });
    // Deliberate test-only fixtures, not a repair or payment workflow.
    await db.ledgerEntry.create({
      data: {
        debitAccountId: clearing.id,
        creditAccountId: account.id,
        amount: 80,
        referenceType: "payment",
        referenceId: randomUUID(),
      },
    });
    await db.wallet.create({ data: { userId: valid.id, balance: 80 } });
    const finance = await user("admin", "finance_admin");
    const superAdmin = await user("admin", "super_admin");
    await user("admin", "ops_admin");
    await user("admin", "finance_admin", "blocked");
    const tables = [
      "user",
      "ledgerAccount",
      "ledgerEntry",
      "wallet",
      "walletTransaction",
      "payment",
      "escrowHold",
      "refund",
      "withdrawal",
      "invoice",
    ];
    const financialSnapshot = async () =>
      JSON.stringify(
        await Promise.all(
          tables.map((table) => db[table].findMany({ orderBy: { id: "asc" } })),
        ),
      );
    const before = await financialSnapshot();

    for (const fixture of cases.filter((item) => item.balance !== 0)) {
      assert.deepEqual(await ledger.verifyWalletConsistency(fixture.userId), {
        consistent: false,
        ledgerBalance: null,
        walletBalance: fixture.balance,
        reason: "missing_ledger_account",
      });
      passed.push(
        fixture.balance > 0
          ? "missing_account_positive_wallet"
          : "missing_account_negative_wallet",
      );
    }
    for (const id of [cases[2].userId, empty.id])
      assert.deepEqual(await ledger.verifyWalletConsistency(id), {
        consistent: true,
        ledgerBalance: 0,
        walletBalance: 0,
      });
    passed.push("zero_and_absent_wallet_compatibility");
    assert.deepEqual(await ledger.verifyWalletConsistency(valid.id), {
      consistent: true,
      ledgerBalance: 80,
      walletBalance: 80,
    });
    passed.push("existing_account_credit_minus_debit");

    const result = await db.$transaction((tx) => ledger.verifyAllWallets(tx));
    assert.equal(result.checked, 4);
    assert.equal(result.consistent, false);
    assert.deepEqual(
      result.inconsistencies
        .map((item) => item.walletBalance)
        .sort((a, b) => a - b),
      [-50, 100],
    );
    assert(
      result.inconsistencies.every(
        (item) =>
          item.ledgerBalance === null &&
          item.reason === "missing_ledger_account",
      ),
    );
    const audit = await db.auditLog.findMany({
      where: { action: "finance.reconciliation_failed" },
    });
    const outbox = await db.outboxEvent.findMany({
      where: { eventType: "finance.critical_reconciliation_alert" },
    });
    assert.equal(audit.length, 1);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].payload.severity, "CRITICAL");
    assert.deepEqual(audit[0].after, result.inconsistencies);
    assert.deepEqual(outbox[0].payload.inconsistencies, result.inconsistencies);
    passed.push("actual_scan_audit_outbox_diagnosis");
    const notifications = await db.notificationLog.findMany({
      where: { eventType: "finance.critical_reconciliation_alert" },
    });
    assert.deepEqual(
      notifications.map((item) => item.userId).sort(),
      [finance.id, superAdmin.id].sort(),
    );
    assert(notifications.every((item) => item.channel === "in_app"));
    passed.push("active_finance_super_only_in_app");

    const alertCounts = async () =>
      Promise.all(
        ["auditLog", "outboxEvent", "notificationLog"].map((table) =>
          db[table].count(),
        ),
      );
    const beforeRollback = await alertCounts();
    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          await ledger.verifyAllWallets(tx);
          throw new Error("fixture abort after diagnosis");
        }),
      /fixture abort/,
    );
    assert.deepEqual(await alertCounts(), beforeRollback);
    passed.push("diagnostic_alert_transaction_rollback");
    assert.equal(await financialSnapshot(), before);
    passed.push("no_account_wallet_ledger_payment_or_owner_mutation");
  } finally {
    if (db) await db.$disconnect();
    if (created) {
      assert.match(name, /^niazat_reconcile_\d+_[a-f0-9]{8}$/);
      assert.notEqual(name, sourceName);
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
      packet: "ZEUS-EXEC-004",
      postgres: "passed",
      cases: passed,
      temporaryDatabaseRemoved: true,
      mainDatabaseConnected: false,
      sourceSha256: createHash("sha256")
        .update(source.toString("utf8").replaceAll("\r\n", "\n"))
        .digest("hex"),
    }),
  );
}
run().catch((error) => {
  console.error(redact(error.message));
  process.exitCode = 1;
});
