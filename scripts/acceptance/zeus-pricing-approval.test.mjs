import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  approvedPricingFiles,
  matchesPricingApproval,
  verifyPricingApproval,
  verifyPricingWiring,
} from "../orbit-pricing-approval.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) =>
  readFileSync(new URL(path, new URL("../../", import.meta.url)));
const old = (path) =>
  execFileSync("git", ["show", `2c701d7:${path}`], {
    cwd: root,
    windowsHide: true,
  });
const appPath = "apps/api/src/app.module.ts";

test("all nine exact scoped files match and only two wiring lines are added", () => {
  assert.equal(Object.keys(approvedPricingFiles).length, 9);
  verifyPricingApproval(old, read);
});

test("each approved file rejects even an appended comment", () => {
  for (const path of Object.keys(approvedPricingFiles)) {
    assert.equal(
      matchesPricingApproval(
        path,
        Buffer.concat([read(path), Buffer.from("\n// changed\n")]),
      ),
      false,
      path,
    );
  }
});

test("unapproved API, auth, finance, DB and prototype paths never match", () => {
  const bytes = read(appPath);
  for (const path of [
    "apps/api/src/pricing/extra.ts",
    "apps/api/src/orders/orders.service.ts",
    "apps/api/src/finance/ledger.service.ts",
    "apps/api/prisma/schema.prisma",
    "apps/api/src/common/guards/jwt-auth.guard.ts",
    "__proto__",
    "constructor",
  ]) {
    assert.equal(matchesPricingApproval(path, bytes), false, path);
  }
});

test("absence or tampering of any approved file fails closed even if untracked", () => {
  for (const target of Object.keys(approvedPricingFiles)) {
    assert.throws(
      () =>
        verifyPricingApproval(old, (path) =>
          path === target ? Buffer.from("") : read(path),
        ),
      /byte pin changed/,
    );
    assert.throws(
      () =>
        verifyPricingApproval(old, (path) => {
          if (path === target) throw new Error("missing");
          return read(path);
        }),
      /missing/,
    );
  }
});

test("removing a guard or unrelated module is not approved wiring", () => {
  const source = read(appPath).toString("utf8");
  assert.throws(
    () =>
      verifyPricingWiring(old(appPath), source.replace("    AuthModule,", "")),
    /identical/,
  );
  assert.throws(
    () =>
      verifyPricingWiring(
        old(appPath),
        source.replace("useClass: JwtAuthGuard", "useClass: RateLimitGuard"),
      ),
    /identical/,
  );
});

test("missing or duplicated pricing wiring fails rather than broad allowlist", () => {
  const source = read(appPath).toString("utf8");
  assert.throws(
    () =>
      verifyPricingWiring(
        old(appPath),
        source.replace("    PricingModule,\n", ""),
      ),
    /Exactly one/,
  );
  assert.throws(
    () =>
      verifyPricingWiring(
        old(appPath),
        source.replace(
          "    PricingModule,\n",
          "    PricingModule,\n    PricingModule,\n",
        ),
      ),
    /Exactly one/,
  );
});

test("CRLF conversion is the sole permitted textual normalization", () => {
  for (const path of Object.keys(approvedPricingFiles)) {
    assert.ok(
      matchesPricingApproval(
        path,
        Buffer.from(
          read(path)
            .toString("utf8")
            .replaceAll("\r\n", "\n")
            .replaceAll("\n", "\r\n"),
        ),
      ),
    );
  }
});
