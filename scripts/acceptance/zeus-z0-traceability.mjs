import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requireApi = createRequire(resolve(root, "apps/api/package.json"));
const ts = requireApi("typescript");
const hash = (text) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const portable = (path) => path.split(sep).join("/");

function decorators(node, source) {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).map((nodeDecorator) => {
    const expression = nodeDecorator.expression;
    if (!ts.isCallExpression(expression))
      return {
        name: expression.getText(source),
        args: [],
        text: nodeDecorator.getText(source),
      };
    return {
      name: expression.expression.getText(source),
      args: [...expression.arguments],
      text: nodeDecorator.getText(source),
    };
  });
}

function literalPath(decorator, source) {
  if (!decorator.args.length) return "";
  assert.equal(
    decorator.args.length,
    1,
    `Unsupported route arguments: ${decorator.text}`,
  );
  assert(
    ts.isStringLiteralLike(decorator.args[0]),
    `Dynamic route needs explicit review: ${decorator.args[0].getText(source)}`,
  );
  return decorator.args[0].text;
}

export function controllerRoutes(text, filename = "fixture.ts") {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(
    source.parseDiagnostics.length,
    0,
    `TypeScript syntax error: ${filename}`,
  );
  const result = [];
  for (const node of source.statements) {
    if (!ts.isClassDeclaration(node)) continue;
    const classDecorators = decorators(node, source);
    const controller = classDecorators.find((d) => d.name === "Controller");
    if (!controller) continue;
    const prefix = literalPath(controller, source);
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodDecorators = decorators(member, source);
      const routes = methodDecorators.filter((d) =>
        [
          "Get",
          "Post",
          "Put",
          "Patch",
          "Delete",
          "Head",
          "Options",
          "All",
        ].includes(d.name),
      );
      for (const route of routes) {
        assert.notEqual(
          route.name,
          "All",
          "All-method route requires explicit review",
        );
        const suffix = literalPath(route, source);
        result.push({
          method: route.name.toUpperCase(),
          path: `/${[prefix, suffix].filter(Boolean).join("/")}`.replace(
            /\/{2,}/g,
            "/",
          ),
          file: filename,
          line:
            source.getLineAndCharacterOfPosition(member.getStart(source)).line +
            1,
          className: node.name?.text ?? "",
          handler: member.name.getText(source),
          classDecorators: classDecorators.map((d) => d.text),
          methodDecorators: methodDecorators.map((d) => d.text),
          methodHash: hash(member.getText(source)),
        });
      }
    }
  }
  return result;
}

export function prismaFields(text) {
  const result = new Map();
  const lines = text.split(/\r?\n/);
  let model = null;
  for (let i = 0; i < lines.length; i++) {
    const start = /^model (\w+) \{/.exec(lines[i]);
    if (start) {
      model = start[1];
      continue;
    }
    if (/^}/.test(lines[i])) {
      model = null;
      continue;
    }
    if (!model) continue;
    const field = /^\s+(\w+)\s+([\w?\[\]]+)(.*)$/.exec(lines[i]);
    if (!field) continue;
    const key = `${model}.${field[1]}`;
    assert(!result.has(key), `Duplicate Prisma field: ${key}`);
    result.set(key, {
      ref: key,
      type: field[2],
      attributes: field[3].trim(),
      file: "apps/api/prisma/schema.prisma",
      line: i + 1,
    });
  }
  return result;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

// Source-line accounting only. A list item/paragraph can contain multiple atomic
// requirements; assigning it to a packet never accepts its meaning or behavior.
export function sourceLineIndex(text) {
  let section = "0";
  const sections = new Set(["0"]);
  const headings = [];
  const lines = [];
  const asciiDigits = (value) =>
    value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  for (const [offset, raw] of text.split(/\r?\n/).entries()) {
    const heading = /^#{1,6}\s+/.test(raw);
    if (heading) {
      const numbered = /^#{2,6}\s+(\d+(?:\.\d+)*)(?:\.)?(?:\s|$)/.exec(
        asciiDigits(raw),
      );
      if (numbered) {
        section = numbered[1];
        assert(
          !sections.has(section),
          `Duplicate numbered section: ${section}`,
        );
        sections.add(section);
      }
      headings.push({ line: offset + 1, section, text: raw });
      continue;
    }
    const trimmed = raw.trim();
    if (
      !trimmed ||
      /^[-*_]{3,}$/.test(trimmed) ||
      /^\|[\s|:-]+\|$/.test(trimmed)
    )
      continue;
    lines.push({ line: offset + 1, section, text: raw, sha256: hash(raw) });
  }
  return { sections: [...sections], headings, lines };
}

