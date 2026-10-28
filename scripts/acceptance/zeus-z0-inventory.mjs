import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Read-only inventory: emits JSON or checks the saved ledger; never writes files,
// starts services, changes credentials or touches the database.
const root = fileURLToPath(new URL("../../", import.meta.url));
const ownerRoot =
  process.env.ZEUS_SOURCE_ROOT ?? "C:/Users/hamid.kazemi/Desktop/project/نیازت";
const sources = [
  [
    "D1",
    "ساختار کلی پروژه.md",
    "8b6638c8c0197629c788b97ef5dc6fdd721e95d6f40bc407899837c4946345df",
    null,
  ],
  [
    "D2",
    "دیاگرام نیازت.png",
    "5a833dfd3bfa35a44ab89b0e3d6d31c13e8089386b2e457b4e18f1b5ee73e92a",
    null,
  ],
  [
    "D3",
    "niazat_master_final_architecture_v4.md",
    "8b06ad2ed04f16877b62b0084ba6472720f064c6b9f2210cd7fd46811c62569a",
    "docs/specs/architecture-v4.md",
  ],
  [
    "D4",
    "niazat_v4_addendum_state_machine_ledger.md",
    "b0bf6394e0f2efaa1aa91d9534b112f713dba525cb2fa8ad660d1859f1e785ae",
    "docs/specs/addendum-state-machine-ledger.md",
  ],
  [
    "D5",
    "niazat_final_ui_pages_blueprint_v2.md",
    "f36c6f3bd21884f9f3e82d4c75ffdeeb4c9014c7e773564bc0f97a845088ad18",
    "docs/specs/ui-pages-blueprint-v2.md",
  ],
];
const sha = (value) => createHash("sha256").update(value).digest("hex");
const normalized = (value) => value.replace(/\r\n/g, "\n").trim();

export function extractSql(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^CREATE TABLE (\w+)\s*\($/.exec(lines[i]);
    if (!match) continue;
    const start = i;
    const columns = [];
    for (i++; i < lines.length && !/^\);\s*$/.test(lines[i]); i++) {
      const column =
        /^\s+(\w+)\s+(UUID|VARCHAR(?:\(\d+\))?|TEXT|JSONB|INTEGER|BOOLEAN|TIMESTAMPTZ|DATE|DECIMAL\(\d+,\d+\))(?=\s|,|$)/.exec(
          lines[i],
        );
      if (column)
        columns.push({ name: column[1], type: column[2], line: i + 1 });
    }
    assert(i < lines.length, `Unclosed SQL table: ${match[1]}`);
    for (let n = 0; n < columns.length; n++) {
      const from = columns[n].line - 1;
      const to = n + 1 < columns.length ? columns[n + 1].line - 1 : i;
      columns[n].definition = lines.slice(from, to).join("\n").trim();
      columns[n].mappingStatus = "pending";
    }
    assert.equal(
      new Set(columns.map((c) => c.name)).size,
      columns.length,
      "Duplicate SQL column",
    );
    tables.push({
      table: match[1],
      source: "D1",
      fromLine: start + 1,
      toLine: i + 1,
      columns,
    });
  }
  return tables;
}

export function extractTree(text) {
  const lines = text.split(/\r?\n/);
  const stack = ["niazat"];
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^([│ ]*)(?:├──|└──)\s+([^#]+?)(?:\s+#.*)?$/.exec(lines[i]);
    if (!match) continue;
    const depth = match[1].length / 4;
    assert(Number.isInteger(depth), `Invalid tree indentation at ${i + 1}`);
    const name = match[2].trim();
    stack[depth + 1] = name.replace(/\/$/, "");
    stack.length = depth + 2;
    entries.push({
      path: stack.join("/"),
      kind: name.endsWith("/") ? "directory" : "file",
      sourceLine: i + 1,
      mappingStatus: "pending",
    });
  }
  assert.equal(
    new Set(entries.map((e) => e.path)).size,
    entries.length,
    "Duplicate tree path",
  );
  return entries;
}

export function extractApis(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match =
      /^\s*(?:-\s+`)?(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/v1\/[^\s`]+)/.exec(
        line,
      );
    return match
      ? [
          {
            method: match[1],
            path: match[2],
            sourceLine: index + 1,
            mappingStatus: "pending",
          },
        ]
      : [];
  });
}

