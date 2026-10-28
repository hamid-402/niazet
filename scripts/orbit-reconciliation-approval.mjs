import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Explicit owner approval, 2026-10-24, ZEUS-EXEC-004: detect/report a
// nonzero wallet whose ledger account is missing. No financial writes,
// scheduling, settlement, permissions or schema changes are authorized.
export const approvedReconciliationFiles = {
  "apps/api/src/finance/ledger.service.ts":
    "edfc644db9355d835558d7de9fd413095fcdde38a7c5748d754af83adce9cba0",
};
const normalize = (bytes) => bytes.toString("utf8").replaceAll("\r\n", "\n");
const previousBranch = `    if (!account)
      return { consistent: true, ledgerBalance: 0, walletBalance: 0 };`;
const approvedBranch = `    if (!account) {
      const wallet = await client.wallet.findUnique({ where: { userId } });
      const walletBalance = wallet?.balance ?? 0;
      if (walletBalance === 0)
        return { consistent: true, ledgerBalance: 0, walletBalance: 0 };
      return {
        consistent: false,
        ledgerBalance: null,
        walletBalance,
        reason: 'missing_ledger_account',
      };
    }`;

export function matchesReconciliationApproval(path, bytes) {
  return (
    Object.hasOwn(approvedReconciliationFiles, path) &&
    createHash("sha256").update(normalize(bytes)).digest("hex") ===
      approvedReconciliationFiles[path]
  );
}

export function verifyReconciliationDomain(previous, current) {
  const before = normalize(previous),
    after = normalize(current);
  assert.equal(
    before.split(previousBranch).length,
    2,
    "Expected exactly one baseline missing-account branch.",
  );
  assert.equal(
    after.split(approvedBranch).length,
    2,
    "Expected exactly one approved missing-account branch.",
  );
  assert.equal(
    after.replace(approvedBranch, previousBranch),
    before,
    "Only the approved missing-account diagnosis may change; ledger writes, projections, alerts and all other code must stay identical.",
  );
}

export function verifyReconciliationApproval(baselineRead, currentRead) {
  for (const path of Object.keys(approvedReconciliationFiles)) {
    assert(
      matchesReconciliationApproval(path, currentRead(path)),
      `Reconciliation approval missing or byte pin changed: ${path}`,
    );
    verifyReconciliationDomain(baselineRead(path), currentRead(path));
  }
}