export function inspectUiPackets(
  bindings,
  baseline,
  sourceText = read("docs/specs/ui-pages-blueprint-v2.md"),
) {
  const index = sourceLineIndex(sourceText);
  assert.equal(bindings.uiPackets?.length, 50, "Missing UI packets");
  const expectedIds = baseline.requirements
    .filter((r) => /^ZEUS-UI-\d{3}$/.test(r.id))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(
    bindings.uiPackets.map((r) => r.id).sort(),
    expectedIds,
    "UI packet ID mismatch",
  );
  const apiById = new Map(bindings.api.map((r) => [r.id, r]));
  const uiRows = bindings.uiPackets.map((packet) => {
    assert.equal(
      packet.capabilityAcceptance,
      "pending-review",
      "Static UI map cannot accept capability",
    );
    assert.equal(
      packet.layoutAcceptance,
      "pending-review",
      "Static UI map cannot accept layout",
    );
    assert.equal(
      packet.behaviorAcceptance,
      "pending-tests",
      "Static UI map cannot accept behavior",
    );
    assert.equal(
      packet.acceptedCommit,
      null,
      "Static UI map cannot claim an accepted commit",
    );
    assert(
      packet.sourceSections.length &&
        packet.sourceSections.every((s) => index.sections.includes(s)),
      `Unknown UI source section: ${packet.id}`,
    );
    assert(
      packet.roleScopeReview &&
        packet.changeReview &&
        packet.testPlan.length >= 2,
      `Missing UI policy/test plan: ${packet.id}`,
    );
    assert(
      packet.codeFiles.length && packet.regressionCandidates.length,
      `Missing UI code/test candidate: ${packet.id}`,
    );
    for (const file of [...packet.codeFiles, ...packet.regressionCandidates])
      assert(read(file).length > 0, `Missing UI reference: ${file}`);
    for (const decision of packet.decisions)
      assert(
        /^DEC(?:0[1-9]|1[0-6])$/.test(decision),
        `Unknown UI decision: ${decision}`,
      );
    const apiReferences = packet.apiRefs.map((id) => {
      assert(apiById.has(id), `Unknown UI API reference: ${id}`);
      const api = apiById.get(id);
      return {
        id,
        declaredTargets: api.targets,
        classification: api.mappingKind,
        consumedByUiProven: false,
      };
    });
    const roadmapLines = read("docs/ZEUS_ROADMAP.md").split(/\r?\n/);
    const roadmapLine = roadmapLines.findIndex((line) =>
      line.startsWith(`| ${packet.id} ·`),
    );
    assert(roadmapLine >= 0, `Missing UI roadmap row: ${packet.id}`);
    const phases = [
      ...new Set(
        roadmapLines[roadmapLine].split("|")[1].match(/\bZ\d\b/g) ?? [],
      ),
    ];
    assert(phases.length, `Missing UI phases: ${packet.id}`);
    return {
      ...packet,
      roadmapLine: roadmapLine + 1,
      roadmapRowHash: hash(roadmapLines[roadmapLine]),
      phases,
      apiReferences,
      codeFiles: packet.codeFiles.map((file) => ({
        file,
        sha256: hash(read(file)),
      })),
      atomicCoverageAccepted: false,
    };
  });
  assert.equal(
    bindings.d5ContextSections?.length,
    6,
    "Missing D5 context classifications",
  );
  assert.equal(
    new Set(bindings.d5ContextSections.map((c) => c.section)).size,
    6,
    "Duplicate D5 context classification",
  );
  for (const context of bindings.d5ContextSections) {
    assert(
      index.sections.includes(context.section) && context.kind && context.note,
      "Invalid D5 context classification",
    );
    for (const file of context.preservedCodeFiles ?? [])
      assert(
        read(file).length > 0,
        `Missing preserved D5 capability reference: ${file}`,
      );
  }
  const related = (actual, selected) =>
    actual === selected || actual.startsWith(`${selected}.`);
  const lines = index.lines.map((line) => {
    const packetIds = uiRows
      .filter((p) =>
        p.sourceSections.some((section) => related(line.section, section)),
      )
      .map((p) => p.id);
    const contexts = bindings.d5ContextSections.filter((c) =>
      related(line.section, c.section),
    );
    assert(
      packetIds.length || contexts.length,
      `Unclassified D5 source line: ${line.line} (${line.section})`,
    );
    return {
      ...line,
      packetIds,
      contexts: contexts.map((c) => c.kind),
      atomicAcceptance: "pending",
    };
  });
  return {
    source: "D5",
    interpretation:
      "Every significant source line is assigned by reviewed section to packets/context; not atomic semantic coverage, UI consumption proof or acceptance",
    packets: uiRows,
    contextSections: bindings.d5ContextSections,
    headings: index.headings,
    sourceLines: lines,
    atomicCoverageAccepted: false,
  };
}

