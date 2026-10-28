import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inverseZ3UiInput, verifyZ3UiApproval } from './orbit-z3-customer-ui-approval.mjs';
export const walletUiOriginalRef = '30555d2a26bb5f9a4e1649160751929b5354d1bc';
// UI-only activation approval; NOT the Orbit fixed baseline or a folder waiver.
export const walletUiPins = {
  "apps/web/src/app/(customer)/wallet/page.tsx": {
    "before": "f803d434474049ad437ccee184a063e7b5ca5312ef36d1d2d57e6567f44b14a1",
    "after": "15c2b4dce0348a5a2be388da8b52f6b2bd551a24901c6fc8351df4e5365d5538"
  },
  "apps/web/src/app/(customer)/orders/[id]/page.tsx": {
    "before": "1fdcd4f47bb38a7b056c9430d3a31073fea10541f8f1b5b35c3586dc26fcf354",
    "after": "fd6dbefe1061eae463865a4c3d4d422d69d801d88ee232690961970d8ea0fd39"
  },
  "apps/web/src/components/wallet-actions.tsx": {
    "before": null,
    "after": "c0194efac13ec63013c551fe8cb47a3e55ad28e47805d7e24c8f66e77ace1b5e"
  },
  "apps/web/src/components/wallet-contract.ts": {
    "before": null,
    "after": "115b654f63f2c653e4d9cb0a0e7666c4a73ccd919e6be70b8f7d539b33d648ce"
  },
  "apps/web/scripts/zeus-wallet-contract.test.mjs": {
    "before": null,
    "after": "578c1aebe55d2f538b0730eef4994fa0685b3f072df736f078e1836569a3e5a5"
  },
  "apps/web/scripts/zeus-wallet-runtime.mjs": {
    "before": null,
    "after": "bc322bbc1b882b98e7ad24b36ccbbef63e92a2f4c01e4a13d016de1f65f5ce62"
  }
};
const hash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
export function matchesWalletUiApproval(path, bytes) { return Object.hasOwn(walletUiPins, path) && hash(inverseZ3UiInput(path, bytes)) === walletUiPins[path].after; }
export function verifyWalletUiApproval(originalRead, currentRead) {
  verifyZ3UiApproval(currentRead);
  for (const [path, pin] of Object.entries(walletUiPins)) {
    assert(matchesWalletUiApproval(path, currentRead(path)), 'Wallet UI pin drift: ' + path);
    if (pin.before !== null) assert.equal(hash(originalRead(path)), pin.before);
  }
}
