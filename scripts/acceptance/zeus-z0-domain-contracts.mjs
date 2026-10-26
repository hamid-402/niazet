import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { extractSql } from "./zeus-z0-inventory.mjs";
import { prismaFields } from "./zeus-z0-traceability.mjs";
import { matchesReconciliationApproval } from "../orbit-reconciliation-approval.mjs";

// Read-only contract extraction. SQL comments, table rows and AST declarations
// are evidence to review, never proof of DB constraints or runtime authority.
const root = fileURLToPath(new URL("../../", import.meta.url));
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const ts = apiRequire("typescript");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n");
const sha = (text) =>
  createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");

export function stripSqlComments(text) {
  let result = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "'") {
      result += text[i];
      if (quoted && text[i + 1] === "'") {
        result += text[++i];
        continue;
      }
      quoted = !quoted;
    } else if (!quoted && text.slice(i, i + 2) === "--") {
      while (i < text.length && text[i] !== "\n") i++;
      result += "\n";
    } else result += text[i];
  }
  assert(!quoted, "Unclosed SQL string");
  return result.trim().replace(/,\s*$/, "");
}

export function sqlColumnContract(column) {
  const sql = stripSqlComments(column.definition);
  const masked = sql.replace(/'(?:''|[^'])*'/g, (value) =>
    " ".repeat(value.length),
  );
  const checks = [];
  for (const match of masked.matchAll(/\bCHECK\s*\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1,
      quote = false,
      end = start;
    for (; end < sql.length && depth; end++) {
      const char = sql[end];
      if (char === "'") {
        if (quote && sql[end + 1] === "'") {
          end++;
          continue;
        }
        quote = !quote;
      } else if (!quote && char === "(") depth++;
      else if (!quote && char === ")") depth--;
    }
    assert.equal(depth, 0, "Unclosed SQL CHECK");
    checks.push(sql.slice(start, end - 1));
  }
  const reference = /\bREFERENCES\s+(\w+)\s*\((\w+)\)/.exec(masked);
  const defaultMatch = /\bDEFAULT\b/.exec(masked);
  const defaultStart = defaultMatch
    ? defaultMatch.index + defaultMatch[0].length
    : null;
  const suffix = defaultStart === null ? "" : masked.slice(defaultStart);
  const defaultEnd =
    /\b(?:NOT NULL|UNIQUE|REFERENCES|CHECK|PRIMARY KEY)\b/.exec(suffix)
      ?.index ?? suffix.length;
  return {
    name: column.name,
    sourceLine: column.line,
    type: column.type,
    nullable: !/\b(?:NOT NULL|PRIMARY KEY)\b/.test(masked),
    primaryKey: /\bPRIMARY KEY\b/.test(masked),
    unique: /\bUNIQUE\b/.test(masked),
    defaultExpression:
      defaultStart === null
        ? null
        : sql.slice(defaultStart, defaultStart + defaultEnd).trim(),
    references: reference
      ? { table: reference[1], column: reference[2] }
      : null,
    checks,
    rawDefinition: column.definition,
  };
}

export function sqlContracts(text, source) {
  const tables = extractSql(text).map((table) => ({
    source,
    table: table.table,
    sourceLine: table.fromLine,
    columns: table.columns.map(sqlColumnContract),
  }));
  // The supported source format has inline constraints only. Fail rather than
  // silently drop a future table-level constraint, multiline/unknown column.
  const lines = text.split("\n");
  for (const table of tables) {
    const original = extractSql(text).find(
      (item) => item.table === table.table,
    );
    for (let line = original.fromLine; line < original.toLine - 1; line++) {
      const value = stripSqlComments(lines[line]);
      if (value)
        assert(
          table.columns.some((column) => column.sourceLine === line + 1),
          `Unclassified SQL definition: ${source}:${line + 1}`,
        );
    }
  }
  const indexes = [
    ...text.matchAll(
      /^CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^\n]+)\);\s*$/gm,
    ),
  ].map((match) => ({
    source,
    name: match[2],
    table: match[3],
    unique: Boolean(match[1]),
    columnsExpression: match[4],
    sourceLine: text.slice(0, match.index).split("\n").length,
  }));
  assert.equal(
    indexes.length,
    (text.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/gm) ?? []).length,
    "Unsupported SQL index syntax",
  );
  return { tables, indexes };
}