export function inspectDomainPackets(bindings, baseline, sourceOverrides = {}) {
  assert.equal(bindings.domainPackets?.length, 120, "Missing domain packets");
  const expectedIds = baseline.requirements
    .filter((r) => /^ZEUS-(?:V4-\d{3}|ADD-[SL]\d{2})$/.test(r.id))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(
    bindings.domainPackets.map((p) => p.id).sort(),
    expectedIds,
    "Domain packet ID mismatch",
  );
  const uiIds = new Set(bindings.uiPackets.map((p) => p.id));
  const roadmap = read("docs/ZEUS_ROADMAP.md").split(/\r?\n/);
  const sources = ["D3", "D4"].map((source) => {
    const sourceRecord = baseline.sources.find((s) => s.id === source);
    const index = sourceLineIndex(
      sourceOverrides[source] ?? read(sourceRecord.repoCopy),
    );
    const packets = bindings.domainPackets
      .filter((p) => p.source === source)
      .map((packet) => {
        assert.equal(
          packet.acceptance,
          "pending-atomic-contract-and-behavior-review",
          "Static domain map cannot accept behavior",
        );
        assert.equal(
          packet.acceptedCommit,
          null,
          "Static domain map cannot claim an accepted commit",
        );
        assert(
          packet.sourceSections.length &&
            packet.sourceSections.every((s) => index.sections.includes(s)),
          `Unknown domain source section: ${packet.id}`,
        );
        assert(
          packet.note &&
            packet.codeFiles.length &&
            packet.regressionCandidates.length,
          `Missing domain code/test qualification: ${packet.id}`,
        );
        for (const file of [
          ...packet.codeFiles,
          ...packet.regressionCandidates,
        ])
          assert(read(file).length > 0, `Missing domain reference: ${file}`);
        for (const id of packet.uiRefs)
          assert(uiIds.has(id), `Unknown domain UI reference: ${id}`);
        for (const decision of packet.decisions)
          assert(
            /^DEC(?:0[1-9]|1[0-6])$/.test(decision),
            `Unknown domain decision: ${decision}`,
          );
        const roadmapRows = roadmap.flatMap((line, i) =>
          line.split("|")[1]?.trim() === packet.id
            ? [{ line: i + 1, text: line, sha256: hash(line) }]
            : [],
        );
        assert(roadmapRows.length, `Missing domain roadmap row: ${packet.id}`);
        return {
          ...packet,
          roadmapRows,
          codeFiles: packet.codeFiles.map((file) => ({
            file,
            sha256: hash(read(file)),
          })),
          uiReuseMeansBehaviorAccepted: false,
          atomicCoverageAccepted: false,
        };
      });
    assert.equal(
      packets.length,
      source === "D3" ? 100 : 20,
      `Domain/source count mismatch: ${source}`,
    );
    const contexts = bindings.domainContextSections.filter(
      (c) => c.source === source,
    );
    assert(contexts.length, `Missing domain context: ${source}`);
    assert.equal(
      new Set(contexts.map((c) => c.section)).size,
      contexts.length,
      "Duplicate domain context",
    );
    for (const context of contexts) {
      assert(
        index.sections.includes(context.section) &&
          context.kind &&
          context.note,
        "Invalid domain context",
      );
      for (const id of context.uiRefs ?? [])
        assert(uiIds.has(id), `Unknown domain context UI reference: ${id}`);
    }
    const related = (actual, selected) =>
      actual === selected || actual.startsWith(`${selected}.`);
    const lines = index.lines.map((line) => {
      const packetIds = packets
        .filter((p) => p.sourceSections.some((s) => related(line.section, s)))
        .map((p) => p.id);
      const kinds = contexts
        .filter((c) => related(line.section, c.section))
        .map((c) => c.kind);
      assert(
        packetIds.length || kinds.length,
        `Unclassified ${source} source line: ${line.line} (${line.section})`,
      );
      return {
        ...line,
        packetIds,
        contexts: kinds,
        atomicAcceptance: "pending",
      };
    });
    return {
      source,
      packets,
      contextSections: contexts,
      headings: index.headings,
      sourceLines: lines,
      interpretation:
        "Reviewed section-level source-line assignment only; every subrequirement, model constraint, transition, actor and financial effect still needs atomic behavioral evidence",
      atomicCoverageAccepted: false,
    };
  });
  return sources;
}

// Deliberately stat only: templates may be referenced, but private environment
// files must never be read, hashed or printed by a source-mapping control.
function referencedArtifact(path) {
  const absolute = resolve(root, path);
  const fromRoot = portable(relative(root, absolute));
  assert(
    fromRoot && !fromRoot.startsWith("../") && !/^[A-Za-z]:/.test(fromRoot),
    `Out-of-project artifact: ${path}`,
  );
  const base = path.split(/[\\/]/).at(-1);
  assert(
    !base.startsWith(".env") || base.endsWith(".example"),
    `Private environment reference is forbidden: ${path}`,
  );
  const stat = statSync(absolute);
  assert(stat.isFile() || stat.isDirectory(), `Unsupported artifact: ${path}`);
  return {
    path,
    kind: stat.isDirectory() ? "directory" : "file",
    existenceOnly: true,
    behaviorAccepted: false,
  };
}

