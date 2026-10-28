import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  stripSqlComments,
  sqlColumnContract,
  sqlContracts,
  prismaModels,
  referenceModelClauses,
  sourceTransitions,
  stateDeclarations,
  functionEvidence,
  helperCancellationStates,
  inspectDomainContracts,
  checkDomainReview,
  attributeArgument,
  compareColumnDeclaration,
} from "./zeus-z0-domain-contracts.mjs";

const column = (definition) =>
  sqlColumnContract({ name: "value", line: 2, type: "INTEGER", definition });
test("SQL primary key implies NOT NULL; defaults and references are separate evidence", () => {
  const item = column("id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- note");
  assert.equal(item.nullable, false);
  assert.equal(item.primaryKey, true);
  assert.equal(item.defaultExpression, "gen_random_uuid()");
  assert.deepEqual(
    column("value UUID UNIQUE REFERENCES users(id),").references,
    { table: "users", column: "id" },
  );
  assert.equal(
    column("value UUID UNIQUE REFERENCES users(id),").nullable,
    true,
  );
});

test("Prisma attribute argument retains nested expressions and quoted parentheses without evaluation", () => {
  assert.equal(
    attributeArgument('@default(uuid()) @map("x")', "default"),
    "uuid()",
  );
  assert.equal(
    attributeArgument('@default("a)\\\"b") @map("x")', "default"),
    '"a)\\\"b"',
  );
  assert.equal(attributeArgument('@map("x")', "default"), null);
  assert.equal(attributeArgument('@map("fake @default(1)")', "default"), null);
  assert.throws(
    () => attributeArgument("@default(uuid()", "default"),
    /Unclosed/,
  );
});

test("composite uniqueness and ordinary indexes cannot invent single-column uniqueness", () => {
  const source = { ...column("value INTEGER UNIQUE"), nullable: true };
  const target = {
    ref: "X.value",
    type: "Int?",
    nullable: true,
    attributes: "",
    modelAttributes: ["@@unique([value, other])", "@@index([value])"],
  };
  assert.equal(
    compareColumnDeclaration(source, target).key.targetSingleFieldUnique,
    false,
  );
  assert.equal(
    compareColumnDeclaration(source, {
      ...target,
      modelAttributes: ['@@unique([value], map: "key")'],
    }).key.targetSingleFieldUnique,
    true,
  );
  assert.equal(
    compareColumnDeclaration(source, { ...target, attributes: "@id" }).key
      .targetPrimaryKey,
    true,
  );
});

test("default literal equality does not equate UUID generation or time-zone storage semantics", () => {
  const target = {
    ref: "X.value",
    type: "String",
    nullable: false,
    attributes: '@default("IRT")',
  };
  assert.equal(
    compareColumnDeclaration(column("value TEXT DEFAULT 'IRT'"), target).default
      .comparison,
    "same-literal-declaration",
  );
  assert.equal(
    compareColumnDeclaration(column("value UUID DEFAULT gen_random_uuid()"), {
      ...target,
      attributes: "@default(uuid())",
    }).default.comparison,
    "generation-layer-differs",
  );
  assert.equal(
    compareColumnDeclaration(column("value TIMESTAMPTZ DEFAULT NOW()"), {
      ...target,
      attributes: "@default(now())",
    }).default.comparison,
    "clock-declared-storage-semantics-pending",
  );
});

test("stronger required target is a declared difference, not silent source equivalence or acceptance", () => {
  const result = compareColumnDeclaration(column("value INTEGER"), {
    ref: "X.value",
    type: "Int",
    nullable: false,
    attributes: "",
  });
  assert.equal(result.nullability.sameDeclaration, false);
  assert.equal(result.semanticAndDatabaseAccepted, false);
});

