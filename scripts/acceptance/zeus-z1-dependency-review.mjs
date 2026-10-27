import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inverseParserInput,
  matchesParserApproval,
} from "../orbit-parser-approval.mjs";
import {
  inverseSecurityInput,
  matchesSecurityApproval,
} from "../orbit-security-approval.mjs";
import {
  matchesZ1DomainApproval,
  z1DomainPins,
} from "../orbit-z1-domain-approval.mjs";
import { matchesWalletUiApproval, walletUiPins, walletUiOriginalRef } from '../orbit-wallet-ui-approval.mjs';
import { matchesZ1ContractApproval, z1ContractPins } from '../orbit-z1-contract-approval.mjs';
import { matchesZ1DataApproval, z1DataPins } from '../orbit-z1-data-approval.mjs';
import { matchesZ2EngineApproval } from '../orbit-z2-engine-approval.mjs';

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path).toString("utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const artifact = "docs/zeus/z1-dependency-review.json";

function sourceFiles(folder) {
  return readdirSync(new URL(folder, root), { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${folder}/${entry.name}`;
      return entry.isDirectory()
        ? sourceFiles(path)
        : /\.(tsx?|jsx?|css)$/.test(path)
          ? [path]
          : [];
    })
    .sort();
}

// Lockfile locations, not package-name-only edges: nested versions must remain
// distinct. This is a lock graph, not proof of runtime imports or a full SBOM.
export function resolveLocked(packages, from, name) {
  assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i);
  let cursor = from;
  while (true) {
    const candidate = `${cursor ? `${cursor}/` : ""}node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!cursor) return null;
    const index = cursor.lastIndexOf("node_modules/");
    assert.notEqual(index, -1, `Unsupported lock location: ${cursor}`);
    cursor = cursor.slice(0, index).replace(/\/$/, "");
  }
}

export function lockGraph(lock) {
  assert.equal(lock.lockfileVersion, 3);
  assert.ok(lock.packages[""]);
  const edges = [];
  for (const [from, entry] of Object.entries(lock.packages)) {
    for (const kind of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      ...(from === "" ? ["devDependencies"] : []),
    ]) {
      for (const [name, requested] of Object.entries(entry[kind] ?? {})) {
        edges.push({
          from,
          name,
          requested,
          kind,
          to: resolveLocked(lock.packages, from, name),
        });
      }
    }
  }
  return edges;
}

export function shortestChains(edges, productionOnly = true) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!edge.to || (productionOnly && edge.kind === "devDependencies"))
      continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const found = new Map([["", [""]]]);
  const queue = [""];
  for (let index = 0; index < queue.length; index++) {
    for (const target of adjacency.get(queue[index]) ?? []) {
      if (found.has(target)) continue;
      found.set(target, [...found.get(queue[index]), target]);
      queue.push(target);
    }
  }
  return found;
}