export function inspectLegacyPackets(bindings, baseline) {
  assert.equal(
    bindings.legacyPackets?.length,
    82,
    "Missing legacy/technical packets",
  );
  const expected = baseline.requirements
    .filter((r) => /^(?:[A-H]\d{2}|T\d{2})$/.test(r.id))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(
    bindings.legacyPackets.map((p) => p.id).sort(),
    expected,
    "Legacy packet ID mismatch",
  );
  const ui = new Map(bindings.uiPackets.map((p) => [p.id, p]));
  const tree = new Map(baseline.d1Tree.map((p) => [p.path, p]));
  const api = new Map(
    baseline.d1Apis.map((p, i) => [`API${String(i + 1).padStart(2, "0")}`, p]),
  );
  const diagram = new Map(bindings.diagram.elements.map((p) => [p.id, p]));
  const tables = new Map(baseline.d1Sql.map((t) => [t.table, t]));
  const fields = new Map(
    baseline.d1Sql.flatMap((t) =>
      t.columns.map((c) => [`${t.table}.${c.name}`, c]),
    ),
  );
  const ownerSource = baseline.sources.find((s) => s.id === "D1");
  const ownerRoot =
    process.env.ZEUS_SOURCE_ROOT ??
    "C:/Users/hamid.kazemi/Desktop/project/نیازت";
  const sourceBytes = readFileSync(
    resolve(ownerRoot, ownerSource.ownerFilename),
  );
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    ownerSource.sha256,
    "D1 owner source changed",
  );
  const sourceLines = sourceBytes.toString("utf8").split(/\r?\n/);
  const sectionNames = {
    tree: "## فولدربندی پروژه",
    sql: "## اسکیمای دیتابیس PostgreSQL",
    pricing: "## منطق قیمت‌گذاری — سرویس Pricing",
    apis: "## API Endpoints اصلی",
    "same-day": "## گزینه «همان روز» در فرم سفارش",
  };
  const sectionSpans = new Map(
    Object.entries(sectionNames).map(([key, heading]) => {
      const first = ownerSource.headings.find((h) => h.heading === heading);
      assert(first, `Unknown D1 heading: ${heading}`);
      const next = ownerSource.headings.find(
        (h) => h.line > first.line && /^## /.test(h.heading),
      );
      return [
        key,
        {
          heading,
          fromLine: first.line,
          toLine: next ? next.line - 1 : sourceLines.length,
        },
      ];
    }),
  );
  const resolveSource = (ref) => {
    const colon = ref.indexOf(":");
    assert(colon > 0, `Invalid legacy source reference: ${ref}`);
    const type = ref.slice(0, colon);
    const key = ref.slice(colon + 1);
    if (type === "d2") {
      const element = diagram.get(`D2-${key}`);
      assert(element, `Unknown legacy diagram reference: ${ref}`);
      return {
        source: "D2",
        ref,
        elementId: element.id,
        label: element.label,
        subItems: element.subItems,
        atomicAcceptance: "pending",
      };
    }
    let details;
    if (type === "tree") {
      const row = tree.get(`niazat/${key}`);
      assert(row, `Unknown legacy tree reference: ${ref}`);
      details = {
        sourcePath: row.path,
        fromLine: row.sourceLine,
        toLine: row.sourceLine,
      };
    } else if (type === "api") {
      const row = api.get(key);
      assert(row, `Unknown legacy API reference: ${ref}`);
      details = {
        method: row.method,
        path: row.path,
        fromLine: row.sourceLine,
        toLine: row.sourceLine,
      };
    } else if (type === "table") {
      const row = tables.get(key);
      assert(row, `Unknown legacy SQL table: ${ref}`);
      details = { table: key, fromLine: row.fromLine, toLine: row.toLine };
    } else if (type === "field") {
      const row = fields.get(key);
      assert(row, `Unknown legacy SQL field: ${ref}`);
      details = {
        field: key,
        definition: row.definition,
        fromLine: row.line,
        toLine: row.line + row.definition.split("\n").length - 1,
      };
    } else if (type === "section") {
      assert(sectionSpans.has(key), `Unknown legacy source section: ${ref}`);
      details = sectionSpans.get(key);
    } else assert.fail(`Unknown legacy reference kind: ${ref}`);
    assert(
      details.fromLine >= 1 && details.toLine <= sourceLines.length,
      `Legacy source bounds: ${ref}`,
    );
    return {
      source: "D1",
      ref,
      ...details,
      sourceExcerpt: sourceLines
        .slice(details.fromLine - 1, details.toLine)
        .join("\n"),
      atomicAcceptance: "pending",
    };
  };
  const roadmap = read("docs/ZEUS_ROADMAP.md").split(/\r?\n/);
  const packets = bindings.legacyPackets.map((packet) => {
    assert.equal(
      packet.acceptance,
      "pending-source-contract-and-behavior-review",
      "Static legacy mapping cannot accept behavior",
    );
    assert.equal(
      packet.acceptedCommit,
      null,
      "Static legacy mapping cannot claim accepted commit",
    );
    assert(
      packet.sourceRefs.length && packet.note && packet.testPlan,
      `Missing legacy qualification: ${packet.id}`,
    );
    const inherited = packet.reuseUi.map((id) => {
      assert(ui.has(id), `Unknown legacy UI reference: ${id}`);
      return ui.get(id);
    });
    const codeFiles = [
      ...new Set([
        ...packet.codeFiles,
        ...inherited.flatMap((p) => p.codeFiles),
      ]),
    ];
    const regressionCandidates = [
      ...new Set([
        ...packet.regressionCandidates,
        ...inherited.flatMap((p) => p.regressionCandidates),
      ]),
    ];
    assert(
      codeFiles.length && regressionCandidates.length,
      `Missing legacy code/test candidate: ${packet.id}`,
    );
    const codeArtifacts = codeFiles.map(referencedArtifact);
    for (const file of regressionCandidates) referencedArtifact(file);
    for (const decision of packet.decisions)
      assert(
        /^DEC(?:0[1-9]|1[0-6])$/.test(decision),
        `Unknown legacy decision: ${decision}`,
      );
    const rowIndex = roadmap.findIndex(
      (line) => line.split("|")[1]?.trim() === packet.id,
    );
    assert(rowIndex >= 0, `Missing legacy roadmap row: ${packet.id}`);
    const phases = /^T/.test(packet.id)
      ? ["Z8", "Z9"]
      : [...new Set(roadmap[rowIndex].split("|")[3].match(/\bZ\d\b/g) ?? [])];
    assert(phases.length, `Missing legacy phase: ${packet.id}`);
    return {
      ...packet,
      sourceEvidence: packet.sourceRefs.map(resolveSource),
      codeArtifacts,
      regressionCandidates,
      phases,
      roadmapLine: rowIndex + 1,
      roadmapRowHash: hash(roadmap[rowIndex]),
      atomicCoverageAccepted: false,
    };
  });
  assert.equal(
    bindings.treeMappings?.length,
    118,
    "Missing legacy tree mappings",
  );
  assert.deepEqual(
    bindings.treeMappings.map((t) => t.sourcePath).sort(),
    [...tree.keys()].sort(),
    "Legacy tree source mismatch",
  );
  const treeMappings = bindings.treeMappings.map((mapping) => {
    assert.equal(
      mapping.sourceKind,
      tree.get(mapping.sourcePath).kind,
      "Legacy tree kind mismatch",
    );
    assert.equal(
      mapping.acceptance,
      "pending-responsibility-and-behavior-review",
      "Static tree mapping cannot accept behavior",
    );
    assert.equal(
      mapping.acceptedCommit,
      null,
      "Static tree mapping cannot claim accepted commit",
    );
    assert(
      mapping.targets.length && mapping.classification && mapping.note,
      `Missing tree qualification: ${mapping.sourcePath}`,
    );
    assert.equal(
      mapping.decision,
      "DEC01",
      "Tree mapping must disclose stack decision",
    );
    return {
      ...mapping,
      sourceLine: tree.get(mapping.sourcePath).sourceLine,
      targetArtifacts: mapping.targets.map(referencedArtifact),
      literalCorrespondenceAccepted: false,
      behaviorAccepted: false,
    };
  });
  return {
    source: "D1/D2",
    packets,
    treeMappings,
    sectionSpans: Object.fromEntries(sectionSpans),
    interpretation:
      "82 reviewed legacy/technical associations and 118 source paths; not atomic requirement coverage, literal tree equality or behavior acceptance",
    atomicCoverageAccepted: false,
  };
}

