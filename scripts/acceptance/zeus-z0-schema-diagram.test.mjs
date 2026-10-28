import assert from "node:assert/strict";
import test from "node:test";
import {
  sqlStatements,
  classifyStatement,
  buildSchemaReview,
  checkSchemaReview,
} from "./zeus-z0-schema-review.mjs";
import {
  buildDiagramReview,
  checkDiagramReview,
} from "./zeus-z0-diagram-review.mjs";

test("SQL lexer retains function/DO body semicolons and quoted comment-like content", () => {
  const rows = sqlStatements(
    `-- header\nCREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN RAISE EXCEPTION 'x;y'; END; $body$ LANGUAGE plpgsql;\nDO $$ BEGIN PERFORM 1; END $$;\nCREATE TABLE "a;b" ("value" TEXT DEFAULT 'x;--y''z');`,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => classifyStatement(row).kind),
    ["function", "procedural-compatibility", "table"],
  );
  assert.equal(rows[0].line, 2);
  assert.match(rows[2].sql, /x;--y''z/);
});
test("SQL lexer supports nested block comments without swallowing statements", () => {
  const rows = sqlStatements(
    `/* outer /* nested ; */ outer */\nBEGIN;\nALTER TABLE "orders" ADD COLUMN "x" INTEGER; -- ignored ;\nCOMMIT;`,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => classifyStatement(row).kind),
    ["transaction-control", "alter-table", "transaction-control"],
  );
});
for (const value of [
  "SELECT 'unterminated;",
  "DO $$ BEGIN;",
  "/* not closed",
  "CREATE TABLE x (id INT)",
])
  test(`SQL lexer rejects incomplete source ${value.slice(0, 18)}`, () =>
    assert.throws(() => sqlStatements(value)));
test("unknown migration operation fails closed; WITH UPDATE is explicitly a data change", () => {
  assert.throws(
    () => classifyStatement(sqlStatements("VACUUM users;")[0]),
    /Unsupported/,
  );
  const statement = classifyStatement(
    sqlStatements(
      'WITH ranked AS (SELECT "id" FROM "orders") UPDATE "orders" SET "version"=1;',
    )[0],
  );
  assert.equal(statement.kind, "with-data-update");
  assert.equal(statement.dataChange, true);
  assert.equal(statement.databaseExecuted, false);
});
const schema = buildSchemaReview();
test("all120 columns preserve exact constraints and23 migrations/348 statements without execution", () => {
  checkSchemaReview(schema);
  assert.equal(schema.columns.length, 120);
  assert.equal(Object.keys(schema.tablePolicies).length, 13);
  assert.equal(schema.migrations.length, 23);
  assert.equal(
    schema.migrations.reduce(
      (n, migration) => n + migration.statements.length,
      0,
    ),
    348,
  );
  assert(
    schema.migrations.every((migration) =>
      migration.statements.every(
        (statement) => statement.databaseExecuted === false,
      ),
    ),
  );
  assert.equal(schema.enums.length, 46);
  assert.equal(schema.dtos.length, 54);
});
test("every target field has physical table migration references; absent fields keep dispositions", () => {
  assert(
    schema.columns.every((column) =>
      column.targets.every(
        (target) =>
          target.physicalTable && target.migrationStatementRefs.length,
      ),
    ),
  );
  const absent = schema.columns.filter((column) => !column.targets.length);
  assert.equal(absent.length, 12);
  assert(absent.every((column) => column.missingOrDifferentDisposition));
});
test("database append-only checks are declaration evidence, not inferred from DTO only", () => {
  const statements = schema.migrations.flatMap(
    (migration) => migration.statements,
  );
  assert(
    statements.some(
      (statement) =>
        statement.kind === "trigger" &&
        statement.sql.includes("ledger_entries_append_only"),
    ),
  );
  assert(
    statements.some((statement) =>
      statement.sql.includes("ledger_entries_amount_positive"),
    ),
  );
  assert.equal(schema.databaseAccepted, false);
});
test("historical heuristic backfill is explicitly not new reliable acceptance proof", () => {
  const migration = schema.migrations.find(
    (migration) =>
      migration.name === "20260814002000_backfill_executor_acceptance",
  );
  assert.match(migration.policy, /heuristic/);
  assert(migration.statements.some((statement) => statement.dataChange));
  assert.equal(migration.executed, false);
});
test("source default public review does not become approved auto-publication", () => {
  const column = schema.columns.find(
    (column) => column.id === "D1:reviews.is_public",
  );
  assert.equal(column.targets.length, 0);
  assert.match(schema.tablePolicies.reviews.contract, /never mass-publish/);
});
test("DTO inheritance and decorators remain explicit rather than erasing inherited validation", () => {
  const dto = schema.dtos.find((dto) => dto.name === "ResetPasswordDto");
  assert(dto.extends.some((text) => text.includes("RequestPasswordResetDto")));
  assert(
    dto.fields
      .find((field) => field.name === "password")
      .decorators.some((text) => text.includes("MinLength")),
  );
});
for (const [name, mutate] of [
  [
    "DB acceptance",
    (r) => {
      r.databaseAccepted = true;
    },
  ],
  [
    "omitted SQL statement",
    (r) => {
      r.migrations[0].statements.pop();
    },
  ],
  [
    "lost constraint",
    (r) => {
      r.columns[0].sourceContract.nullable = true;
    },
  ],
])
  test(`schema review rejects ${name}`, () => {
    const changed = structuredClone(schema);
    mutate(changed);
    assert.throws(() => checkSchemaReview(changed, schema));
  });

const diagram = buildDiagramReview();
test("all51 diagram boxes/135 indexed items/30role actions/28relations have reviewed meaning", () => {
  checkDiagramReview(diagram);
  assert.equal(diagram.nodes.length, 51);
  assert(
    diagram.nodes.every(
      (node) =>
        node.meaning && node.requirements.length && !node.productAccepted,
    ),
  );
});
test("ambiguous directions stay unclaimed but target flows no longer have unknown permission meaning", () => {
  for (const id of ["D2-E15", "D2-E16", "D2-E20"]) {
    const edge = diagram.edges.find((edge) => edge.id === id);
    assert.equal(edge.visualDirectionClaim, false);
    assert(edge.meaning.targetFlows.length >= 2);
    assert.match(edge.authority, /No grouped/);
  }
});
test("diagram preserves missing decline, three-stage form, all states and actual XLSX target", () => {
  assert.match(
    diagram.nodes.find((node) => node.id === "D2-R02").meaning,
    /Decline is a separate target gap/,
  );
  assert.match(
    diagram.nodes.find((node) => node.id === "D2-P06").meaning,
    /three logical stages/,
  );
  assert.match(
    diagram.nodes.find((node) => node.id === "D2-C05").meaning,
    /twenty-state/,
  );
  assert.match(
    diagram.nodes.find((node) => node.id === "D2-X06").meaning,
    /CSV is not XLSX/,
  );
});
test("diagram source/text drift and fake product parity cannot pass semantic gate", () => {
  const changed = structuredClone(diagram);
  changed.nodes.pop();
  assert.throws(() => checkDiagramReview(changed, diagram));
  assert.throws(() =>
    checkDiagramReview({ ...diagram, productAccepted: true }, diagram),
  );
});
