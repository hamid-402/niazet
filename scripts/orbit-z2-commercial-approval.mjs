import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inverseZ3OutputInput, verifyZ3OutputApproval } from './orbit-z3-output-approval.mjs';

// Explicit owner approval: Z2.1–Z2.6. Exact paths/bytes only; no folder waiver.
export const z2CommercialOriginalRef = '4945367';
export const z2CommercialPins = {
  ".github/workflows/ci.yml": {
    "before": "8bc88e5deaf2a7bb350d46985f695ae8b480ba45d43a31f31894eb5cbf3dabe4",
    "after": "149d98632a5f91111fa83dcf628187ff285ff67f8973839179ec92ba72ea534e"
  },
  "apps/api/prisma/migrations/20261027120000_zeus_commercial_capacity/migration.sql": {
    "before": null,
    "after": "bc08fc8f18a7d4a9f02c6f15ad55955b0db54f7970d6d542af813a08354df855"
  },
  "apps/api/prisma/schema.prisma": {
    "before": "2691b0f6090d07d8950e1f44ac72900af5d5cb22affd26a65bdb7a704b498ebc",
    "after": "251f21163e8750e1f3bb8bfaec4351e27002575a5ad099eb9aeacdae1b2c3126"
  },
  "apps/api/src/finance/commercial-review.controller.ts": {
    "before": null,
    "after": "b593bf42de67621f3eb8f42826bc034a9975e3c2fafb9ca5944cbe5bfe53bed1"
  },
  "apps/api/src/finance/commercial-review.service.ts": {
    "before": null,
    "after": "41e8360aa27ea37b8565bf5e6eef242ef365a6d0226b49ba0bb9d574f77309f1"
  },
  "apps/api/src/finance/finance.module.ts": {
    "before": "a391ec704f1ead6b321ea9cba1749fbab2405ddd5d8e078aa79dd58f1c928ad9",
    "after": "cbf4ddc919f664dcb80cf983eef95b39cb1d30e8b7c5887a99d8e6bd2914ff57"
  },
  "apps/api/src/finance/payments.service.ts": {
    "before": "04bbdad6c221c4bc0812901d38693c5147f3ce1a84de59e52c3bfc4c0d624b54",
    "after": "08a212090c92f348b2b2e5e308be7ae4441a569f971f914d83511bc4855ab476"
  },
  "apps/api/src/finance/wallet-payments.service.ts": {
    "before": "de3189c435b900c5a38392cd5f6878c85fba7afc0efcea32b220e93b3022dbbd",
    "after": "a39875663f414e3aa1db75d945b50ce96aeddf1916121a947cac16fa0134bf88"
  },
  "apps/api/src/pricing/commercial-clock.ts": {
    "before": null,
    "after": "dedba98cd8b6d5743a5bf0e65a17d2828b2a471f4a8eedbc6006c52143b6d9c5"
  },
  "apps/api/src/pricing/commercial-policy.spec.ts": {
    "before": null,
    "after": "8f900db8f0facd2d09553782d48bce621b1e2eea783d988e68fcccaa17be3159"
  },
  "apps/api/src/pricing/commercial-policy.ts": {
    "before": null,
    "after": "502f4f2eb005cc429d6a83b0055122b6b3359bd5c04f6506e95a421242f851a0"
  },
  "apps/api/src/pricing/commercial.controller.ts": {
    "before": null,
    "after": "2e833347997afd680a2e74fd161976edd1750c72c18f6ee43816995a3f837b48"
  },
  "apps/api/src/pricing/commercial.dto.ts": {
    "before": null,
    "after": "695d90828f7c003e86f88d0374b7b67a232273c5bd3ef14d88ca4b069972482e"
  },
  "apps/api/src/pricing/commercial.module.ts": {
    "before": null,
    "after": "2be1843cdc31536aab34b7d093b54ea5a9093b90c06b0352996ef6f56299e11d"
  },
  "apps/api/src/pricing/commercial.service.ts": {
    "before": null,
    "after": "57244dd6394dfed6a4e2a9fbbeaae0bf7385dfd1c10d7a1cd13dface227adc69"
  },
  "scripts/acceptance/zeus-z1-data-upgrade.mjs": {
    "before": "6801df78dea464051c846b890f516154c14cdb96f1ccf019c48b79f62fabada0",
    "after": "61ad53e18fc460dbe05efa198e81f5e770973feaf90485c9d7823470f4d2b425"
  },
  "scripts/acceptance/zeus-z1-dependency-review.mjs": {
    "before": "965eb911df9df2b689ad31dbab3d1784960c7670d38a5a3b79c05398cba2765f",
    "after": "6bdd67fbe15ddc97c1a6686d573118d2081a2b8c73d7398649c82c643f1bb1f8"
  },
  "scripts/acceptance/zeus-z2-commercial-approval.test.mjs": {
    "before": null,
    "after": "6e39f063e6df2e1b66e2f76899c58d7bed623b114a830974336c986b0b8383e7"
  },
  "scripts/acceptance/zeus-z2-postgres.mjs": {
    "before": null,
    "after": "671da19f62c8da6b43a387faaf59ca861922d603d861ba3806ce075ea4eed025"
  },
  "scripts/orbit-preservation-contract.mjs": {
    "before": "4f71da7e8f628a3f2976887d22320a43877dc7ad5ac715d72c6a44eb9e3a364a",
    "after": "9c9c98cd3407060a4de5a5224c116d6c9796360c29d50e84bbe58a602f28a1f5"
  },
  "scripts/orbit-z1-contract-approval.mjs": {
    "before": "c58919c6bb014c8b635e9e97702ff01bfefb1247459e16154bccb2db6fb8082c",
    "after": "46399d533969426536914ca68aed1a8154931d584582d078315ee63ac4318027"
  },
  "scripts/orbit-z1-data-approval.mjs": {
    "before": "dd660836c7c31101c295f3c35ae238fe9845fb75edee5447dfbab442f044758b",
    "after": "3e5ff0220063abf35551e685634fc728f522a35dc8932b5c19c4c2c2b55fefb7"
  },
  "scripts/orbit-z1-domain-approval.mjs": {
    "before": "8769d6313ec07072a12c67d1a52a545d21072891e3a0484e5388fa75543d349f",
    "after": "3d4b0d259bfe4359df1b2ebdcf258fc8f1aea027056364efa5e758132980a504"
  },
  "scripts/orbit-z2-engine-approval.mjs": {
    "before": "58ed7ee3452441ded7d1c82e86a1c4b86a448b2a8b8035a190175a93a4f22eca",
    "after": "9cb8b5f35fa3eacf59e90f32be8ce77bb2e0c943abb266d50c8e2ef3fa4c933c"
  }
};
const normalized = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const hash = bytes => createHash('sha256').update(normalized(bytes)).digest('hex');
const previous = new Map();
function old(path) {
  if (!previous.has(path)) previous.set(path, execFileSync('git', ['show', `${z2CommercialOriginalRef}:${path}`], { cwd: new URL('../', import.meta.url), windowsHide: true }));
  return previous.get(path);
}
export function matchesZ2CommercialApproval(path, bytes) {
  return Object.hasOwn(z2CommercialPins, path) && hash(inverseZ3OutputInput(path, bytes)) === z2CommercialPins[path].after;
}
/** Earlier guards still validate their original input, after an exact new pin. */
export function inverseZ2CommercialInput(path, bytes) {
  bytes = inverseZ3OutputInput(path, bytes);
  if (!Object.hasOwn(z2CommercialPins, path) || !matchesZ2CommercialApproval(path, bytes) || z2CommercialPins[path].before === null) return bytes;
  const original = old(path);
  assert.equal(hash(original), z2CommercialPins[path].before, 'Z2 previous source checkpoint drift: ' + path);
  return original;
}
export function verifyZ2CommercialApproval(read) {
  verifyZ3OutputApproval(read);
  assert(Object.keys(z2CommercialPins).length > 0, 'Z2 exact approval is not finalized');
  for (const [path, pin] of Object.entries(z2CommercialPins)) {
    assert(matchesZ2CommercialApproval(path, read(path)), 'Z2 commercial pin drift: ' + path);
    if (pin.before !== null) assert.equal(hash(old(path)), pin.before, 'Z2 original checkpoint drift: ' + path);
  }
}