export function inspectDiagramRelations(bindings, baseline) {
  const relations = bindings.diagramRelations;
  assert.equal(relations?.source, "D2", "Missing diagram relations");
  assert.equal(
    relations.fullDiagramAtomicAcceptance,
    false,
    "Static diagram relations cannot accept full coverage",
  );
  const nodes = new Map(bindings.diagram.elements.map((e) => [e.id, e]));
  const criteria = new Set(baseline.requirements.map((r) => r.id));
  for (const [id, members] of Object.entries(relations.groupNodes)) {
    assert(
      id.startsWith("GROUP-") &&
        members.length &&
        members.every((m) => nodes.has(m)),
      `Unknown diagram group member: ${id}`,
    );
  }
  assert.equal(
    relations.roleActions.length,
    30,
    "Missing diagram role actions",
  );
  assert.equal(
    new Set(relations.roleActions.map((a) => a.id)).size,
    30,
    "Duplicate diagram action ID",
  );
  for (const action of relations.roleActions) {
    const role = nodes.get(action.sourceRole);
    assert(
      role?.group === "roles",
      `Unknown diagram role: ${action.sourceRole}`,
    );
    assert.equal(
      role.subItems[action.sourceSubItemIndex],
      action.sourceText,
      "Diagram action source drift",
    );
    assert(
      action.sourceText &&
        action.action &&
        action.testPlan &&
        action.note &&
        action.criterionRefs.length,
      "Missing diagram action qualification",
    );
    assert.equal(
      action.acceptance,
      "pending-role-command-and-visibility-tests",
      "Static diagram action cannot accept behavior",
    );
    for (const ref of action.criterionRefs)
      assert(criteria.has(ref), `Unknown diagram action criterion: ${ref}`);
  }
  for (const role of [...nodes.values()].filter((e) => e.group === "roles")) {
    role.subItems.forEach((text, index) => {
      const actions = relations.roleActions.filter(
        (a) => a.sourceRole === role.id && a.sourceSubItemIndex === index,
      );
      assert(actions.length, `Unmapped role subitem: ${role.id}/${index}`);
      if (role.id === "D2-R02" && [1, 6].includes(index))
        assert.equal(
          actions.length,
          2,
          "Accept/reject and income/withdraw must stay separate",
        );
      else
        assert.equal(
          actions.length,
          1,
          "Unexpected duplicate diagram subitem mapping",
        );
    });
  }
  assert.equal(
    relations.edges.length,
    28,
    "Missing reviewed diagram connector groups",
  );
  assert.equal(
    new Set(relations.edges.map((e) => e.id)).size,
    28,
    "Duplicate diagram edge ID",
  );
  for (const edge of relations.edges) {
    assert(
      (nodes.has(edge.from) ||
        Object.hasOwn(relations.groupNodes, edge.from)) &&
        (nodes.has(edge.to) || Object.hasOwn(relations.groupNodes, edge.to)),
      `Unknown diagram edge endpoint: ${edge.id}`,
    );
    assert(
      ["forward", "bidirectional", "relation-direction-pending"].includes(
        edge.direction,
      ),
      "Unknown diagram edge direction",
    );
    assert(
      edge.style &&
        edge.visualInterpretation &&
        edge.contract &&
        edge.criterionRefs.length,
      "Missing diagram edge qualification",
    );
    assert.equal(
      edge.acceptance,
      "pending-edge-semantics-and-permission-tests",
      "Static diagram edge cannot accept behavior",
    );
    for (const ref of edge.criterionRefs)
      assert(criteria.has(ref), `Unknown diagram edge criterion: ${ref}`);
  }
  return {
    ...relations,
    sourceSha256: bindings.diagram.sha256,
    glyphByGlyphCoverageAccepted: false,
    runtimeBehaviorAccepted: false,
  };
}

