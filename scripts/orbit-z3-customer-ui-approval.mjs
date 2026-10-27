import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const z3UiOriginalRef = '166804b';
export const z3UiPins = {
  "apps/web/src/app/(customer)/orders/[id]/page.tsx": {
    "before": "fd6dbefe1061eae463865a4c3d4d422d69d801d88ee232690961970d8ea0fd39",
    "after": "eb763329bcbc94325a3091d2b5e37e5c0a54d6ccd4b99f264ba7fcdff84faf8b"
  },
  "apps/web/src/components/wallet-actions.tsx": {
    "before": "c0194efac13ec63013c551fe8cb47a3e55ad28e47805d7e24c8f66e77ace1b5e",
    "after": "42f1863e75bcdb38fa558e48b3419888faedb4e1ac87b5d3acf36bc715cabb33"
  },
  "apps/web/scripts/zeus-wallet-runtime.mjs": {
    "before": "bc322bbc1b882b98e7ad24b36ccbbef63e92a2f4c01e4a13d016de1f65f5ce62",
    "after": "5c2b2d26e1d7808c3b2c160f7e3438eb9570b1ab11f066262bb9a5c54cc44759"
  },
  "scripts/orbit-wallet-ui-approval.mjs": {
    "before": "2f84d629014493438107717749f855efd80fb9402c23171cb6eb4edc5e69e4bc",
    "after": "58b53bb29fb4be76213e4c1c9382c25c31f75a60d0f06b4716d29c5f9b792f04"
  },
  "apps/web/src/components/commercial-order-contract.ts": {
    "before": null,
    "after": "7c0fe498e8ea145d8742fbf2c57e0159678e7059e9ca0aa401c97410ed3ea36d"
  },
  "apps/web/src/components/commercial-order-panel.tsx": {
    "before": null,
    "after": "67fb965971c69b3a8f3e51577a571a3e264bae26633d419c5b34f69cb622b795"
  },
  "apps/web/scripts/commercial-order-contract.test.mjs": {
    "before": null,
    "after": "16036303e99a2d9e6013df91dcc788589384f053626b2bd24fb096e114a9a8f3"
  },
  "apps/web/scripts/zeus-commercial-order-runtime.mjs": {
    "before": null,
    "after": "13103c65d2af40e4e657a54bb70951c4630496df7a7e33f1515a508220d921eb"
  }
};
const root = new URL('../', import.meta.url);
const hash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const original = path => execFileSync('git', ['show', z3UiOriginalRef + ':' + path], { cwd: root, windowsHide: true });
export function matchesZ3UiApproval(path, bytes) { return Object.hasOwn(z3UiPins, path) && hash(bytes) === z3UiPins[path].after; }
export function inverseZ3UiInput(path, bytes) {
  if (!matchesZ3UiApproval(path, bytes) || z3UiPins[path].before === null) return bytes;
  const before = original(path);
  assert.equal(hash(before), z3UiPins[path].before, 'Z3 original input drift: ' + path);
  return before;
}
export function verifyZ3UiApproval(read) {
  for (const [path, pin] of Object.entries(z3UiPins)) {
    assert(matchesZ3UiApproval(path, read(path)), 'Z3 exact UI input drift: ' + path);
    if (pin.before !== null) assert.equal(hash(original(path)), pin.before, 'Z3 original input drift: ' + path);
  }
}
