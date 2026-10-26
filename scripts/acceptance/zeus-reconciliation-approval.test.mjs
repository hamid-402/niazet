import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  approvedReconciliationFiles,
  matchesReconciliationApproval,
  verifyReconciliationDomain,
  verifyReconciliationApproval,
} from "../orbit-reconciliation-approval.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const file = "apps/api/src/finance/ledger.service.ts";
const read = (path) =>
  readFileSync(new URL(path, new URL("../../", import.meta.url)));
const old = (path) =>
  execFileSync("git", ["show", `2c701d7:${path}`], {
    cwd: root,
    windowsHide: true,
  });

test("exactly one approved file matches hash and inverse patch equals fixed baseline", () => {
  assert.deepEqual(Object.keys(approvedReconciliationFiles), [file]);
  verifyReconciliationApproval(old, read);
});
test("even a comment changes the pin; LF/CRLF is the sole normalization", () => {
  assert.equal(
    matchesReconciliationApproval(
      file,
      Buffer.concat([read(file), Buffer.from("\n// unrelated\n")]),
    ),
    false,
  );
  assert.equal(
    matchesReconciliationApproval(
      file,
      Buffer.from(
        read(file).toString().replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
      ),
    ),
    true,
  );
});
test("no other finance, API, auth, schema or prototype path is allowed", () => {
  for (const path of [
    "apps/api/src/finance/payments.service.ts",
    "apps/api/src/finance/escrow.service.ts",
    "apps/api/src/finance/finance-reconciliation.service.ts",
    "apps/api/src/finance/ledger.service.spec.ts",
    "apps/api/prisma/schema.prisma",
    "apps/api/src/common/guards/jwt-auth.guard.ts",
    "__proto__",
    "constructor",
  ])
    assert.equal(matchesReconciliationApproval(path, read(file)), false, path);
});
test("missing or altered approved source fails closed", () => {
  assert.throws(
    () => verifyReconciliationApproval(old, () => Buffer.from("")),
    /byte pin changed/,
  );
  assert.throws(
    () =>
      verifyReconciliationApproval(old, () => {
        throw new Error("missing");
      }),
    /missing/,
  );
});
test("changes outside the diagnostic branch are rejected independently of the pin", () => {
  const source = read(file).toString();
  for (const [before, after] of [
    ["amount: input.amount,", "amount: input.amount + 1,"],
    ["balance: { increment: delta }", "balance: { increment: 0 }"],
    ["sensitivity: 'critical'", "sensitivity: 'low'"],
  ]) {
    assert(
      source.includes(before),
      `Expected protected code fragment: ${before}`,
    );
    assert.throws(
      () =>
        verifyReconciliationDomain(old(file), source.replace(before, after)),
      /identical/,
    );
  }
});
test("changed/missing/duplicate approved branch cannot be disguised as domain parity", () => {
  const source = read(file).toString();
  assert.throws(
    () =>
      verifyReconciliationDomain(
        old(file),
        source.replace("reason: 'missing_ledger_account'", "reason: 'other'"),
      ),
    /approved missing-account/,
  );
  assert.throws(
    () => verifyReconciliationDomain(old(file), old(file)),
    /approved missing-account/,
  );
  const start = source.indexOf("    if (!account) {");
  const end = source.indexOf("\n\n    const [creditSum", start);
  assert(start > 0 && end > start);
  assert.throws(
    () =>
      verifyReconciliationDomain(
        old(file),
        source.slice(0, end) +
          "\n" +
          source.slice(start, end) +
          source.slice(end),
      ),
    /approved missing-account/,
  );
});