const policies = {
  "api:body-parser": [
    "P0-first-scoped-patch",
    "Nest registers express.json/urlencoded with defaults before controller guards; compressed-body parser is a plausible pre-auth entry. No crash payload was sent to any server.",
    "Pin a compatible fixed 2.x dependency, first candidate 2.4.0 per maintainer; verify dependency metadata/integrity and fresh audit before adoption. No broad Nest upgrade.",
    [
      "compressed JSON/form valid and malformed/trailing data in disposable process",
      "body limits, unsupported encoding and ordinary JSON",
      "login/OTP, multipart, rate-limit and financial regression",
    ],
  ],
  "api:proxy-addr": [
    "P0-conditional-config",
    "Installed Express defaults trust proxy=false; no trust-proxy setting found in application sources. Incorrect IPv4-mapped IPv6 trust prefix is a maintainer precondition, not proven deployed configuration. req.ip drives rate limits/Audit.",
    "Candidate 2.0.8 per maintainer; keep trust policy unchanged and verify real reverse-proxy topology separately.",
    [
      "untrusted forwarded-for ignored",
      "plain IPv4 and mapped IPv6 trust cases",
      "rate-limit/Audit identity and proxy topology",
    ],
  ],
  "api:multer": [
    "P0-upload-parser",
    "Authenticated upload uses FileInterceptor, single file and size limit, synchronous MIME callback, no disk storage configured there. Async-filter-specific advisory is conditional; other parser/abort advisories remain open.",
    "Review 2.5.0+ against all snapshot advisories and fresh metadata; Nest pins 2.2.0, so direct-only update can leave a vulnerable nested copy.",
    [
      "multipart field names, abort/resource cleanup, size/MIME",
      "storage/scan/grant behavior",
      "authenticated upload and parallel malformed streams in isolated process",
    ],
  ],
  "api:@nestjs/platform-express": [
    "P0-parent-propagation",
    "Audit parent warning propagates multer; Nest adapter is active. Do not count parent and leaf as two independent CVEs.",
    "Resolve adapter-pinned multer without blanket parent upgrade; preserve existing route/auth/finance behavior.",
    ["all multer checks", "API suite/build/typecheck and parent compatibility"],
  ],
  "api:nodemailer": [
    "P1-before-live-email",
    "SMTP adapter imports library and accepts recipient input; mock is default in source, actual secret/config values were not inspected. Live acceptance deferred, not a package fix. disableFileAccess/disableUrlAccess/timeouts do not prove all parser issues absent.",
    "Determine current compatible fixed release from maintainer advisories/metadata; no version selected from fixAvailable alone.",
    [
      "structured recipient/header parsing, timeouts/TLS",
      "attachments/URL/file disabled",
      "mock notifications/outbox; no SMTP live calls",
    ],
  ],
  "api:js-yaml": [
    "P1-documentation-and-tooling",
    "Distinct production nested 5.3.0 under Swagger and dev 3.x/4.x copies. Swagger generates trusted schema; no application YAML import endpoint identified. That does not prove every transitive entry unreachable.",
    "Resolve each major-line advisory independently; do not override all js-yaml majors to one version.",
    [
      "Swagger JSON/YAML generation/validation",
      "dev config parsers/build/tests",
      "nested and hoisted resolution after patch",
    ],
  ],
  "api:@nestjs/swagger": [
    "P1-parent-propagation",
    "Parent warning propagates nested js-yaml. Docs disabled in production unless ENABLE_SWAGGER=true; current deployments not attested. Generation of trusted OpenAPI differs from parsing attacker YAML.",
    "Prefer scoped compatible leaf/parent fix; suggested major upgrade is not automatic authority.",
    [
      "OpenAPI generation, docs gate, schema references",
      "API suite/build and exact dependency diff",
    ],
  ],
  "web:next": [
    "P0-framework",
    "Next 16.3.4; source has ISR service pages and backend proxy. No next/og ImageResponse, use cache/use server or draftMode usage found in source search. Absence of those call sites is not clearance of all eleven framework advisories, built-in routes or dev-server exposure.",
    "Review all Next advisories plus matching eslint/env/SWC metadata; 16.3.6 fixes only one listed advisory, not the entire snapshot. No approved target version yet.",
    [
      "SSR/ISR cross-user cache isolation and API proxy/cookies",
      "image optimizer and dev-only exposure",
      "login/refresh/roles, Web build/UI/accessibility/performance",
    ],
  ],
  "web:sharp": [
    "P0-image-decoder",
    "Optional Next image dependency is lock-installed. Brand uses next/image and PNG; no user SVG import pipeline found in source search. Built-in image routing/defaults and decoder exposure still need controlled verification.",
    "Compatible fixed decoder + platform optional packages and clean isolated build; no patch selected solely from audit suggestion.",
    [
      "valid/invalid PNG/SVG inputs in isolated process",
      "image optimizer allowlist/size",
      "logo rendering in both themes and supported platforms",
    ],
  ],
  "web:source-map-js": [
    "P1-runtime-transitive",
    "Reported production transitive parser; package presence does not establish attacker-controlled source-map ingestion. Input producers and build/runtime paths still need full trace.",
    "Trace Next/PostCSS owner and fixed compatible release before any override.",
    [
      "source-map parser boundary and bounded malformed input",
      "CSS/build/SSR and bundle regression",
    ],
  ],
};
const toolingPolicy = (name) => [
  "P1-toolchain",
  `${name} is reported in tooling/development for this app; malicious config/template/query/source input can still affect build/CI. No attacker-controlled runtime path established, not dismissed as harmless.`,
  "Trace all incoming versions/owners and maintainer fixes before minimal patch. Keep dev audit separate from production.",
  [
    "untrusted config/template/parser boundaries in isolated process",
    "lint/typecheck/build/test and lock reproducibility",
  ],
];

