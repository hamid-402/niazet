import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectDomainContracts,
  prismaModels,
  compareColumnDeclaration,
} from "./zeus-z0-domain-contracts.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const ts = createRequire(resolve(root, "apps/api/package.json"))("typescript");
const read = (file) =>
  readFileSync(resolve(root, file), "utf8").replaceAll("\r\n", "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const json = (file) => JSON.parse(read(file));

// Statement lexer, not a PostgreSQL executor. Semicolons inside quoted strings,
// dollar bodies, line comments and nested block comments are not boundaries.
export function sqlStatements(text) {
  const result = [];
  let buffer = "",
    line = 1,
    startLine = 1,
    quote = null,
    dollar = null,
    commentDepth = 0,
    lineComment = false;
  const append = (char) => {
    if (!buffer.trim() && char.trim()) startLine = line;
    buffer += char;
  };
  const flush = () => {
    if (buffer.trim())
      result.push({
        line: startLine,
        sql: buffer.trim(),
        hash: hash(buffer.trim()),
      });
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i],
      pair = text.slice(i, i + 2);
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        append("\n");
        line++;
      }
      continue;
    }
    if (commentDepth) {
      if (pair === "/*") {
        commentDepth++;
        i++;
      } else if (pair === "*/") {
        commentDepth--;
        i++;
        if (!commentDepth) append(" ");
      } else if (char === "\n") {
        line++;
        append("\n");
      }
      continue;
    }
    if (dollar) {
      if (text.startsWith(dollar, i)) {
        append(dollar);
        i += dollar.length - 1;
        dollar = null;
      } else {
        append(char);
        if (char === "\n") line++;
      }
      continue;
    }
    if (quote) {
      append(char);
      if (char === quote) {
        if (text[i + 1] === quote) {
          append(text[++i]);
        } else quote = null;
      }
      if (char === "\n") line++;
      continue;
    }
    if (pair === "--") {
      lineComment = true;
      i++;
      continue;
    }
    if (pair === "/*") {
      commentDepth = 1;
      i++;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      append(char);
      continue;
    }
    const tag =
      char === "$"
        ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))?.[0]
        : null;
    if (tag) {
      dollar = tag;
      append(tag);
      i += tag.length - 1;
      continue;
    }
    if (char === ";") {
      append(char);
      flush();
    } else {
      append(char);
      if (char === "\n") line++;
    }
  }
  assert(
    !quote && !dollar && commentDepth === 0,
    "Unclosed SQL string/dollar/comment",
  );
  assert(
    !buffer.trim(),
    "Nonterminated SQL statement requires explicit review",
  );
  return result;
}
export function classifyStatement(statement) {
  const sql = statement.sql;
  const kind =
    /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(TYPE|TABLE|INDEX|FUNCTION|TRIGGER|EXTENSION)\b/i
      .exec(sql)?.[1]
      ?.toLowerCase() ??
    /^ALTER\s+(TABLE|TYPE|INDEX)\b/i
      .exec(sql)?.[1]
      ?.toLowerCase()
      .replace(/^/, "alter-") ??
    /^DROP\s+(INDEX|TRIGGER|FUNCTION)\b/i
      .exec(sql)?.[1]
      ?.toLowerCase()
      .replace(/^/, "drop-") ??
    (/^(?:BEGIN|COMMIT|ROLLBACK)\s*;$/i.test(sql)
      ? "transaction-control"
      : /^DO\s+\$/i.test(sql)
        ? "procedural-compatibility"
        : /^WITH\b[\s\S]*\)\s*UPDATE\s+"/i.test(sql)
          ? "with-data-update"
          : /^(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b/i
              .exec(sql)?.[1]
              ?.toLowerCase()
              .replaceAll(/\s+/g, "-"));
  assert(
    kind,
    `Unsupported migration syntax at line ${statement.line}: ${sql.slice(0, 80)}`,
  );
  const tables = [
    ...new Set(
      [
        ...sql.matchAll(
          /\b(?:TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?|REFERENCES|FROM|INTO|UPDATE|ON)\s+"([A-Za-z_]\w*)"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  return {
    ...statement,
    kind,
    tables,
    dataChange: [
      "update",
      "with-data-update",
      "insert-into",
      "delete-from",
      "procedural-compatibility",
    ].includes(kind),
    databaseExecuted: false,
  };
}
const tablePolicies = {
  users: [
    "Identity",
    "Keep current ids, mobile login and four roles/capabilities; source UUID versus Prisma TEXT/uuid client default is an explicit storage deviation, not type parity. Email optional contact until separately verified/unique; pending/active/blocked and OTP/session are domain transitions.",
    "apps/api/src/auth/dto/register.dto.ts",
    "apps/api/src/auth/dto/otp.dto.ts",
    "apps/api/src/auth/dto/password-reset.dto.ts",
    "apps/api/src/users/dto/user.dto.ts",
    "apps/api/src/account/dto/account.dto.ts",
  ],
  services: [
    "Catalog",
    "ServiceLine consolidates source services; fixed/formula/manual_quote not interchangeable. Missing source surcharge/sort fields have explicit versioned target disposition; current0/30/80 estimate is not binding policy snapshot. Preserve inactive/history and old order form/specification.",
    "apps/api/src/catalog/dto/service.dto.ts",
    "apps/api/src/pricing/dto/calculate-price.dto.ts",
  ],
  orders: [
    "Order aggregate",
    "Twenty-state machine supersedes simple source statuses without dropping quote/QC/revision/dispute. Keep all ids/codes DEC07; final price integer Toman server-owned, snapshots immutable; missing deadline/base/surcharge/notes target additive and old unknown stays unknown.",
    "apps/api/src/orders/dto/order.dto.ts",
  ],
  order_files: [
    "File lifecycle",
    "OrderFile metadata references owned uploader/order and clean scan. Storage key not public URL; source URL fields transform to authorized short-lived grants. Content/role-kind/assignment/visibility checks cannot be replaced by FK or MIME string.",
    "apps/api/src/files/files.controller.ts",
  ],
  order_messages: [
    "Conversation",
    "OrderMessage scoped to order, actual sender and customer_visible/internal_only enum; source is_internal Boolean requires explicit transformation. Attachment URL becomes owned clean OrderFile FK; no client author/role injection.",
    "apps/api/src/orders/dto/order.dto.ts",
  ],
  payments: [
    "Payment",
    "Payment callbacks verify stored authority/amount/provider and payload-bound idempotency. Single transaction/ledger proof, late money reconciliation and immutable order amounts; source status/provider strings translated deliberately, live acceptance deferred.",
    "apps/api/src/orders/dto/order.dto.ts",
    "apps/api/src/finance/dto/finance.dto.ts",
  ],
  wallets: [
    "Projection",
    "Wallet.balance is integer cache derived from balanced append-only Ledger, not mutable user credit. Currency IRT/Toman explicit; source defaults never justify funding account. Charge/spend/reserve target DEC06 with no negative/race/replay acceptance inferred.",
    "apps/api/src/finance/dto/finance.dto.ts",
  ],
  tickets: [
    "Support clock",
    "Own optional order/public handler; assigned support with separate actor. New target first meaningful public response4 working hours under versioned Sat-Thu09-18 Tehran calendar; old SLA unchanged. Missing sla_hours/customer_rating are explicit future fields/relations, not existing behavior.",
    "apps/api/src/tickets/dto/ticket.dto.ts",
  ],
  ticket_messages: [
    "Support message",
    "Customer public message vs assigned support internal/public reply; enum visibility transforms source Boolean. Attachments owned/clean and projected safely; meaningful public first response distinct from bot/internal note. Real server reason/body normalization still target.",
    "apps/api/src/tickets/dto/ticket.dto.ts",
  ],
  reviews: [
    "Feedback/privacy",
    "Feedback consolidates order/team/executor/support/QC rating/complaint/thanks; rating1..5 integer DTO is not proof of DB CHECK. Source is_public DEFAULT TRUE overridden by approved optional moderated publication DEC03; never mass-publish legacy feedback or leak staff internal id.",
    "apps/api/src/feedback/dto/feedback.dto.ts",
  ],
  notifications: [
    "Outbox/channel",
    "NotificationLog + Outbox + preference/channel delivery separate source notification concept; sentAt/readAt/provider delivery not interchangeable. Typed consent, dedupe retry/dead-letter and safe payload; GET defaults not proof of live Push/SMS/email.",
    "apps/api/src/notifications/dto/notification-preference.dto.ts",
  ],
  ledger_accounts: [
    "Ledger accounts",
    "Unique owner or typed system account, explicit null owner/system semantics; account_type enum not arbitrary 'wallet' alias. No auto historic account repair; approved missing-account packet only diagnoses nonzero cache discrepancy.",
    "apps/api/src/finance/dto/finance.dto.ts",
  ],
  ledger_entries: [
    "Immutable journal",
    "Positive amount/distinct debit-credit accounts/restrict FK and append-only triggers in migration, wallet projection tx, created_by alias, currency/reference/idempotency semantics explicit. Current correction fingerprint/lineage gap and reconciliation force cache remain open; never update/delete old journal.",
    "apps/api/src/finance/dto/finance.dto.ts",
  ],
};
const migrationPolicies = {
  "20260708101803_init":
    "Initial enum/table/index/FK declarations; TEXT identifiers often client-generated UUID, no physical UUID parity claim.",
  "20260708103639_qc_review_reviewer_optional":
    "Make QC reviewer nullable; actual human reviewer/independence still command-level requirement.",
  "20260813120000_secure_refresh_rotation":
    "Session family/rotation/security and login attempts; preserve existing rotation/revocation, do not restore plaintext refresh.",
  "20260813150000_file_cleanup_tracking":
    "Signed grant usage/revocation/cleanup tracking; do not delete shared/user files by broad path.",
  "20260813190000_escrow_balance_tracking":
    "Distributed balance counters, nonnegative/released+refunded checks and existing-row backfill; historic migration not a fresh authority to rewrite money.",
  "20260813210000_phase2_transactional_integrity":
    "Order versions/snapshots, idempotency scopes/fingerprint, financial checks/FK and append-only triggers. Existing backfilled keys not a new request fingerprint proof.",
  "20260813230000_ticket_file_relation":
    "Ticket attachment FK to files; FK alone is not clean/owned/customer-visible validation.",
  "20260813231500_versioned_order_reports":
    "Report versions and unique order/type/version; writer aggregate+1 still requires race handling.",
  "20260813232000_notification_outbox_compatibility_prepare":
    "Conditional compatibility prepare for fresh vs already migrated DB; preserve canonical data, do not edit migration history.",
  "20260813233000_notification_preferences":
    "Per-user channel preference defaults; keep consent/outbox delivery separate.",
  "20260813234000_notification_outbox_compatibility_handoff":
    "Conditional rename protects canonical background-contract order; DO block treated as one statement, not individually executed fragments.",
  "20260813235000_customer_profile_privacy":
    "Profile/billing snapshot/privacy requests; deletion is pending human request, FK Restrict preserves history, no unique pending request invariant yet.",
  "20260813235900_feedback_reference_tracking":
    "Feedback public tracking code and status/backfill; internal target remains private, publication not automatic.",
  "20260814001000_executor_workflow":
    "Assignment acceptance/checklist schema; preserves active assignment eligibility and history.",
  "20260814002000_backfill_executor_acceptance":
    "Existing heuristic infers acceptedAt from assignedAt for active progressed orders; not independent proof of historical explicit acceptance. Preserve history; new backfills must use owner-approved reliable evidence, never repeat heuristic silently.",
  "20260814010000_phase3_background_contract":
    "Outbox consumer/delivery, JobRun and signed-grant background contracts; neither SQL presence nor unique index proves global job lease/HTTP delivery.",
  "20260814011000_notification_outbox_compatibility_finalize":
    "Normalize legacy notification index to canonical per-event/channel unique index after handoff; this file drops an index, not user rows or a compatibility column. No rerun by review tool.",
  "20260829120000_phase5_staff_operations":
    "Staff skill/access/attendance/shaba management with Audit; no public internal HR projection.",
  "20260829143000_phase5_performance_snapshots":
    "Period snapshots and unique profile/period; unknown samples must not be treated as certain zero quality after DEC16 target change.",
  "20260829170000_phase5_staff_risk_alerts":
    "Unique profile/risk type and actor acknowledgement; alerts suggestion only, no automatic adverse staffing action.",
  "20260903080000_phase8_cleanup_retention":
    "Cleanup signed expiry/retention configuration; eligible object ownership/checksum/references must precede deletion. No cleanup job invoked in Z0.",
  "20260907133000_external_onboarding_reviews":
    "Versioned evidence/review records for gated external onboarding; row-lock/state/self-review command safeguards retained.",
  "20260907150000_customer_organizations":
    "Org membership/teams/subscription snapshots and composite order-team/org FK/check; no platform role escalation or implicit paid subscription.",
};

function dtoDeclarations(file) {
  const source = ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(source.parseDiagnostics.length, 0);
  return source.statements
    .filter(
      (node) =>
        ts.isClassDeclaration(node) && /Dto$/.test(node.name?.text ?? ""),
    )
    .map((node) => ({
      file,
      name: node.name.text,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      hash: hash(node.getText(source)),
      extends:
        node.heritageClauses?.map((clause) => clause.getText(source)) ?? [],
      fields: node.members.filter(ts.isPropertyDeclaration).map((field) => ({
        name: field.name.getText(source),
        type: field.type?.getText(source) ?? null,
        decorators: (ts.getDecorators(field) ?? []).map((decorator) =>
          decorator.getText(source),
        ),
        syntacticallyOptional: Boolean(field.questionToken),
      })),
    }));
}
export function buildSchemaReview() {
  const domain = inspectDomainContracts(),
    handoff = json("docs/zeus/z0-execution-contract.json");
  const schema = read("apps/api/prisma/schema.prisma"),
    models = prismaModels(schema);
  const dirs = readdirSync(resolve(root, "apps/api/prisma/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    dirs,
    Object.keys(migrationPolicies).sort(),
    "Unreviewed/new migration",
  );
  const migrations = dirs.map((name) => {
    const file = `apps/api/prisma/migrations/${name}/migration.sql`,
      statements = sqlStatements(read(file)).map(classifyStatement);
    return {
      name,
      file,
      sha256: hash(read(file)),
      policy: migrationPolicies[name],
      statements,
      executed: false,
    };
  });
  const tables = [...new Set(domain.sql.columns.map((column) => column.table))];
  assert.deepEqual(
    tables.slice().sort(),
    Object.keys(tablePolicies).sort(),
    "Unreviewed source table",
  );
  const dtoFiles = [
    ...new Set(Object.values(tablePolicies).flatMap(([, , ...files]) => files)),
  ].sort();
  const dtos = dtoFiles.flatMap(dtoDeclarations);
  const enums = [...schema.matchAll(/^enum (\w+) \{\n([\s\S]*?)^\}/gm)].map(
    (match) => ({
      name: match[1],
      values: match[2]
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) => line && !line.startsWith("//") && !line.startsWith("@@"),
        )
        .map((line) => line.split(/\s+/)[0]),
      declarationHash: hash(match[0]),
    }),
  );
  const columns = domain.sql.columns.map((column) => {
    const card = handoff.columns.find(
      (item) => item.id === `${column.source}:${column.table}.${column.name}`,
    );
    assert(card, "Missing source-column disposition");
    const semanticAlias =
      column.source === "D4" &&
      column.table === "ledger_entries" &&
      column.name === "created_by"
        ? "LedgerEntry.createdByUserId"
        : null;
    const aliasModel = semanticAlias
      ? models.find((model) => model.name === "LedgerEntry")
      : null;
    const aliasField = aliasModel?.fields.find(
      (field) => field.ref === semanticAlias,
    );
    if (semanticAlias) assert(aliasField, "Missing explicit created_by alias");
    const targets = semanticAlias
      ? [
          {
            ...aliasField,
            modelAttributes: aliasModel.attributes,
            relationCandidates: aliasModel.fields.filter((field) =>
              field.attributes.includes("fields: [createdByUserId]"),
            ),
          },
        ]
      : column.targets;
    return {
      id: card.id,
      sourceContract: card.sourceContract,
      sourceLine: column.sourceLine,
      tablePolicy: column.table,
      targetMappingKind: semanticAlias
        ? "explicit-semantic-alias-source-name-differs"
        : "declared-candidates-or-explicit-absence",
      targets: targets.map((target) => {
        const model = models.find(
          (item) => item.name === target.ref.split(".")[0],
        );
        assert(model);
        const evidence = migrations.flatMap((migration) =>
          migration.statements
            .filter((statement) => statement.tables.includes(model.table))
            .map((statement) => ({
              file: migration.file,
              line: statement.line,
              kind: statement.kind,
              hash: statement.hash,
            })),
        );
        assert(evidence.length, `No migration support for ${target.ref}`);
        return {
          ...target,
          physicalTable: model.table,
          declarationComparison: compareColumnDeclaration(
            column,
            target,
            schema,
          ),
          migrationStatementRefs: evidence,
        };
      }),
      missingOrDifferentDisposition: card.disposition,
      dtoFiles: tablePolicies[column.table].slice(2),
      testsRequired: [
        "Declared type/null/default/key/FK/CHECK versus isolated migrated DB, not only Prisma syntax",
        "Scoped normalized DTO/domain command and safe output projection; negative ownership/enum/bounds",
        "Additive migration/backfill with proven source or explicit unknown; preserve all legacy ids/financial history",
      ],
      databaseAccepted: false,
      status:
        "source-and-target-contract-reviewed-implementation-tests-pending",
    };
  });
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    kind: "source-schema-dto-migration-contract-review",
    phaseAccepted: false,
    databaseAccepted: false,
    databaseQueried: false,
    sourceHashes: {
      "apps/api/prisma/schema.prisma": hash(schema),
      ...Object.fromEntries(dtoFiles.map((file) => [file, hash(read(file))])),
    },
    tablePolicies: Object.fromEntries(
      Object.entries(tablePolicies).map(
        ([name, [area, contract, ...files]]) => [
          name,
          { area, contract, dtoFiles: files },
        ],
      ),
    ),
    columns,
    enums,
    dtos,
    migrations,
    referenceModel: handoff.referenceClauses,
    stateMachine: domain.stateMachine,
    limits:
      "All120 source SQL columns and13 source table policies, declaration constraints and23 historical migration files are reviewed as planning evidence; every SQL statement retained/classified including procedural bodies/data backfill. This is not a migration dry-run, live DB inspection, physical-type parity, validated existing data or permission to modify/replay historical SQL. D3 reference model consolidated aliases remain explicit and runtime acceptance false.",
  };
}
export function checkSchemaReview(record, expected = buildSchemaReview()) {
  assert.equal(record.phaseAccepted, false);
  assert.equal(record.databaseAccepted, false);
  assert.equal(record.databaseQueried, false);
  assert.deepEqual(record, expected, "Schema/DTO/migration/source drift");
  assert.equal(record.columns.length, 120);
  assert.equal(record.migrations.length, 23);
  assert(
    record.migrations.every(
      (migration) =>
        migration.policy && !migration.executed && migration.statements.length,
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const review = buildSchemaReview();
  if (process.argv.includes("--json")) console.log(JSON.stringify(review));
  else {
    if (process.argv.includes("--check"))
      checkSchemaReview(json("docs/zeus/z0-schema-review.json"), review);
    console.log(
      JSON.stringify({
        columns: review.columns.length,
        tables: Object.keys(review.tablePolicies).length,
        enums: review.enums.length,
        dtos: review.dtos.length,
        migrationFiles: review.migrations.length,
        sqlStatements: review.migrations.reduce(
          (n, item) => n + item.statements.length,
          0,
        ),
        databaseAccepted: false,
        phaseAccepted: false,
      }),
    );
  }
}
