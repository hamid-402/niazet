import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const api = join(root, "apps/api"),
  req = createRequire(join(api, "package.json"));
const { PrismaClient } = req("@prisma/client");
const targetMigration = "20261025100000_zeus_wallet_funding";
const migrations = join(api, "prisma/migrations");
const names = readdirSync(migrations, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
assert.equal(names.at(-1), targetMigration);
const envFile = readFileSync(join(api, ".env"), "utf8");
const value = (name) =>
  envFile
    .split(/\r?\n/)
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
const configured = new URL(value("DATABASE_URL"));
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname),
  "Local PostgreSQL only.",
);
assert.equal(value("NODE_ENV") ?? "development", "development");
assert.equal(value("PAYMENT_GATEWAY_DRIVER") ?? "mock", "mock");
const mainName = decodeURIComponent(configured.pathname.slice(1));
const digest = (text) => createHash("sha256").update(text).digest("hex");
const normalizedDigest = (text) =>
  digest(text.toString().replaceAll("\r\n", "\n"));
const redact = (error) =>
  String(error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "<database URL>");
function cli(args, url) {
  const result = spawnSync(
    process.execPath,
    [join(api, "node_modules/prisma/build/index.js"), ...args],
    {
      cwd: api,
      env: {
        ...process.env,
        DATABASE_URL: url,
        PRISMA_GENERATE_SKIP_AUTOINSTALL: "1",
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 60000,
    },
  );
  assert.equal(
    result.status,
    0,
    redact(`${result.stdout}\n${result.stderr}`).slice(-3000),
  );
}
async function snapshot(db, onlyTables) {
  const all =
    onlyTables ??
    (
      await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
    ).map((r) => r.tablename);
  const data = {};
  for (const table of all) {
    assert.match(table, /^[a-z_]+$/);
    const rows = await db.$queryRawUnsafe(
      `SELECT row_to_json(t)::text AS value FROM "${table}" t ORDER BY row_to_json(t)::text`,
    );
    data[table] = {
      count: rows.length,
      hash: digest(rows.map((r) => r.value).join("\n")),
    };
  }
  return data;
}
async function verifyHistory(db, includeNew = false) {
  const applied =
    await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  assert(
    applied.every((m) => m.finished_at && !m.rolled_back_at),
    "Unfinished/rolled-back migration requires review.",
  );
  assert.deepEqual(
    applied.map((m) => m.migration_name),
    includeNew ? names : names.slice(0, -1),
    "Unexpected migration history; do not deploy other pending work.",
  );
  for (const m of applied) {
    const sql = readFileSync(join(migrations, m.migration_name, 'migration.sql'), 'utf8');
    const lf = sql.replaceAll('\r\n', '\n');
    // Windows migration history may use CRLF. No SQL/content edit is accepted.
    assert([digest(sql), digest(lf), digest(lf.replaceAll('\n', '\r\n'))].includes(m.checksum), 'Applied migration checksum drift: ' + m.migration_name);
  }
}
async function child() {
  const url = new URL(process.env.ZEUS_TEST_DATABASE_URL);
  assert.equal(url.hostname, configured.hostname);
  assert.match(url.pathname, /^\/niazat_z1_upgrade_\d+_[a-f0-9]{8}$/);
  assert.notEqual(decodeURIComponent(url.pathname.slice(1)), mainName);
  const { PrismaClient: OldClient } = req(process.env.ZEUS_OLD_CLIENT_PATH);
  const old = new OldClient({ datasources: { db: { url: url.toString() } } });
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    await verifyHistory(db);
    const user = await old.user.create({
      data: {
        phone: "9100200001",
        fullName: "Isolated upgrade fixture",
        role: "customer",
        status: "active",
      },
    });
    const service = await old.serviceLine.create({
      data: {
        slug: "isolated-upgrade",
        title: "fixture",
        category: "fixture",
        description: "fixture",
      },
    });
    const order = await old.order.create({
      data: {
        code: "UPGRADE-FIXTURE",
        customerId: user.id,
        serviceId: service.id,
        title: "Legacy order",
        briefDescription: "Retain me",
        status: "pending_payment",
        finalPrice: 100,
      },
    });
    const clearing = await old.ledgerAccount.create({
      data: { accountType: "payment_gateway_clearing" },
    });
    await old.ledgerAccount.create({
      data: { accountType: "platform_escrow" },
    });
    const { LedgerService } = req("./dist/finance/ledger.service.js");
    const ledger = new LedgerService(old);
    const owner = await old.ledgerAccount.create({
      data: { ownerUserId: user.id, accountType: "customer_wallet" },
    });
    await old.$transaction((tx) =>
      ledger.postEntry(
        {
          debitAccountId: clearing.id,
          creditAccountId: owner.id,
          amount: 40,
          referenceType: "payment",
          referenceId: randomUUID(),
        },
        tx,
      ),
    );
    const before = await snapshot(db);
    cli(["migrate", "deploy"], url.toString());
    assert.deepEqual(
      await snapshot(db, Object.keys(before)),
      before,
      "Upgrade changed existing rows!",
    );
    assert.equal(
      (await old.order.findUniqueOrThrow({ where: { id: order.id } })).code,
      "UPGRADE-FIXTURE",
    );
    assert.equal(
      (await old.wallet.findUniqueOrThrow({ where: { userId: user.id } }))
        .balance,
      40,
    );
    assert((await ledger.verifyWalletConsistency(user.id)).consistent);
    const { ConfigService } = req("@nestjs/config");
    const { IdempotencyService } = req("./dist/finance/idempotency.service.js");
    const { WalletPaymentsService } = req(
      "./dist/finance/wallet-payments.service.js",
    );
    const { PaymentGatewayService } = req("./dist/finance/zarinpal.gateway.js");
    const { MockPaymentGateway } = req("./dist/finance/payment-gateway.js");
    const config = new ConfigService({
      NODE_ENV: "test",
      ZEUS_WALLET_ENABLED: true,
      PAYMENT_GATEWAY_DRIVER: "mock",
    });
    const wallet = new WalletPaymentsService(
      db,
      new LedgerService(db),
      new IdempotencyService(db),
      new PaymentGatewayService(config, new MockPaymentGateway(config)),
      config,
    );
    const intent = await wallet.initiate(user.id, 100, randomUUID());
    await wallet.verify(user.id, intent.id, randomUUID());
    // Actual generated old client reads new journal entries without new enum values.
    assert.equal(
      (await old.wallet.findUniqueOrThrow({ where: { userId: user.id } }))
        .balance,
      140,
    );
    assert.equal(await old.ledgerEntry.count(), 2);
    assert((await ledger.verifyWalletConsistency(user.id)).consistent);
    await old.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: "fixture-only",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    config.set("ZEUS_WALLET_ENABLED", false);
    assert.throws(
      () => wallet.list(user.id),
      (e) => e.getStatus?.() === 503,
    );
    assert.equal(await db.walletFundingIntent.count(), 1);
    await verifyHistory(db, true);
    console.log(
      JSON.stringify({
        populatedUpgrade: true,
        existingTablesPreserved: Object.keys(before).length,
        actualOldGeneratedClientReadWrite: true,
        oldClientReadsNewFinancialEntries: true,
        disabledFeaturePreservesData: true,
      }),
    );
  } finally {
    await old.$disconnect();
    await db.$disconnect();
  }
}
async function rehearse() {
  const name = `niazat_z1_upgrade_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const url = new URL(configured);
  url.pathname = "/" + name;
  const maintenance = new URL(configured);
  maintenance.pathname = "/postgres";
  const control = new PrismaClient({
    datasources: { db: { url: maintenance.toString() } },
  });
  const runtime = resolve(root, "_runtime/apps/api");
  const temp = mkdtempSync(join(runtime, "z1-upgrade-"));
  let created = false;
  try {
    // Generated compatibility fixture, not a backup or second project. Only
    // old migration/schema compiler inputs and generated client, removed below.
    const schema = execFileSync(
      "git",
      ["show", "2c701d7:apps/api/prisma/schema.prisma"],
      { cwd: root, encoding: "utf8" },
    ).replace(
      'provider = "prisma-client-js"',
      'provider = "prisma-client-js"\n  output = ' +
        JSON.stringify(join(temp, "client").replaceAll("\\", "/")),
    );
    writeFileSync(join(temp, "schema.prisma"), schema);
    mkdirSync(join(temp, "migrations"));
    const fixtureConfig = join(temp, "prisma.config.ts");
    writeFileSync(
      fixtureConfig,
      "import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: " +
        JSON.stringify(join(temp, "schema.prisma")) +
        ", migrations: { path: " +
        JSON.stringify(join(temp, "migrations")) +
        " }, datasource: { url: process.env.DATABASE_URL! } });\n",
    );
    cpSync(
      join(migrations, "migration_lock.toml"),
      join(temp, "migrations/migration_lock.toml"),
      { recursive: true },
    );
    for (const name of names.slice(0, -1))
      cpSync(join(migrations, name), join(temp, "migrations", name), {
        recursive: true,
      });
    await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    cli(["migrate", "deploy", "--config", fixtureConfig], url.toString());
    cli(["generate", "--config", fixtureConfig], url.toString());
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--child"],
      {
        cwd: root,
        env: {
          ...process.env,
          ZEUS_TEST_DATABASE_URL: url.toString(),
          ZEUS_OLD_CLIENT_PATH: join(temp, "client"),
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 60000,
      },
    );
    assert.equal(result.status, 0, redact(result.stderr));
    console.log(result.stdout.trim());
  } finally {
    if (created) {
      assert.match(name, /^niazat_z1_upgrade_\d+_[a-f0-9]{8}$/);
      assert.notEqual(name, mainName);
      await control.$queryRawUnsafe(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        name,
      );
      await control.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    }
    await control.$disconnect();
    assert.equal(dirname(resolve(temp)), runtime);
    assert.match(temp.slice(runtime.length + 1), /^z1-upgrade-[A-Za-z0-9]+$/);
    rmSync(temp, { recursive: true });
  }
  console.log(
    "Rehearsal passed; temporary DB and generated compatibility client removed. Main DB was never connected.",
  );
}
async function local(apply) {
  const { matchesZ1DomainApproval } =
    await import("../orbit-z1-domain-approval.mjs");
  const path =
    "apps/api/prisma/migrations/" + targetMigration + "/migration.sql";
  assert(
    matchesZ1DomainApproval(path, readFileSync(join(root, path))),
    "Unapproved migration bytes.",
  );
  const db = new PrismaClient({
    datasources: { db: { url: configured.toString() } },
  });
  try {
    await verifyHistory(db);
    const before = await snapshot(db);
    const sql = readFileSync(join(root, path), "utf8");
    assert(sql.includes("BEGIN;") && sql.includes("COMMIT;"));
    const statements = sql.replaceAll(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    assert(statements.every(s => /^(?:BEGIN|COMMIT)$/.test(s) || /^CREATE (?:UNIQUE )?(?:TABLE|INDEX)\s/.test(s)), 'Only additive statements permitted.');
    if (!apply) {
      console.log(
        JSON.stringify({
          localPreflight: "passed",
          pendingMigrationCount: 1,
          existingTables: Object.keys(before).length,
          existingRows: Object.values(before).reduce(
            (sum, t) => sum + t.count,
            0,
          ),
          migrationSha256: normalizedDigest(sql),
          databaseModified: false,
        }),
      );
      return;
    }
    cli(["migrate", "deploy"], configured.toString());
    assert.deepEqual(
      await snapshot(db, Object.keys(before)),
      before,
      "Existing data changed during upgrade; leave feature OFF and investigate.",
    );
    await verifyHistory(db, true);
    console.log(
      JSON.stringify({
        localMigration: "passed",
        existingDataUnchanged: true,
        existingTables: Object.keys(before).length,
        preservedSnapshotDigest: digest(JSON.stringify(before)),
        existingBalancesRewritten: false,
        seedExecuted: false,
        liveProviderActivated: false,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
async function status() {
  const db = new PrismaClient({ datasources: { db: { url: configured.toString() } } });
  try {
    await verifyHistory(db, true);
    const { LedgerService } = req('./dist/finance/ledger.service.js');
    const ledger = new LedgerService(db);
    const wallets = await db.wallet.findMany({ select: { userId: true } });
    const results = await Promise.all(wallets.map(w => ledger.verifyWalletConsistency(w.userId)));
    assert(results.every(r => r.consistent), 'Existing wallet inconsistency: feature must stay off until explicit financial review; do not repair balances.');
    console.log(JSON.stringify({ localUpgradeStatus: 'passed', migrationCount: names.length, walletsCheckedReadOnly: wallets.length, allExistingWalletsConsistent: true, fundingIntentCount: await db.walletFundingIntent.count(), localSwitchEnabled: value('ZEUS_WALLET_ENABLED') === 'true', configuredPaymentGateway: value('PAYMENT_GATEWAY_DRIVER') ?? 'mock', financialTransactionExecuted: false }));
  } finally { await db.$disconnect(); }
}
const mode = process.argv[2];
Promise.resolve()
  .then(() =>
    mode === "--child"
      ? child()
      : mode === "--rehearse"
        ? rehearse()
        : mode === '--status-local' ? status()
        : mode === "--preflight"
          ? local(false)
          : mode === "--apply-local"
            ? local(true)
            : assert.fail(
                "Use --rehearse, --preflight or explicitly owner-approved --apply-local.",
              ),
  )
  .catch((error) => {
    console.error(redact(error.stack ?? error.message));
    process.exitCode = 1;
  });