export function prismaModels(text) {
  const fields = prismaFields(text);
  const models = [...text.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map(
    (match) => {
      const name = match[1],
        body = match[2];
      return {
        name,
        table: /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? name,
        attributes: body
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("@@")),
        fields: [...fields.values()]
          .filter((field) => field.ref.startsWith(`${name}.`))
          .map((field) => ({
            ...field,
            column:
              /@map\("([^"]+)"\)/.exec(field.attributes)?.[1] ??
              field.ref.slice(name.length + 1),
            nullable: field.type.endsWith("?"),
            list: field.type.endsWith("[]"),
          })),
      };
    },
  );
  assert.equal(
    new Set(models.map((model) => model.table)).size,
    models.length,
    "Duplicate mapped Prisma table",
  );
  return models;
}

export function referenceModelClauses(text) {
  const lines = text.split("\n");
  let section = "",
    kind = null;
  const clauses = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = /^### (۲۱\.[^ ]+)/.exec(lines[i]);
    if (heading) {
      section = heading[1];
      kind = null;
      continue;
    }
    if (/^## (?!۲۱\.)/.test(lines[i])) {
      section = "";
      kind = null;
    }
    if (!section) continue;
    if (/^جدول/.test(lines[i])) kind = "table";
    if (/^فیلد/.test(lines[i])) kind = "field";
    const item = /^- `(\w+)`/.exec(lines[i]);
    if (item) {
      assert(kind, `Unclassified reference-model item on line ${i + 1}`);
      clauses.push({
        source: "D3",
        section,
        kind,
        name: item[1],
        sourceLine: i + 1,
        text: lines[i],
      });
    }
  }
  return clauses;
}

function syntax(text) {
  const file = ts.createSourceFile(
    "contract.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(file.parseDiagnostics.length, 0, "Invalid TypeScript contract");
  return file;
}
export function literal(node) {
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((property) => {
        assert(
          ts.isPropertyAssignment(property),
          "Unsupported property expression",
        );
        return [
          property.name.getText().replace(/^['"]|['"]$/g, ""),
          literal(property.initializer),
        ];
      }),
    );
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isPropertyAccessExpression(node)) {
    assert(
      ["OrderStatus", "OrderStatusSource"].includes(node.expression.getText()),
      "Unknown enum reference",
    );
    return node.name.text;
  }
  throw new Error("Dynamic state declaration requires explicit review");
}
export function stateDeclarations(text) {
  const result = {};
  for (const statement of syntax(text).statements)
    if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations)
        if (
          [
            "ORDER_TRANSITIONS",
            "ORDER_TRANSITION_SOURCES",
            "FINAL_ORDER_STATUSES",
          ].includes(item.name.getText())
        ) {
          assert(item.initializer, "Missing state initializer");
          result[item.name.getText()] = literal(item.initializer);
        }
    }
  for (const name of [
    "ORDER_TRANSITIONS",
    "ORDER_TRANSITION_SOURCES",
    "FINAL_ORDER_STATUSES",
  ])
    assert(Object.hasOwn(result, name), `Missing ${name}`);
  return result;
}