test("all fifteen ledger columns include created_by semantic alias while literal inventory stays honest", () => {
  const report = inspectDomainContracts();
  assert.equal(report.ledgerSemantic.columns.length, 15);
  const alias = report.ledgerSemantic.columns.find(
    (item) => item.sourceColumn === "created_by",
  );
  assert.equal(alias.target.ref, "LedgerEntry.createdByUserId");
  assert.match(alias.mapping, /not-literal/);
  assert.equal(
    report.sql.columns.find(
      (item) => item.source === "D4" && item.name === "created_by",
    ).targets.length,
    0,
  );
  assert(
    report.ledgerSemantic.methods.some((item) => item.name === "runNightly"),
  );
  assert(
    report.ledgerSemantic.inputs[
      "apps/api/prisma/migrations/20260813210000_phase2_transactional_integrity/migration.sql"
    ],
  );
});
test("NOT NULL, unique, numeric default and nested CHECK retain their meanings", () => {
  const item = column(
    "value INTEGER NOT NULL UNIQUE DEFAULT 4 CHECK ((value + 1) > 0),",
  );
  assert.equal(item.nullable, false);
  assert.equal(item.unique, true);
  assert.equal(item.defaultExpression, "4");
  assert.deepEqual(item.checks, ["(value + 1) > 0"]);
});
test("quoted SQL content and comments cannot invent constraints or defaults", () => {
  const item = column(
    "value TEXT DEFAULT 'NOT NULL UNIQUE CHECK (x) -- x''y', -- REFERENCES other(id)",
  );
  assert.equal(item.nullable, true);
  assert.equal(item.unique, false);
  assert.equal(item.references, null);
  assert.deepEqual(item.checks, []);
  assert.equal(item.defaultExpression, "'NOT NULL UNIQUE CHECK (x) -- x''y'");
  assert.equal(stripSqlComments("value TEXT -- DEFAULT 'x'\n"), "value TEXT");
});
test("missing defaults and nullable columns remain unknown/nullable, not fabricated", () => {
  assert.equal(column("value INTEGER,").defaultExpression, null);
  assert.equal(column("value INTEGER,").nullable, true);
});
test("unclosed SQL strings and checks fail closed", () => {
  assert.throws(() => stripSqlComments("value TEXT DEFAULT 'oops"), /Unclosed/);
  assert.throws(
    () => column("value INTEGER CHECK ((value > 0)"),
    /Unclosed SQL CHECK/,
  );
});
test("table-level and unknown column definitions are explicitly rejected", () => {
  assert.throws(
    () =>
      sqlContracts(
        "CREATE TABLE x (\n    id UUID,\n    UNIQUE (id)\n);",
        "fixture",
      ),
    /Unclassified/,
  );
  assert.throws(
    () => sqlContracts("CREATE TABLE x (\n    id UNKNOWN\n);", "fixture"),
    /Unclassified/,
  );
});
test("SQL index definition includes source table and unique semantics", () => {
  const result = sqlContracts(
    "CREATE TABLE x (\n    id UUID\n);\nCREATE UNIQUE INDEX idx ON x(id);",
    "fixture",
  );
  assert.deepEqual(result.indexes[0], {
    source: "fixture",
    name: "idx",
    table: "x",
    unique: true,
    columnsExpression: "id",
    sourceLine: 4,
  });
  assert.throws(
    () =>
      sqlContracts(
        "CREATE INDEX partial ON x(id) WHERE id IS NOT NULL;",
        "fixture",
      ),
    /Unsupported SQL index/,
  );
});
test("Prisma field mapping, model constraints and optional/list types remain distinct", () => {
  const models = prismaModels(
    'model X {\n id String @id\n userId String? @unique @map("user_id")\n children Y[]\n @@index([userId])\n @@map("xs")\n}\n',
  );
  assert.equal(models[0].table, "xs");
  assert.equal(models[0].fields[1].column, "user_id");
  assert.equal(models[0].fields[1].nullable, true);
  assert.equal(models[0].fields[2].list, true);
  assert(models[0].attributes.includes("@@index([userId])"));
});
test("D3 grouped tables versus field/enum clauses are not conflated", () => {
  const clauses = referenceModelClauses(
    "## ۲۱. مدل\n### ۲۱.۱ کاربران\nجدول‌ها:\n- `users`\nفیلدها:\n- `role`: `customer`, `admin`\n## ۲۲. API\n- `not_a_table`",
  );
  assert.deepEqual(
    clauses.map((item) => [item.kind, item.name]),
    [
      ["table", "users"],
      ["field", "role"],
    ],
  );
});
test("source dispute resolution actions map to target states, not extra states", () => {
  const rows = sourceTransitions(
    "| `disputed` | `refund_full → cancelled`, `release_to_executor → confirmed` | admin | money |\n| `cancelled` | — | — | — |\n| `confirmed` | — | — | — |",
  );
  assert.deepEqual(rows[0].targets, ["cancelled", "confirmed"]);
  assert.throws(
    () => sourceTransitions("| `x` | — | admin | — |\n| `x` | — | admin | — |"),
    /Duplicate/,
  );
  assert.throws(
    () => sourceTransitions("| `x` | `unknown_state` | admin | — |"),
    /Unknown source transition token/,
  );
});
const constants =
  "export const ORDER_TRANSITIONS = { draft: [OrderStatus.cancelled], cancelled: [] };\nexport const ORDER_TRANSITION_SOURCES = { draft: { cancelled: [OrderStatusSource.admin] } };\nexport const FINAL_ORDER_STATUSES = [OrderStatus.cancelled];";