function inventory() {
  const buffers = new Map();
  const sourceRecords = sources.map(
    ([id, filename, expectedHash, repoCopy]) => {
      const bytes = readFileSync(resolve(ownerRoot, filename));
      assert.equal(sha(bytes), expectedHash, `Owner source changed: ${id}`);
      buffers.set(id, bytes);
      const text = id === "D2" ? null : bytes.toString("utf8");
      if (repoCopy)
        assert.equal(
          normalized(text),
          normalized(readFileSync(resolve(root, repoCopy), "utf8")),
          `Repo copy differs: ${id}`,
        );
      const headings = text
        ? text
            .split(/\r?\n/)
            .flatMap((line, index) =>
              /^#{1,6} /.test(line) ? [{ line: index + 1, heading: line }] : [],
            )
        : [];
      return {
        id,
        ownerFilename: filename,
        sha256: expectedHash,
        bytes: bytes.length,
        repoCopy,
        headings,
        semanticMappingStatus: "pending",
      };
    },
  );
  const roadmap = readFileSync(resolve(root, "docs/ZEUS_ROADMAP.md"), "utf8");
  const requirements = new Map();
  for (const line of roadmap.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const id = cells[1];
    const match = /^(ZEUS-(?:UI-\d{3}|OPS-\d{3})) ·/.exec(id ?? "");
    const canonical = match?.[1] ?? id;
    if (
      !/^(?:[A-H]\d{2}|T\d{2}|API\d{2}|ZEUS-(?:V4-\d{3}|ADD-[SL]\d{2}|API4-\d{3}|UI-\d{3}|OPS-\d{3}))$/.test(
        canonical ?? "",
      )
    )
      continue;
    const row = requirements.get(canonical) ?? {
      id: canonical,
      roadmapRowHashes: [],
      acceptance: "unaccepted",
      codeMapping: [],
      tests: [],
    };
    row.roadmapRowHashes.push(sha(line));
    requirements.set(canonical, row);
  }
  const d1 = buffers.get("D1").toString("utf8");
  const sql = extractSql(d1);
  const tree = extractTree(d1);
  const apis = extractApis(d1);
  const v4Apis = extractApis(buffers.get("D3").toString("utf8"));
  assert.equal(sql.length, 11);
  assert.equal(
    sql.reduce((sum, table) => sum + table.columns.length, 0),
    105,
  );
  assert.equal(apis.length, 29);
  assert.equal(new Set(apis.map((a) => `${a.method} ${a.path}`)).size, 29);
  assert.equal(v4Apis.length, 55);
  for (const [prefix, expected] of [
    ["API", apis],
    ["ZEUS-API4-", v4Apis],
  ]) {
    const actual = roadmap.split(/\r?\n/).flatMap((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      const pattern = prefix === "API" ? /^API\d{2}$/ : /^ZEUS-API4-\d{3}$/;
      return pattern.test(cells[1] ?? "")
        ? [{ method: cells[2], path: cells[3] }]
        : [];
    });
    assert.deepEqual(
      actual,
      expected.map(({ method, path }) => ({ method, path })),
      `Source/roadmap API mismatch: ${prefix}`,
    );
  }
  assert.equal(requirements.size, 351);
  const decisionLedger = JSON.parse(
    readFileSync(resolve(root, "docs/zeus/z0-decisions.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(decisionLedger.decisions).sort(),
    Array.from(
      { length: 16 },
      (_, i) => `DEC${String(i + 1).padStart(2, "0")}`,
    ).sort(),
    "All sixteen target decisions must be recorded",
  );
  assert.equal(
    decisionLedger.phaseAccepted,
    false,
    "Decisions alone cannot accept Z0",
  );
  return {
    schemaVersion: 1,
    purpose:
      "Z0 source/index baseline; not complete atomic traceability or product acceptance",
    acceptedZeusPhases: 0,
    scope:
      "Local Z0 inventory only; no migration, provider or product changes authorized here",
    decisionAuthority: {
      date: "2026-10-24",
      ordinaryProductChoices:
        "Explicitly delegated by owner; select and document professional defaults without repeated product questionnaires",
      separateAuthority:
        "Protected-workflow exceptions, production data changes, live connections/costs and material financial/security/permission changes still require scoped authority; delegation does not bypass preservation controls",
    },
    ownerDecisions: JSON.parse(
      readFileSync(resolve(root, "docs/zeus/z0-decisions.json"), "utf8"),
    ).decisions,
    sources: sourceRecords,
    requirements: [...requirements.values()],
    d1Sql: sql,
    d1Tree: tree,
    d1Apis: apis,
    v4Apis,
    remaining: [
      "D2 atomic visual elements and edge semantics; major-group associations live in z0-mappings.json",
      "Atomic subrequirements across D1-D5; 72 legacy/10 technical/118 tree and D3/D4/D5 associations are not atomic acceptance",
      "Complete code/role/API/test evidence beyond structural associations in z0-mappings.json; source/code SQL and state facts in z0-domain-review.json are not DB/runtime acceptance",
      "All sixteen target decisions recorded in z0-decisions.json; scoped runtime implementation and final contract review remain separate",
      "Z0 acceptance",
    ],
  };
}

function selfTests() {
  const sql =
    "CREATE TABLE x (\n    id UUID PRIMARY KEY,\n    rating INTEGER NOT NULL\n      CHECK (rating BETWEEN 1 AND 5)\n);";
  assert.match(extractSql(sql)[0].columns[1].definition, /CHECK/);
  assert.throws(() => extractSql("CREATE TABLE x (\n    id UUID"), /Unclosed/);
  assert.throws(
    () => extractSql("CREATE TABLE x (\n    id UUID,\n    id UUID\n);"),
    /Duplicate/,
  );
  assert.deepEqual(
    extractTree("├── app/\n│   └── main.py").map((e) => e.path),
    ["niazat/app", "niazat/app/main.py"],
  );
  assert.equal(
    extractApis("  POST /api/v1/orders # example")[0].path,
    "/api/v1/orders",
  );
  assert.equal(extractApis("This POST /api/v1/orders is prose.").length, 0);
  assert.equal(
    extractSql(
      "CREATE TABLE x (\n    rate DECIMAL(5,2),\n    name VARCHAR(100)\n);",
    )[0].columns[0].type,
    "DECIMAL(5,2)",
  );
  assert.equal(
    extractSql("CREATE TABLE x (\n    name VARCHAR(100)\n);")[0].columns[0]
      .type,
    "VARCHAR(100)",
  );
  assert.equal(
    extractApis("- `GET /api/v1/customer/orders`")[0].path,
    "/api/v1/customer/orders",
  );
  return 9;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const selfTestCount = selfTests();
    const current = inventory();
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
    } else {
      const saved = JSON.parse(
        readFileSync(resolve(root, "docs/zeus/z0-inventory.json"), "utf8"),
      );
      assert.deepEqual(
        saved,
        current,
        "Z0 inventory drift: review source/roadmap changes; do not blindly regenerate acceptance",
      );
      console.log(
        `Zeus Z0 inventory passed: ${current.sources.length} source hashes, ${current.requirements.length} canonical IDs, 11 SQL tables/105 columns, ${current.d1Tree.length} tree paths, 29/55 source APIs; ${selfTestCount} parser self-tests. Product/Z0 acceptance not implied.`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