export function sourceTransitions(text) {
  const rows = text.split("\n").flatMap((line, index) => {
    if (!/^\| `\w+` \|/.test(line)) return [];
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.equal(cells.length, 4, "Unsupported transition row");
    return [
      {
        from: /^`(\w+)`$/.exec(cells[0])?.[1],
        targetCell: cells[1],
        actorCell: cells[2],
        financialCell: cells[3],
        sourceLine: index + 1,
      },
    ];
  });
  assert.equal(
    rows.length,
    new Set(rows.map((row) => row.from)).size,
    "Duplicate source state",
  );
  const states = rows.map((row) => row.from);
  return rows.map((row) => {
    const tokens = [...row.targetCell.matchAll(/`([^`]+)`/g)].flatMap(
      (match) => match[1].match(/[a-z_]+/g) ?? [],
    );
    const actions = ["refund_full", "refund_partial", "release_to_executor"];
    for (const token of tokens)
      assert(
        states.includes(token) || actions.includes(token),
        `Unknown source transition token: ${token}`,
      );
    return {
      ...row,
      targets: tokens.filter((value) => states.includes(value)),
    };
  });
}

export function functionEvidence(text, name, method = false) {
  const file = syntax(text);
  let found;
  function visit(node) {
    if (
      (method
        ? ts.isMethodDeclaration(node)
        : ts.isFunctionDeclaration(node)) &&
      node.name?.getText() === name
    ) {
      assert(!found, `Ambiguous function ${name}`);
      found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert(found?.body, `Missing function ${name}`);
  return {
    line: file.getLineAndCharacterOfPosition(found.getStart(file)).line + 1,
    hash: sha(found.getText(file)),
    text: found.getText(file),
  };
}

export function helperCancellationStates(text, states) {
  const body = functionEvidence(text, "isCancellable").text;
  // Match the current simple helper exactly; do not execute imported backend.
  const match =
    /return status !== OrderStatus\.(\w+) && status !== OrderStatus\.(\w+);/.exec(
      body,
    );
  assert(
    match,
    "Cancellation helper changed; explicit semantic review required",
  );
  return states.filter((state) => ![match[1], match[2]].includes(state));
}

// Declaration comparison, never a proof that migrations were applied or that a
// mapped field preserves the source business meaning. Do not execute defaults.
export function attributeArgument(attributes, name) {
  const masked = attributes.replace(/"(?:\\.|[^"\\])*"/g, (value) =>
    " ".repeat(value.length),
  );
  const start = masked.indexOf(`@${name}(`);
  if (start < 0) return null;
  let depth = 1,
    quoted = false,
    escaped = false;
  const from = start + name.length + 2;
  for (let i = from; i < attributes.length; i++) {
    const ch = attributes[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return attributes.slice(from, i);
  }
  throw new Error(`Unclosed Prisma attribute ${name}`);
}

export function compareColumnDeclaration(column, target) {
  const field = target.ref.split(".")[1];
  const attributes = target.attributes ?? "";
  const singleModelConstraint = (kind) =>
    (target.modelAttributes ?? []).some((value) =>
      new RegExp(`^@@${kind}\\(\\[\\s*${field}\\s*\\]`).test(value),
    );
  const primaryKey =
    /(?:^|\s)@id(?:\(|\s|$)/.test(attributes) || singleModelConstraint("id");
  const unique =
    primaryKey ||
    /(?:^|\s)@unique(?:\(|\s|$)/.test(attributes) ||
    singleModelConstraint("unique");
  const targetDefault = attributeArgument(attributes, "default");
  const sourceDefault = column.defaultExpression;
  let defaultComparison = "different-declaration";
  if (sourceDefault === null && targetDefault === null)
    defaultComparison = "same-absence";
  else if (
    sourceDefault?.toUpperCase() === "NOW()" &&
    targetDefault === "now()"
  )
    defaultComparison = "clock-declared-storage-semantics-pending";
  else if (sourceDefault === "gen_random_uuid()" && targetDefault === "uuid()")
    defaultComparison = "generation-layer-differs";
  else if (sourceDefault?.startsWith("'") && targetDefault?.startsWith('"')) {
    try {
      if (
        sourceDefault.slice(1, -1).replaceAll("''", "'") ===
        JSON.parse(targetDefault)
      )
        defaultComparison = "same-literal-declaration";
    } catch {
      /* complex expression stays different */
    }
  } else if (
    sourceDefault !== null &&
    targetDefault !== null &&
    sourceDefault.toLowerCase() === targetDefault.toLowerCase()
  )
    defaultComparison = "same-literal-declaration";
  return {
    ref: target.ref,
    type: target.type,
    attributes,
    targetColumn: target.column,
    nullability: {
      sourceNullable: column.nullable,
      targetNullable: target.nullable,
      sameDeclaration: column.nullable === target.nullable,
    },
    key: {
      sourcePrimaryKey: column.primaryKey,
      targetPrimaryKey: primaryKey,
      sourceUnique: column.unique,
      targetSingleFieldUnique: unique,
      sourceUniquenessRequired: column.primaryKey || column.unique,
    },
    default: {
      sourceExpression: sourceDefault,
      targetExpression: targetDefault,
      comparison: defaultComparison,
    },
    sourceChecks: column.checks,
    relationCandidates: target.relationCandidates ?? [],
    semanticAndDatabaseAccepted: false,
  };
}

function ledgerSemanticEvidence(columns, models) {
  const alias = { "ledger_entries.created_by": "LedgerEntry.createdByUserId" };
  const ledgerFile = "apps/api/src/finance/ledger.service.ts";
  const reconciliationFile =
    "apps/api/src/finance/finance-reconciliation.service.ts";
  const files = [
    ledgerFile,
    reconciliationFile,
    "apps/api/src/app.module.ts",
    "apps/api/src/finance/finance.module.ts",
    "apps/api/src/finance/finance.admin.controller.ts",
    "apps/api/src/finance/idempotency.service.ts",
    "apps/api/src/jobs/jobs.service.ts",
    "apps/api/src/jobs/job.types.ts",
    "apps/api/src/common/utils/tehran-time.ts",
    "apps/api/prisma/migrations/20260708101803_init/migration.sql",
    "apps/api/prisma/migrations/20260813210000_phase2_transactional_integrity/migration.sql",
  ];
  const allFields = models.flatMap((model) =>
    model.fields.map((field) => ({
      ...field,
      modelAttributes: model.attributes,
      relationCandidates: model.fields.filter(
        (candidate) =>
          candidate.attributes.includes("@relation") &&
          new RegExp(
            `fields:\\s*\\[[^\\]]*\\b${field.ref.split(".")[1]}\\b`,
          ).test(candidate.attributes),
      ),
    })),
  );
  return {
    source: "D4 §2.1–2.6",
    databaseQueried: false,
    runtimeAccepted: false,
    columns: columns
      .filter((column) => column.source === "D4")
      .map((column) => {
        const explicitAlias = alias[`${column.table}.${column.name}`];
        const targets = explicitAlias
          ? allFields.filter((field) => field.ref === explicitAlias)
          : column.targets;
        assert.equal(
          targets.length,
          1,
          `Ledger semantic field missing/ambiguous: ${column.table}.${column.name}`,
        );
        return {
          sourceTable: column.table,
          sourceColumn: column.name,
          sourceLine: column.sourceLine,
          sourceType: column.type,
          sourceReferences: column.references,
          mapping: explicitAlias
            ? "explicit-semantic-alias-not-literal-column-parity"
            : "exact-column-candidate-not-business-acceptance",
          target: compareColumnDeclaration(column, targets[0]),
        };
      }),
    inputs: Object.fromEntries(files.map((file) => [file, sha(read(file))])),
    methods: [
      ...[
        "getOrCreateUserAccount",
        "postEntry",
        "postCorrection",
        "projectToWallet",
        "verifyWalletConsistency",
        "verifyAllWallets",
      ].map((name) => [ledgerFile, name]),
      ...["onModuleInit", "onModuleDestroy", "runNightly"].map((name) => [
        reconciliationFile,
        name,
      ]),
      ["apps/api/src/finance/finance.admin.controller.ts", "runReconciliation"],
      ...["execute", "replay"].map((name) => [
        "apps/api/src/finance/idempotency.service.ts",
        name,
      ]),
    ].map(([file, name]) => {
      const { text, ...evidence } = functionEvidence(read(file), name, true);
      return { file, name, ...evidence };
    }),
    limitations:
      "15 source SQL column declarations and explicit alias reviewed. Migration file hashes are evidence to inspect, not applied-DB attestation. UUID/text, timestamptz/timestamp, enum, length, CHECK/FK/delete actions, authorization, default generation and migration safety require separate acceptance. Reconciliation uses its own FinanceModule lifecycle timer outside the twelve JobRunner registrations.",
  };
}

export function inspectDomainContracts() {
  const ownerRoot =
    process.env.ZEUS_SOURCE_ROOT ??
    "C:/Users/hamid.kazemi/Desktop/project/نیازت";
  const d1 = readFileSync(resolve(ownerRoot, "ساختار کلی پروژه.md"), "utf8");
  assert.equal(
    sha(d1),
    "8b6638c8c0197629c788b97ef5dc6fdd721e95d6f40bc407899837c4946345df",
    "D1 source drift",
  );
  const d3 = read("docs/specs/architecture-v4.md"),
    d4 = read("docs/specs/addendum-state-machine-ledger.md");
  const schema = read("apps/api/prisma/schema.prisma");
  const models = prismaModels(schema),
    bindings = JSON.parse(read("docs/zeus/z0-mappings.json"));
  const modelFields = new Map(
    models.flatMap((model) =>
      model.fields.map((field) => [
        field.ref,
        {
          ...field,
          modelAttributes: model.attributes,
          relationCandidates: model.fields.filter(
            (candidate) =>
              candidate.attributes.includes("@relation") &&
              new RegExp(
                `fields:\\s*\\[[^\\]]*\\b${field.ref.split(".")[1]}\\b`,
              ).test(candidate.attributes),
          ),
        },
      ]),
    ),
  );
  const sql = [sqlContracts(d1, "D1"), sqlContracts(d4, "D4")];
  const columns = sql.flatMap((source) =>
    source.tables.flatMap((table) =>
      table.columns.map((column) => {
        const binding =
          table.source === "D1"
            ? bindings.sql.find(
                (item) =>
                  item.table === table.table && item.column === column.name,
              )
            : null;
        const exact =
          models
            .find((model) => model.table === table.table)
            ?.fields.filter((field) => field.column === column.name) ?? [];
        const targets =
          table.source === "D1"
            ? (binding?.targets ?? [])
            : exact.map((field) => field.ref);
        return {
          source: table.source,
          table: table.table,
          ...column,
          targets: targets.map((ref) => {
            assert(modelFields.has(ref), `Unknown mapped field ${ref}`);
            return modelFields.get(ref);
          }),
          constraintAcceptance: "pending-db-migration-dto-and-behavior-review",
        };
      }),
    ),
  );
  const referenceClauses = referenceModelClauses(d3);
  const reference = referenceClauses.map((clause) => ({
    ...clause,
    candidates:
      clause.kind === "table"
        ? models
            .filter((model) => model.table === clause.name)
            .map((model) => model.name)
        : models
            .filter((model) =>
              referenceClauses.some(
                (item) =>
                  item.kind === "table" &&
                  item.section === clause.section &&
                  item.name === model.table,
              ),
            )
            .flatMap((model) =>
              model.fields
                .filter(
                  (field) =>
                    field.column === clause.name ||
                    field.ref.split(".")[1] ===
                      clause.name.replace(/_([a-z])/g, (_, char) =>
                        char.toUpperCase(),
                      ),
                )
                .map((field) => field.ref),
            ),
    acceptance: "pending-semantic-and-constraint-review",
  }));
  const stateFile = "apps/api/src/orders/order-state-machine.ts",
    serviceFile = "apps/api/src/orders/orders.service.ts";
  const stateText = read(stateFile),
    actual = stateDeclarations(stateText),
    sourceRows = sourceTransitions(d4);
  assert.deepEqual(
    Object.keys(actual.ORDER_TRANSITIONS).sort(),
    sourceRows.map((row) => row.from).sort(),
    "Order state inventory drift",
  );
  const states = sourceRows.map((row) => ({
    ...row,
    actualTargets: actual.ORDER_TRANSITIONS[row.from],
    actualSources: actual.ORDER_TRANSITION_SOURCES[row.from] ?? {},
    targetSetMatches:
      JSON.stringify([...row.targets].sort()) ===
      JSON.stringify([...actual.ORDER_TRANSITIONS[row.from]].sort()),
    authorizationAndFinancialAcceptance: false,
  }));
  const permissive = helperCancellationStates(
    stateText,
    sourceRows.map((row) => row.from),
  );
  const serviceText = read(serviceFile);
  const functions = [
    "transition",
    "cancelByCustomer",
    "cancelByAdmin",
    "resolveDispute",
  ].map((name) => ({
    name,
    file: serviceFile,
    ...functionEvidence(serviceText, name, true),
  }));
  const workflowFile = "apps/api/src/orders/domain/order-workflow.service.ts";
  const workflowText = read(workflowFile);
  functions.push({
    name: "transition",
    file: workflowFile,
    ...functionEvidence(workflowText, "transition", true),
  });
  const disputes =
    /عمداً از این جدول عمومی حذف شده/.test(stateText) &&
    actual.ORDER_TRANSITIONS.disputed.length > 0;
  return {
    schemaVersion: 1,
    kind: "read-only-static-contract-review",
    phaseAccepted: false,
    databaseQueried: false,
    files: {
      [stateFile]: sha(stateText),
      [serviceFile]: sha(serviceText),
      [workflowFile]: sha(workflowText),
      "apps/api/prisma/schema.prisma": sha(schema),
      "docs/specs/architecture-v4.md": sha(d3),
      "docs/specs/addendum-state-machine-ledger.md": sha(d4),
    },
    sql: {
      sources: sql,
      columns,
      note: "Constraint declarations/candidates only; no DB constraint or DTO equivalence accepted",
    },
    referenceModel: reference,
    ledgerSemantic: ledgerSemanticEvidence(columns, models),
    stateMachine: {
      states,
      finalStates: actual.FINAL_ORDER_STATUSES,
      functions,
      cancellationHelperWithoutTableEdge: permissive.filter(
        (state) => !actual.ORDER_TRANSITIONS[state].includes("cancelled"),
      ),
      disputedCommentContradictsArray: disputes,
      sourceCancellationContradiction:
        d4.includes("از هر وضعیت غیرنهایی") &&
        sourceRows.some(
          (row) =>
            !["cancelled", "closed"].includes(row.from) &&
            !row.targets.includes("cancelled"),
        ),
      note: "Row actor cells combine operations; target-set parity never accepts per-edge actor/scope/ownership/QC/money. Helpers/comments are not proof of reachable authorization.",
    },
  };
}

export function reviewFacts(report) {
  return {
    inputs: report.files,
    sourceSql: report.sql.sources,
    mappedColumnCandidates: report.sql.columns.map((column) => ({
      source: column.source,
      table: column.table,
      column: column.name,
      targets: column.targets.map((target) => ({
        ref: target.ref,
        type: target.type,
        attributes: target.attributes,
        modelAttributes: target.modelAttributes,
        relationCandidates: target.relationCandidates.map((item) => ({
          ref: item.ref,
          attributes: item.attributes,
        })),
      })),
      constraintAcceptance: column.constraintAcceptance,
    })),
    referenceModel: report.referenceModel,
    ledgerSemantic: report.ledgerSemantic,
    stateMachine: {
      ...report.stateMachine,
      functions: report.stateMachine.functions.map(
        ({ text, ...evidence }) => evidence,
      ),
    },
  };
}

export function checkDomainReview(record, report) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.phaseAccepted, false, "Static review cannot accept Z0");
  assert.equal(
    record.databaseQueried,
    false,
    "Static review cannot claim DB verification",
  );
  assert.deepEqual(
    record.facts,
    reviewFacts(report),
    "Saved source/code contract evidence drift",
  );
  assert.equal(record.findings.length, 4);
  for (const finding of record.findings) {
    assert(
      finding.id &&
        finding.description &&
        finding.nextStep &&
        finding.runtimeAcceptance === false,
      "Finding cannot silently accept runtime behavior",
    );
  }
  assert(
    record.ledgerReview &&
      record.ledgerReview.runtimeAccepted === false &&
      record.ledgerReview.databaseQueried === false,
    "Ledger review cannot invent runtime/DB acceptance",
  );
  assert.deepEqual(
    record.ledgerReview.columns.map((item) => item.id).sort(),
    report.ledgerSemantic.columns
      .map((item) => `${item.sourceTable}.${item.sourceColumn}`)
      .sort(),
    "Missing/duplicate ledger column review",
  );
  for (const column of record.ledgerReview.columns)
    assert(
      column.interpretation &&
        column.testsNeeded?.length &&
        column.accepted === false,
      "Incomplete/accepted ledger column review",
    );
  assert(
    record.ledgerReview.openItems.length > 0,
    "Ledger open items cannot be discarded",
  );
  for (const item of record.ledgerReview.openItems)
    assert(
      item.id && item.risk && item.nextStep && item.accepted === false,
      "Incomplete/accepted ledger open item",
    );
  assert(
    Array.isArray(record.scopedResolutions) &&
      record.scopedResolutions.length === 1,
    "Only one scoped resolution has been accepted",
  );
  assert.deepEqual(
    [...record.ledgerReview.openItems, ...record.scopedResolutions]
      .map((item) => item.id)
      .sort(),
    ["Z0-LEDGER-L01", "Z0-LEDGER-L02", "Z0-LEDGER-L03", "Z0-LEDGER-L04"],
    "Ledger finding history must not be lost or duplicated",
  );
  const resolution = record.scopedResolutions[0];
  assert(
    resolution.id === "Z0-LEDGER-L02" &&
      resolution.packet === "ZEUS-EXEC-004" &&
      resolution.status === "accepted-for-scoped-diagnosis-only" &&
      resolution.noMonetaryMutation === true &&
      resolution.postgresCases === 8 &&
      resolution.temporaryDatabaseRemoved === true &&
      resolution.mainDatabaseConnected === false &&
      resolution.historicalRisk &&
      resolution.approval &&
      resolution.change &&
      resolution.evidence?.length === 4 &&
      resolution.limits,
    "Incomplete scoped diagnosis resolution",
  );
  const ledgerPath = "apps/api/src/finance/ledger.service.ts";
  assert.equal(
    resolution.sourceSha256,
    report.ledgerSemantic.inputs[ledgerPath],
    "Scoped resolution source evidence drift",
  );
  assert(
    matchesReconciliationApproval(ledgerPath, read(ledgerPath)),
    "Scoped resolution must match owner-approved source pin",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = inspectDomainContracts();
    if (process.argv.includes("--check"))
      checkDomainReview(
        JSON.parse(read("docs/zeus/z0-domain-review.json")),
        report,
      );
    if (process.argv.includes("--json"))
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    else
      console.log(
        JSON.stringify({
          staticContractReview: "passed",
          sqlTables: report.sql.sources.reduce(
            (n, item) => n + item.tables.length,
            0,
          ),
          sqlColumns: report.sql.columns.length,
          sqlIndexes: report.sql.sources.reduce(
            (n, item) => n + item.indexes.length,
            0,
          ),
          referenceTables: report.referenceModel.filter(
            (item) => item.kind === "table",
          ).length,
          referenceFields: report.referenceModel.filter(
            (item) => item.kind === "field",
          ).length,
          referenceTablesWithoutExactTarget: report.referenceModel
            .filter((item) => item.kind === "table" && !item.candidates.length)
            .map((item) => item.name),
          states: report.stateMachine.states.length,
          targetSetMatches: report.stateMachine.states.filter(
            (item) => item.targetSetMatches,
          ).length,
          cancellationHelperWithoutTableEdge:
            report.stateMachine.cancellationHelperWithoutTableEdge,
          disputedCommentContradictsArray:
            report.stateMachine.disputedCommentContradictsArray,
          sourceCancellationContradiction:
            report.stateMachine.sourceCancellationContradiction,
          phaseOrBehaviorAccepted: false,
        }),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