test("AST reads only literal state declarations, never executes backend code", () => {
  assert.deepEqual(stateDeclarations(constants).ORDER_TRANSITIONS, {
    draft: ["cancelled"],
    cancelled: [],
  });
  assert.throws(
    () =>
      stateDeclarations(
        constants.replace("[OrderStatus.cancelled]", "dangerous()"),
      ),
    /Dynamic/,
  );
  assert.throws(
    () =>
      stateDeclarations(
        constants.replace("OrderStatus.cancelled", "Unknown.cancelled"),
      ),
    /Unknown enum/,
  );
});
test("missing state declarations or function definitions fail closed", () => {
  assert.throws(() => stateDeclarations("const x = {};"), /Missing ORDER/);
  assert.throws(
    () => functionEvidence("function other() {}", "isCancellable"),
    /Missing function/,
  );
});
test("helper policy is diagnostic only and unfamiliar logic requires review", () => {
  const text =
    "export function isCancellable(status) { return status !== OrderStatus.cancelled && status !== OrderStatus.closed; }";
  assert.deepEqual(
    helperCancellationStates(text, [
      "draft",
      "disputed",
      "cancelled",
      "closed",
    ]),
    ["draft", "disputed"],
  );
  assert.throws(
    () =>
      helperCancellationStates(
        "function isCancellable(status) { return true; }",
        ["draft"],
      ),
    /explicit semantic review/,
  );
});
test("real source extraction stays unaccepted and preserves source actor/financial text", () => {
  const report = inspectDomainContracts();
  assert.equal(report.phaseAccepted, false);
  assert.equal(report.databaseQueried, false);
  assert.equal(report.sql.columns.length, 120);
  assert.equal(report.stateMachine.states.length, 20);
  for (const row of report.stateMachine.states) {
    assert(row.actorCell && row.financialCell && row.sourceLine > 0);
    assert.equal(row.authorizationAndFinancialAcceptance, false);
  }
  const checks = report.sql.columns.filter((item) => item.checks.length);
  assert(
    checks.some((item) => item.source === "D1" && item.table === "reviews"),
  );
  assert(
    checks.some(
      (item) => item.source === "D4" && item.table === "ledger_entries",
    ),
  );
});
test("saved facts reject evidence drift and fabricated acceptance", () => {
  const record = JSON.parse(
    readFileSync(
      new URL("../../docs/zeus/z0-domain-review.json", import.meta.url),
      "utf8",
    ),
  );
  const report = inspectDomainContracts();
  checkDomainReview(record, report);
  const changed = structuredClone(record);
  changed.facts.stateMachine.states[0].targets = ["closed"];
  assert.throws(() => checkDomainReview(changed, report), /evidence drift/);
  assert.throws(
    () => checkDomainReview({ ...record, phaseAccepted: true }, report),
    /cannot accept Z0/,
  );
  assert.throws(
    () => checkDomainReview({ ...record, databaseQueried: true }, report),
    /DB verification/,
  );
});

test("ledger review cannot lose/duplicate columns, accept runtime or hide source migration drift", () => {
  const record = JSON.parse(
    readFileSync(
      new URL("../../docs/zeus/z0-domain-review.json", import.meta.url),
      "utf8",
    ),
  );
  const report = inspectDomainContracts();
  const missing = structuredClone(record);
  missing.ledgerReview.columns.pop();
  assert.throws(() => checkDomainReview(missing, report), /Missing\/duplicate/);
  const duplicate = structuredClone(record);
  duplicate.ledgerReview.columns[1].id = duplicate.ledgerReview.columns[0].id;
  assert.throws(
    () => checkDomainReview(duplicate, report),
    /Missing\/duplicate/,
  );
  const accepted = structuredClone(record);
  accepted.ledgerReview.runtimeAccepted = true;
  assert.throws(() => checkDomainReview(accepted, report), /runtime\/DB/);
  const changed = structuredClone(record);
  changed.facts.ledgerSemantic.inputs[
    "apps/api/prisma/migrations/20260708101803_init/migration.sql"
  ] = "unreviewed";
  assert.throws(() => checkDomainReview(changed, report), /evidence drift/);
});

test("only the scoped L02 fix can be resolved, with history and exact owner-approved source retained", () => {
  const record = JSON.parse(
    readFileSync(
      new URL("../../docs/zeus/z0-domain-review.json", import.meta.url),
      "utf8",
    ),
  );
  const report = inspectDomainContracts();
  const hidden = structuredClone(record);
  hidden.ledgerReview.openItems.pop();
  assert.throws(() => checkDomainReview(hidden, report), /history/);
  const broad = structuredClone(record);
  broad.scopedResolutions[0].noMonetaryMutation = false;
  assert.throws(() => checkDomainReview(broad, report), /Incomplete scoped/);
  const hash = structuredClone(record);
  hash.scopedResolutions[0].sourceSha256 = "unapproved";
  assert.throws(() => checkDomainReview(hash, report), /source evidence drift/);
});