export function inspectTraceability(bindings) {
  assert.equal(bindings.schemaVersion, 1, "Unsupported binding schema");
  assert(
    !/\.setGlobalPrefix\s*\(|\.enableVersioning\s*\(/.test(
      read("apps/api/src/main.ts"),
    ),
    "Global route prefix/versioning needs an explicit mapping review",
  );
  const baseline = JSON.parse(read("docs/zeus/z0-inventory.json"));
  const routes = walk(resolve(root, "apps/api/src"))
    .filter((file) => file.endsWith(".controller.ts"))
    .flatMap((file) => {
      const filename = portable(relative(root, file));
      return controllerRoutes(read(filename), filename);
    });
  const bySignature = new Map();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    assert(!bySignature.has(key), `Duplicate declared route: ${key}`);
    bySignature.set(key, route);
  }
  const sourceApis = [
    ...baseline.d1Apis.map((api, i) => ({
      ...api,
      id: `API${String(i + 1).padStart(2, "0")}`,
      source: "D1",
    })),
    ...baseline.v4Apis.map((api, i) => ({
      ...api,
      id: `ZEUS-API4-${String(i + 1).padStart(3, "0")}`,
      source: "D3",
    })),
  ];
  assert.equal(bindings.api.length, sourceApis.length);
  assert.equal(new Set(bindings.api.map((r) => r.id)).size, sourceApis.length);
  const apiRows = sourceApis.map((api) => {
    const binding = bindings.api.find((row) => row.id === api.id);
    assert(binding, `Missing source API classification: ${api.id}`);
    assert.equal(
      binding.acceptance,
      "pending-behavior-and-permission-tests",
      `Static mapping cannot accept API behavior: ${api.id}`,
    );
    assert(
      binding.note && binding.roleReview,
      `Missing API meaning/policy review: ${api.id}`,
    );
    assert(Array.isArray(binding.targets), `Missing target list: ${api.id}`);
    assert(
      Array.isArray(binding.regressionCandidates),
      `Missing regression classification: ${api.id}`,
    );
    if (!binding.targets.length)
      assert(
        binding.mappingKind.startsWith("missing"),
        `Unclassified missing endpoint: ${api.id}`,
      );
    const targets = binding.targets.map((signature) => {
      assert(
        bySignature.has(signature),
        `Declared handler not found: ${api.id} -> ${signature}`,
      );
      return bySignature.get(signature);
    });
    for (const file of binding.regressionCandidates)
      assert(read(file).length > 0, `Missing test reference: ${file}`);
    return {
      ...api,
      mappingKind: binding.mappingKind,
      note: binding.note,
      roleReview: binding.roleReview,
      targets,
      regressionCandidates: binding.regressionCandidates,
      declaredContractPathMatch: bySignature.has(`${api.method} ${api.path}`),
      behaviorAccepted: false,
    };
  });
  const models = prismaFields(read("apps/api/prisma/schema.prisma"));
  const sourceColumns = baseline.d1Sql.flatMap((table) =>
    table.columns.map((column) => ({ table: table.table, ...column })),
  );
  assert.equal(bindings.sql.length, sourceColumns.length);
  assert.equal(
    new Set(bindings.sql.map((r) => `${r.table}.${r.column}`)).size,
    sourceColumns.length,
  );
  const sqlRows = sourceColumns.map((column) => {
    const binding = bindings.sql.find(
      (r) => r.table === column.table && r.column === column.name,
    );
    assert(binding, `Missing SQL mapping: ${column.table}.${column.name}`);
    assert.equal(
      binding.acceptance,
      "pending-constraint-and-behavior-review",
      `Static field mapping cannot accept constraints: ${column.table}.${column.name}`,
    );
    assert(
      binding.note,
      `Missing SQL qualification: ${column.table}.${column.name}`,
    );
    if (!binding.targets.length)
      assert(
        /missing|privacy-policy-gap/.test(binding.mappingKind),
        `Unclassified missing field: ${column.table}.${column.name}`,
      );
    const targets = binding.targets.map((ref) => {
      assert(models.has(ref), `Prisma field not found: ${ref}`);
      return models.get(ref);
    });
    return {
      source: "D1",
      table: column.table,
      column: column.name,
      sourceLine: column.line,
      sourceType: column.type,
      definition: column.definition,
      mappingKind: binding.mappingKind,
      note: binding.note,
      targets,
      constraintsAccepted: false,
      behaviorAccepted: false,
    };
  });
  const diagram = bindings.diagram;
  assert.equal(diagram?.source, "D2", "Missing diagram source");
  assert.equal(
    diagram.sha256,
    baseline.sources.find((s) => s.id === "D2").sha256,
    "Diagram source hash mismatch",
  );
  assert.equal(diagram.elements.length, 51, "Missing reviewed diagram groups");
  assert.equal(
    new Set(diagram.elements.map((e) => e.id)).size,
    51,
    "Duplicate diagram ID",
  );
  const requirementIds = new Set(baseline.requirements.map((r) => r.id));
  const expectedGroups = {
    roles: 4,
    "public-pages": 6,
    panels: 4,
    core: 12,
    data: 12,
    outputs: 6,
    flow: 7,
  };
  for (const [group, count] of Object.entries(expectedGroups)) {
    assert.equal(
      diagram.elements.filter((e) => e.group === group).length,
      count,
      `Diagram group count: ${group}`,
    );
  }
  for (const element of diagram.elements) {
    assert.match(element.id, /^D2-[RPNCDXF]\d{2}$/);
    assert(
      Object.hasOwn(expectedGroups, element.group),
      `Unknown diagram group: ${element.group}`,
    );
    assert.equal(
      element.acceptance,
      "pending-subrequirement-edge-and-behavior-review",
      "Static diagram mapping cannot accept behavior",
    );
    assert(
      element.label && element.note && element.subItems.length,
      `Missing diagram qualification: ${element.id}`,
    );
    assert(
      element.codeFiles.length || element.modelRefs.length,
      `Unlinked diagram group: ${element.id}`,
    );
    for (const file of element.codeFiles)
      assert(read(file).length > 0, `Missing diagram file: ${file}`);
    for (const ref of element.modelRefs)
      assert(models.has(ref), `Diagram Prisma field not found: ${ref}`);
    assert(
      element.phases.length && element.phases.every((p) => /^Z[0-9]$/.test(p)),
      `Invalid diagram phase: ${element.id}`,
    );
    for (const id of element.requirementRefs)
      assert(requirementIds.has(id), `Unknown diagram requirement: ${id}`);
  }
  const ui = inspectUiPackets(bindings, baseline);
  const domain = inspectDomainPackets(bindings, baseline);
  const legacy = inspectLegacyPackets(bindings, baseline);
  const diagramRelations = inspectDiagramRelations(bindings, baseline);
  return {
    schemaVersion: 1,
    interpretation:
      "Static reviewed associations, not HTTP behavior or constraint acceptance; literal path matching inspects declarations only",
    routesInspected: routes.length,
    globalPolicyReview: [
      "apps/api/src/main.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/common/guards/roles.guard.ts",
      "apps/api/src/common/guards/admin-scope.guard.ts",
    ],
    api: apiRows,
    sql: sqlRows,
    diagram: {
      ...diagram,
      atomicCoverageAccepted: false,
      edgeSemanticsAccepted: false,
      behaviorAccepted: false,
    },
    ui,
    domain,
    legacy,
    diagramRelations,
  };
}

function bindingTests(bindings) {
  const change = (mutate) => {
    const copy = structuredClone(bindings);
    mutate(copy);
    return copy;
  };
  assert.throws(
    () => inspectTraceability(change((b) => b.api.pop())),
    /Expected values/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.api[0].targets = ["POST /v1/does-not-exist"];
        }),
      ),
    /handler not found/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.api[0].acceptance = "accepted";
        }),
      ),
    /cannot accept API behavior/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.sql[0].targets = ["User.nonexistent"];
        }),
      ),
    /Prisma field not found/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.sql[0].acceptance = "accepted";
        }),
      ),
    /cannot accept constraints/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.sql[0].column = "unknown_source_column";
        }),
      ),
    /Missing SQL mapping/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.diagram.elements[1].id = b.diagram.elements[0].id;
        }),
      ),
    /Duplicate diagram/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.diagram.elements[0].codeFiles = ["apps/api/src/does-not-exist.ts"];
        }),
      ),
    /ENOENT/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.diagram.elements[0].acceptance = "accepted";
        }),
      ),
    /cannot accept behavior/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.diagram.sha256 = "unreviewed";
        }),
      ),
    /hash mismatch/,
  );
  assert.throws(
    () =>
      inspectTraceability(
        change((b) => {
          b.diagram.elements[0].requirementRefs = ["ZEUS-UNKNOWN"];
        }),
      ),
    /Unknown diagram requirement/,
  );
  const baseline = JSON.parse(read("docs/zeus/z0-inventory.json"));
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets.pop();
        }),
        baseline,
      ),
    /Missing UI packets/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[1].id = b.uiPackets[0].id;
        }),
        baseline,
      ),
    /UI packet ID mismatch/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].codeFiles = ["apps/web/src/does-not-exist.tsx"];
        }),
        baseline,
      ),
    /ENOENT/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].sourceSections = ["99.99"];
        }),
        baseline,
      ),
    /Unknown UI source section/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].apiRefs = ["API99"];
        }),
        baseline,
      ),
    /Unknown UI API/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].capabilityAcceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept capability/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].layoutAcceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept layout/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].behaviorAcceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept behavior/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.uiPackets[0].acceptedCommit = "pretend";
        }),
        baseline,
      ),
    /cannot claim an accepted commit/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        change((b) => {
          b.d5ContextSections[0].section = "999";
        }),
        baseline,
      ),
    /Invalid D5 context/,
  );
  assert.throws(
    () =>
      inspectUiPackets(
        bindings,
        baseline,
        `${read("docs/specs/ui-pages-blueprint-v2.md")}\n## ۲۳. بخش جدید\n- نیاز بدون نگاشت`,
      ),
    /Unclassified D5 source line/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets.pop();
        }),
        baseline,
      ),
    /Missing domain packets/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[1].id = b.domainPackets[0].id;
        }),
        baseline,
      ),
    /Domain packet ID mismatch/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[0].sourceSections = ["99"];
        }),
        baseline,
      ),
    /Unknown domain source section/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[0].codeFiles = ["apps/api/src/does-not-exist.ts"];
        }),
        baseline,
      ),
    /ENOENT/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[0].uiRefs = ["ZEUS-UI-999"];
        }),
        baseline,
      ),
    /Unknown domain UI/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[0].acceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept behavior/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(
        change((b) => {
          b.domainPackets[0].acceptedCommit = "pretend";
        }),
        baseline,
      ),
    /cannot claim an accepted commit/,
  );
  assert.throws(
    () =>
      inspectDomainPackets(bindings, baseline, {
        D4: `${read("docs/specs/addendum-state-machine-ledger.md")}\n## ۴. مورد جدید\n- بند مالی بدون نگاشت`,
      }),
    /Unclassified D4 source line/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets.pop();
        }),
        baseline,
      ),
    /Missing legacy\/technical packets/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets[1].id = b.legacyPackets[0].id;
        }),
        baseline,
      ),
    /Legacy packet ID mismatch/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets[0].sourceRefs = ["tree:frontend/missing.tsx"];
        }),
        baseline,
      ),
    /Unknown legacy tree/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets[0].sourceRefs = ["field:orders.missing"];
        }),
        baseline,
      ),
    /Unknown legacy SQL field/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets[0].reuseUi = ["ZEUS-UI-999"];
        }),
        baseline,
      ),
    /Unknown legacy UI/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.legacyPackets[0].acceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept behavior/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.treeMappings.pop();
        }),
        baseline,
      ),
    /Missing legacy tree mappings/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.treeMappings[0].targets = ["apps/web/src/does-not-exist.tsx"];
        }),
        baseline,
      ),
    /ENOENT/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.treeMappings[0].targets = ["apps/api/.env"];
        }),
        baseline,
      ),
    /Private environment reference/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.treeMappings[0].targets = ["../outside"];
        }),
        baseline,
      ),
    /Out-of-project artifact/,
  );
  assert.throws(
    () =>
      inspectLegacyPackets(
        change((b) => {
          b.treeMappings[0].acceptedCommit = "pretend";
        }),
        baseline,
      ),
    /cannot claim accepted commit/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.roleActions.pop();
        }),
        baseline,
      ),
    /Missing diagram role actions/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.roleActions[0].sourceSubItemIndex = 99;
        }),
        baseline,
      ),
    /Diagram action source drift/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.roleActions[0].criterionRefs = ["A99"];
        }),
        baseline,
      ),
    /Unknown diagram action criterion/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.roleActions[0].acceptance = "accepted";
        }),
        baseline,
      ),
    /cannot accept behavior/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.edges.pop();
        }),
        baseline,
      ),
    /Missing reviewed diagram connector/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.edges[0].to = "D2-UNKNOWN";
        }),
        baseline,
      ),
    /Unknown diagram edge endpoint/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.groupNodes["GROUP-CORE"] = ["D2-UNKNOWN"];
        }),
        baseline,
      ),
    /Unknown diagram group member/,
  );
  assert.throws(
    () =>
      inspectDiagramRelations(
        change((b) => {
          b.diagramRelations.fullDiagramAtomicAcceptance = true;
        }),
        baseline,
      ),
    /cannot accept full coverage/,
  );
  return 49;
}

