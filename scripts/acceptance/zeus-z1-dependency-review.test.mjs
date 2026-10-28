import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildReview,
  checkHistoricalReview,
  lockGraph,
  resolveLocked,
  shortestChains,
} from "./zeus-z1-dependency-review.mjs";

const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const packages = {
  "": { dependencies: { a: "1" }, devDependencies: { tool: "1" } },
  "node_modules/a": { version: "1", dependencies: { b: "1" } },
  "node_modules/a/node_modules/b": {
    version: "1",
    dependencies: { c: "1", a: "1" },
  },
  "node_modules/b": { version: "2" },
  "node_modules/c": { version: "1" },
  "node_modules/tool": { version: "1", dependencies: { b: "2" } },
};

test("nested locations are preferred; hoisted versions are not conflated", () => {
  assert.equal(
    resolveLocked(packages, "node_modules/a", "b"),
    "node_modules/a/node_modules/b",
  );
  assert.equal(
    resolveLocked(packages, "node_modules/tool", "b"),
    "node_modules/b",
  );
  assert.equal(
    resolveLocked(packages, "node_modules/a/node_modules/b", "c"),
    "node_modules/c",
  );
});
test("scoped package resolution walks package boundaries", () => {
  const scoped = {
    "": {},
    "node_modules/@s/p": {},
    "node_modules/@s/p/node_modules/@t/x": {},
    "node_modules/@s/leaf": {},
  };
  assert.equal(
    resolveLocked(scoped, "node_modules/@s/p", "@t/x"),
    "node_modules/@s/p/node_modules/@t/x",
  );
  assert.equal(
    resolveLocked(scoped, "node_modules/@s/p", "@s/leaf"),
    "node_modules/@s/leaf",
  );
});
test("absent dependencies remain explicit and traversal names are rejected", () => {
  assert.equal(resolveLocked(packages, "node_modules/a", "absent"), null);
  assert.throws(() => resolveLocked(packages, "", "../../secret"));
});
test("production graph excludes root dev entry; all graph includes it", () => {
  const edges = lockGraph({ lockfileVersion: 3, packages });
  const prod = shortestChains(edges);
  assert.deepEqual(prod.get("node_modules/a/node_modules/b"), [
    "",
    "node_modules/a",
    "node_modules/a/node_modules/b",
  ]);
  assert.equal(prod.has("node_modules/tool"), false);
  assert.equal(prod.has("node_modules/b"), false);
  assert.deepEqual(shortestChains(edges, false).get("node_modules/b"), [
    "",
    "node_modules/tool",
    "node_modules/b",
  ]);
});
test("cycles terminate and optional/peer missing edges are retained", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      ...packages,
      "node_modules/c": {
        dependencies: { a: "1" },
        optionalDependencies: { missing: "1" },
        peerDependencies: { peer: "1" },
      },
    },
  };
  const edges = lockGraph(lock);
  assert.equal(edges.filter((edge) => edge.to === null).length, 2);
  assert.equal(shortestChains(edges).has("node_modules/c"), true);
  assert.throws(() => lockGraph({ lockfileVersion: 1, packages }));
});
test("regression: patched proxy compiler rejects outside address with malformed mapped prefix", () => {
  const proxyaddr = requireApi("proxy-addr");
  const request = {
    socket: { remoteAddress: "198.51.100.10" },
    headers: { "x-forwarded-for": "203.0.113.7" },
  };
  assert.equal(
    proxyaddr(request, proxyaddr.compile("::ffff:10.0.0.0/8")),
    "198.51.100.10",
  );
  assert.equal(
    proxyaddr(request, proxyaddr.compile("10.0.0.0/8")),
    "198.51.100.10",
  );
  assert.equal(
    proxyaddr(request, proxyaddr.compile("::ffff:10.0.0.0/104")),
    "198.51.100.10",
  );
});
test("Express current default rejects forwarded identity, without starting a server", () => {
  const express = requireApi("express");
  const app = express();
  assert.equal(app.get("trust proxy"), false);
  const request = Object.assign(Object.create(express.request), {
    app,
    socket: { remoteAddress: "198.51.100.10" },
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
  assert.equal(request.ip, "198.51.100.10");
});
test("review preserves every dated finding and all locations, no fix or release acceptance", () => {
  const { report, approvedChanges } = checkHistoricalReview();
  assert.deepEqual(approvedChanges.sort(), [
    "apps/api/package-lock.json",
    "apps/api/package.json",
    "apps/api/src/auth/auth-session.service.spec.ts",
    "apps/api/src/auth/auth-session.service.ts",
    "apps/api/src/auth/auth.controller.ts",
    "apps/api/src/auth/auth.service.ts",
    "apps/api/src/auth/dto/otp.dto.ts",
    "apps/api/src/catalog/catalog.module.ts",
    "apps/api/src/catalog/catalog.service.ts",
    "apps/api/src/feedback/feedback.module.ts",
    "apps/api/src/finance/escrow.service.ts",
    "apps/api/src/finance/finance.module.ts",
    "apps/api/src/finance/idempotency.service.spec.ts",
    "apps/api/src/finance/idempotency.service.ts",
    "apps/api/src/finance/payment-gateway.ts",
    "apps/api/src/finance/payments.service.ts",
    "apps/api/src/jobs/jobs.service.ts",
    "apps/api/src/orders/domain/order-query.service.ts",
    "apps/api/src/orders/domain/order-workflow.service.ts",
    "apps/api/src/orders/order-state-machine.ts",
    "apps/api/src/orders/orders.module.ts",
    "apps/api/src/orders/orders.service.ts",
    "apps/api/src/tickets/tickets.controller.ts",
    "apps/api/src/tickets/tickets.module.ts",
    "apps/api/src/tickets/tickets.service.ts",
    "apps/api/src/tickets/tickets.support.controller.ts",
    "apps/web/package-lock.json",
    "apps/web/package.json",
    "apps/web/src/app/(customer)/orders/[id]/page.tsx",
    "apps/web/src/app/(customer)/wallet/page.tsx",
    "apps/web/src/app/register/page.tsx",
    "apps/web/src/lib/auth-context.tsx",
  ]);
  const snapshot = JSON.parse(
    readFileSync(
      new URL("../../docs/zeus/z1-security-snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(report.findings.length, 20);
  for (const app of ["api", "web"]) {
    for (const finding of snapshot.reports[`${app}All`].findings) {
      const row = report.findings.find(
        (r) => r.app === app && r.package === finding.package,
      );
      assert.ok(row);
      assert.deepEqual(
        row.locations.map((l) => l.location),
        finding.nodes,
      );
      assert.ok(row.requiredTests.length >= 2);
      assert.equal(row.status, "open-not-patched");
      assert.equal(row.runtimeExploitProven, false);
      assert.equal(row.sourceDate, "2026-10-25");
    }
  }
  assert.equal(report.phaseAccepted, false);
  assert.equal(report.productAccepted, false);
  assert.equal(
    report.freshRegistryAudit.status,
    "completed-after-owner-disclosure-permission",
  );
  assert.equal(report.verifiedPrimaryAdvisories.length, 4);
  assert.deepEqual(report.previousZ0Acceptance.changedPinnedInputs, []);
  assert.equal(report.previousZ0Acceptance.pinnedInputCount, 177);
  assert.equal(report.previousZ0Acceptance.currentCandidateRecertified, false);
  assert.equal(
    report.nextProtectedScope.upstreamPackageMetadata.tarballIntegrityVerified,
    false,
  );
});
test("Nest-pinned multer and nested Swagger yaml appear in distinct production chains", () => {
  const { report } = checkHistoricalReview();
  const multer = report.findings.find(
    (f) => f.app === "api" && f.package === "multer",
  );
  assert.equal(multer.locations[0].version, "2.2.0");
  const yaml = report.findings.find(
    (f) => f.app === "api" && f.package === "js-yaml",
  );
  assert.equal(
    yaml.locations.filter((l) => l.productionSnapshotLocation).length,
    1,
  );
  assert.equal(
    yaml.locations.find((l) => l.productionSnapshotLocation).location,
    "node_modules/@nestjs/swagger/node_modules/js-yaml",
  );
  assert.ok(
    yaml.locations
      .find((l) => l.productionSnapshotLocation)
      .shortestProductionChain.includes("node_modules/@nestjs/swagger"),
  );
});