export function buildReview(readInput = read, frozenInputPaths = null) {
  const read = readInput;
  const json = (path) => JSON.parse(read(path).toString("utf8"));
  const snapshotPath = "docs/zeus/z1-security-snapshot.json";
  const snapshot = json(snapshotPath);
  assert.equal(
    snapshot.permission.status,
    "owner-approved-metadata-disclosure-only",
  );
  for (const key of ["apiAll", "apiProduction", "webAll", "webProduction"]) {
    const result = snapshot.reports[key];
    assert.ok(result?.metadata?.vulnerabilities);
    assert.equal(
      result.processExitCode,
      result.metadata.vulnerabilities.total ? 1 : 0,
      `Incomplete audit: ${key}`,
    );
  }
  const previousAcceptance = json("docs/zeus/z0-acceptance.json");
  const changedPreviousInputs = Object.entries(
    previousAcceptance.candidate.fileHashes,
  )
    .filter(([path, expected]) => sha(read(path)) !== expected)
    .map(([path]) => path);
  const inputPaths = [
    snapshotPath,
    "apps/api/package.json",
    "apps/api/package-lock.json",
    "apps/web/package.json",
    "apps/web/package-lock.json",
    "apps/api/src/main.ts",
    "apps/api/src/files/files.controller.ts",
    "apps/api/src/notifications/email.service.ts",
    "apps/api/src/notifications/live-providers.ts",
    "apps/api/src/common/guards/rate-limit.guard.ts",
    "apps/web/next.config.ts",
    "apps/web/src/components/brand-mark.tsx",
  ];
  inputPaths.push(
    ...sourceFiles("apps/api/src"),
    ...sourceFiles("apps/web/src"),
    "apps/api/node_modules/express/lib/application.js",
    "apps/api/node_modules/@nestjs/platform-express/adapters/express-adapter.js",
  );
  const graphSummaries = {};
  const findings = [];
  for (const app of ["api", "web"]) {
    const lock = json(`apps/${app}/package-lock.json`);
    assert.equal(
      sha(read(`apps/${app}/package-lock.json`)),
      snapshot.locks[`apps/${app}/package-lock.json`],
      "Fresh audit lock drift",
    );
    const edges = lockGraph(lock);
    const allChains = shortestChains(edges, false);
    const prodChains = shortestChains(edges, true);
    const all = snapshot.reports[`${app}All`];
    const production = snapshot.reports[`${app}Production`];
    graphSummaries[app] = {
      lockedLocations: Object.keys(lock.packages).length - 1,
      edges: edges.length,
      unresolvedEdges: edges.filter((e) => !e.to),
      snapshotAll: all.metadata.vulnerabilities,
      snapshotProduction: production.metadata.vulnerabilities,
    };
    for (const finding of all.findings) {
      const prod = production.findings.find(
        (f) => f.package === finding.package,
      );
      const policy =
        policies[`${app}:${finding.package}`] ?? toolingPolicy(finding.package);
      findings.push({
        app,
        package: finding.package,
        auditPackageSeverity: finding.severity,
        productionSeverity: prod?.severity ?? null,
        priority: policy[0],
        sourceDate: snapshot.date,
        status: "open-not-patched",
        runtimeExploitProven: false,
        reachabilityAssessment: policy[1],
        patchPlan: policy[2],
        requiredTests: policy[3],
        direct: finding.isDirect,
        propagatedVia: finding.via.filter((v) => typeof v === "string"),
        advisories: finding.via.filter((v) => typeof v !== "string"),
        locations: finding.nodes.map((location) => {
          const entry = lock.packages[location];
          assert.ok(
            entry,
            `Snapshot location absent from current lock: ${location}`,
          );
          return {
            location,
            version: entry.version,
            integrity: entry.integrity ?? null,
            declaredDev: entry.dev === true,
            productionSnapshotLocation: prod?.nodes.includes(location) ?? false,
            shortestAllChain: allChains.get(location) ?? null,
            shortestProductionChain: prodChains.get(location) ?? null,
            graphReachabilityIsExploitProof: false,
          };
        }),
        owner: "ZEUS-OPS-003/004/005 · Z1",
      });
    }
  }
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    phase: "Z1",
    package: "Z1-B1 / OPS-003 fresh audit and local dependency triage",
    phaseAccepted: false,
    productAccepted: false,
    sourceSnapshotDate: snapshot.date,
    previousZ0Acceptance: {
      fingerprint: previousAcceptance.candidate.fingerprint,
      pinnedInputCount: Object.keys(previousAcceptance.candidate.fileHashes)
        .length,
      changedPinnedInputs: changedPreviousInputs,
      currentCandidateRecertified: false,
      meaning:
        "Historical Z0 certificate retained. New Z1 tests expand the dynamically discovered test set; strict Z0 --check correctly rejects the new candidate. Pinned Z0 inputs can remain unchanged without asserting fresh whole-candidate acceptance.",
    },
    freshRegistryAudit: {
      status: "completed-after-owner-disclosure-permission",
      reason:
        "Initial managed rejection respected; owner subsequently approved metadata-only disclosure. Four audit reports completed with exit 1 for findings, no error; no install/fix performed.",
    },
    sourceInputs: Object.fromEntries(
      (frozenInputPaths ?? inputPaths).map((p) => [p, sha(read(p))]),
    ),
    graphMeaning:
      "Location-specific lock dependency/optional/peer graph; shortest chain is illustrative, not all paths or exploit proof. Missing optional/platform/peer edges are explicit, not silently resolved.",
    graphSummaries,
    verifiedPrimaryAdvisories: [
      {
        url: "https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h",
        reviewed: "2026-10-25",
        patchedVersion: "2.0.8",
        condition:
          "Misconfigured IPv4-mapped IPv6 trust subnet; not proof of this deployment.",
      },
      {
        url: "https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828",
        reviewed: "2026-10-25",
        patchedVersion: "2.4.0 (2.x); 1.20.9 (1.x)",
        condition:
          "Default inflation, compressed frame followed by trailing bytes; parser before routing.",
      },
      {
        url: "https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m",
        reviewed: "2026-10-25",
        patchedVersion: "2.5.0",
        condition:
          "Pending asynchronous fileFilter after teardown; current project callback is synchronous, other multer issues remain open.",
      },
      {
        url: "https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j",
        reviewed: "2026-10-25",
        patchedVersion: "16.3.6 (this advisory only)",
        condition:
          "Attacker-controlled SVG values to Node next/og ImageResponse; no application call found, other framework issues remain open.",
      },
    ],
    findings,
    limitations: [
      "Fresh audit completed; no install/fix. Target package tarball integrity and reproducible resolution are not yet accepted.",
      "Four primary advisory texts reviewed; other advisories are fresh registry records, not independently reviewed upstream texts.",
      "Static source search and lock graph are not full runtime/HTTP/deployment reachability.",
      "No application/DB/provider/network exploit test, no real credentials or env files read.",
      "No package/lock/source/guard changes or new exception; all findings remain open.",
    ],
    nextProtectedScope: {
      requiresOwnerApproval: true,
      proposed:
        "body-parser 2.4.0 and only its strictly necessary compatible dependency resolution. Current qs override 6.16.0 is below the new declared ^6.16.1; do not silently force an incompatible version or broadly update unrelated dependencies.",
      upstreamPackageMetadata: {
        url: "https://raw.githubusercontent.com/expressjs/body-parser/v2.4.0/package.json",
        release: "https://github.com/expressjs/body-parser/releases/tag/v2.4.0",
        license: "MIT",
        node: ">=18",
        changedDeclaredRanges: {
          "content-type": "^2.0.0 → ^2.1.0",
          "iconv-lite": "^0.7.2 → ^0.7.3",
          qs: "^6.15.2 → ^6.16.1",
        },
        tarballIntegrityVerified: false,
      },
      filesToReview: [
        "apps/api/package.json",
        "apps/api/package-lock.json",
        "scripts/orbit-invoice-approval.mjs",
        "scripts/orbit-preservation-contract.mjs",
        "new exact dependency approval module/tests if needed",
      ],
      constraints:
        "No arbitrary upgrade or folder exemption; fixed baseline and invoice/pricing/reconciliation checks retained. Existing dependencies unchanged except individually approved version/integrity/dependency delta; protected runtime/auth/money/schema untouched.",
    },
  };
}