function selfTests() {
  const fixture =
    "@Controller('v1/a') class A { @Get(':id') get() {} @Post() create() {} } @Controller('v1/b') class B { @Patch(':id') patch() {} }";
  const routes = controllerRoutes(fixture);
  assert.deepEqual(
    routes.map((r) => `${r.method} ${r.path}`),
    ["GET /v1/a/:id", "POST /v1/a", "PATCH /v1/b/:id"],
  );
  assert.equal(routes[2].className, "B");
  assert.equal(controllerRoutes("// @Get('fake')\nclass A {}").length, 0);
  assert.throws(
    () => controllerRoutes("@Controller(prefix) class A { @Get() f(){} }"),
    /Dynamic route/,
  );
  assert.throws(
    () => controllerRoutes("@Controller('x') class A { @Get(path) f(){} }"),
    /Dynamic route/,
  );
  assert.throws(
    () => controllerRoutes("@Controller('x') class A { @All() f(){} }"),
    /All-method/,
  );
  const fields = prismaFields(
    'model X {\n  id String @id\n  name String?\n  @@map("x")\n}',
  );
  assert.equal(fields.size, 2);
  assert.equal(fields.get("X.name").type, "String?");
  assert.throws(
    () => prismaFields("model X {\n id String\n id String\n}"),
    /Duplicate/,
  );
  const indexed = sourceLineIndex(
    "# عنوان\n\nنسخه\n---\n## ۹. مشتری\n### ۹.۱ داشبورد\n- کارت\n|---|---|\nمتن\n## ۲۰. اولویت\n### فاز ۱\n- کار",
  );
  assert.deepEqual(indexed.sections, ["0", "9", "9.1", "20"]);
  assert.deepEqual(
    indexed.lines.map((line) => line.section),
    ["0", "9.1", "9.1", "20"],
  );
  assert.equal(indexed.lines[1].line, 7);
  assert.equal(indexed.lines[3].text, "- کار");
  assert.throws(
    () => sourceLineIndex("## ۱. یک\n## ۱. دوباره"),
    /Duplicate numbered section/,
  );
  return 14;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const count = selfTests();
    if (process.argv.includes("--routes")) {
      const routes = walk(resolve(root, "apps/api/src"))
        .filter((p) => p.endsWith(".controller.ts"))
        .flatMap((p) =>
          controllerRoutes(
            read(portable(relative(root, p))),
            portable(relative(root, p)),
          ),
        );
      process.stdout.write(`${JSON.stringify(routes, null, 2)}\n`);
    } else {
      const bindings = JSON.parse(read("docs/zeus/z0-mappings.json"));
      const bindingTestCount = bindingTests(bindings);
      const report = inspectTraceability(bindings);
      if (process.argv.includes("--json"))
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else
        console.log(
          JSON.stringify({
            staticTraceability: "passed",
            sourceApis: report.api.length,
            mappedApis: report.api.filter((r) => r.targets.length).length,
            sourceColumns: report.sql.length,
            referencedColumns: report.sql.filter((r) => r.targets.length)
              .length,
            routesInspected: report.routesInspected,
            diagramGroups: report.diagram.elements.length,
            uiPackets: report.ui.packets.length,
            d5SourceLines: report.ui.sourceLines.length,
            domain: report.domain.map((s) => ({
              source: s.source,
              packets: s.packets.length,
              sourceLines: s.sourceLines.length,
            })),
            legacyCriteria: report.legacy.packets.filter((p) =>
              /^[A-H]/.test(p.id),
            ).length,
            technicalPackets: report.legacy.packets.filter((p) =>
              /^T/.test(p.id),
            ).length,
            treePaths: report.legacy.treeMappings.length,
            diagramRoleActions: report.diagramRelations.roleActions.length,
            diagramConnectorGroups: report.diagramRelations.edges.length,
            selfTests: count,
            negativeBindingTests: bindingTestCount,
            behaviorOrPhaseAcceptance: false,
          }),
        );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