export function checkHistoricalReview() {
  const saved = json(artifact);
  const approvedChanges = [];
  // This is a historical reconstruction, not fresh candidate acceptance.
  // Newly added source must still match an exact owner-approved file; it cannot
  // silently disappear from a dynamic historical inventory.
  for (const path of [
    ...sourceFiles("apps/api/src"),
    ...sourceFiles("apps/web/src"),
  ]) {
    if (!Object.hasOwn(saved.sourceInputs, path))
      assert(
        matchesZ1DomainApproval(path, read(path)) || matchesWalletUiApproval(path, read(path)) || matchesZ1ContractApproval(path, read(path)) || matchesZ1DataApproval(path, read(path)) || matchesZ2EngineApproval(path, read(path)),
        `Unapproved new historical source: ${path}`,
      );
  }
  const historicalRead = (path) => {
    const bytes = read(path);
    const expected = saved.sourceInputs[path];
    if (!expected || sha(bytes) === expected) return bytes;
    let inverse;
    if (matchesParserApproval(path, bytes))
      inverse = Buffer.from(inverseParserInput(path, bytes));
    else if (matchesSecurityApproval(path, bytes))
      inverse = Buffer.from(inverseSecurityInput(path, bytes));
    else if (
      matchesZ1DomainApproval(path, bytes) &&
      z1DomainPins[path].before === expected
    )
      inverse = execFileSync("git", ["show", `2c701d7:${path}`], {
        cwd: root,
        windowsHide: true,
      });
    else if (matchesWalletUiApproval(path, bytes) && walletUiPins[path].before === expected) inverse = execFileSync('git', ['show', `${walletUiOriginalRef}:${path}`], { cwd: root, windowsHide: true });
    else if (matchesZ1ContractApproval(path, bytes) && z1ContractPins[path].before === expected) inverse = execFileSync('git', ['show', `${z1ContractPins[path].originalRef}:${path}`], { cwd: root, windowsHide: true });
    else if (matchesZ1DataApproval(path, bytes) && z1DataPins[path].before === expected) inverse = execFileSync('git', ['show', `2c701d7:${path}`], { cwd: root, windowsHide: true });
    else assert.fail(`Unapproved historical input drift: ${path}`);
    assert.equal(sha(inverse), expected);
    if (!approvedChanges.includes(path)) approvedChanges.push(path);
    return inverse;
  };
  const rebuilt = buildReview(historicalRead, Object.keys(saved.sourceInputs));
  // This field describes the pre-patch checkpoint, NOT current guard/tool bytes.
  // Current product/lock deltas are checked above; guard acceptance is independent.
  rebuilt.previousZ0Acceptance = saved.previousZ0Acceptance;
  assert.deepEqual(
    saved,
    rebuilt,
    "Historical review or unapproved source drift",
  );
  return { report: saved, approvedChanges, currentCandidateRecertified: false };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (process.argv.includes("--check")) {
    const { report, approvedChanges } = checkHistoricalReview();
    console.log(
      JSON.stringify({
        historicalReview: "passed-with-exact-approved-delta",
        approvedChanges,
        findingGroups: report.findings.length,
        freshAudit: report.freshRegistryAudit.status,
        fixed: 0,
        phaseAccepted: false,
      }),
    );
  } else if (process.argv.includes("--json"))
    console.log(JSON.stringify(buildReview(), null, 2));
  else
    console.log(
      "Use --json (stdout only) or --check. No network/install/write operation is implemented.",
    );
}
