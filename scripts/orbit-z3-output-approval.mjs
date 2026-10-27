import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Explicit owner approvals: version-bound QC download and mandatory human QC
// even without a checklist. No auth/role/money/state-machine exemption.
export const z3OutputOriginalRef = '166804b';
export const z3OutputPins = {
  "apps/api/prisma/schema.prisma": {
    "before": "251f21163e8750e1f3bb8bfaec4351e27002575a5ad099eb9aeacdae1b2c3126",
    "after": "775a712997552a4fd238cc288f1a9e8f9a5cf09e0dcf8f8a5c8238cd34ab9731"
  },
  "apps/api/prisma/migrations/20261027180000_zeus_output_publications/migration.sql": {
    "before": null,
    "after": "793391e16e4879027a996046df2eb9bef3311253f50e445feaa7c3183b6fd3ee"
  },
  "apps/api/src/files/files.controller.ts": {
    "before": "0f561eae94d58502250011613454f3479204f4ed09d09848101439f9f5eb3a64",
    "after": "e84e7f507e4f2277634beb1a6cd442fb405cfeeb4bd66980b32bf75ac77612d0"
  },
  "apps/api/src/files/files.module.ts": {
    "before": "865da5320fcab77e2de9ad244c2110ad18abee1d08c36cc6deb37af9fc14a6a2",
    "after": "165ed7fb79602bf1f844ec41d189879c03a4558632e7732389ea864789a2eb73"
  },
  "apps/api/src/files/files.service.ts": {
    "before": "4de2eb14a64e9b85982678ac0720ae79605e154171b1fdf31ad4e7c9715ac6cd",
    "after": "ec0c304058c1a50ef6df9db63dc2bf566831ca6e7935b70c74c868f7d1e394ee"
  },
  "apps/api/src/orders/orders.service.ts": {
    "before": "76ad7d490602e4e2f75e4fa86495252224a4e8327979157fc0c2ee7b626184c8",
    "after": "5d90a851d30c292521784ff18a62c6cf37e198cf4863be7c90b0ec5d1d4fb864"
  },
  "apps/api/src/qc/dto/qc.dto.ts": {
    "before": "aa599665452bbfd5e37994e2849219ab11dcda4f5708f124f9e8d17ae26459ca",
    "after": "1070cba99e754c919e9940ba05b821f0c2589c988e304785de3923f537aaaa2c"
  },
  "apps/api/src/qc/qc.service.ts": {
    "before": "a7b761dc702f6ad17994be71f650b582dfebf1d31289198ee3e991d601a1c1b1",
    "after": "d70ac61f1cda044c9b1e2a61b3ccaa1026fd52639b487f26d42df1142808313a"
  },
  "apps/api/src/files/output-publication.controller.ts": {
    "before": null,
    "after": "18d3a82f2d3d288c2758714bb605b838da7229be86ce84ad50b4f9e1002aa8b5"
  },
  "apps/api/src/files/output-publication.dto.ts": {
    "before": null,
    "after": "84c399dd90ef191beea6abb057b40b40469616f213e6daada778210a238ce422"
  },
  "apps/api/src/files/output-publication.service.ts": {
    "before": null,
    "after": "deaf291fa6a88b41db349efad0066ffc48acdb506c7c424829c6015f5f7c2174"
  },
  "apps/api/src/files/output-publication.spec.ts": {
    "before": null,
    "after": "b8316cc8db8ab9ecb80242af84406b9cf2d1faae41aba858c96986b901d96b02"
  },
  "apps/api/src/files/output-publication.ts": {
    "before": null,
    "after": "1ad6ef74804b4e4a8b08c99c82cb0b9367fabfd51adf617f3a7a60f725e5b867"
  },
  "apps/web/src/app/(admin)/admin/qc/[id]/page.tsx": {
    "before": "00996bc538469f022275ec060fcf58fe532b807d5fcfb042c45cab997d30757b",
    "after": "a0c23a17393e020bd8282a7976e850c76b023d8982bafcf0c611eadbcb54da4a"
  },
  "scripts/orbit-preservation-contract.mjs": {
    "before": "9c9c98cd3407060a4de5a5224c116d6c9796360c29d50e84bbe58a602f28a1f5",
    "after": "5c7858d24b6d414a1d53c6064f12d3360a874a3821a50e1365d128221cdbeb42"
  },
  "scripts/orbit-z2-commercial-approval.mjs": {
    "before": "bf1ee4a23e3276bd088ad602dd53e21b547bf44bdb8f86a50c66b2070f1df386",
    "after": "2e784694701de9dbae0e6a02fb7674d4d1c5aa78c2138a68392c7d05601a00c5"
  },
  "scripts/acceptance/zeus-z1-data-upgrade.mjs": {
    "before": "61ad53e18fc460dbe05efa198e81f5e770973feaf90485c9d7823470f4d2b425",
    "after": "a4129c76809d757ef7a6cd6df1d749f2da7f375624199cf358efe3f6d5bf5ea3"
  },
  "scripts/acceptance/zeus-z1-dependency-review.mjs": {
    "before": "6bdd67fbe15ddc97c1a6686d573118d2081a2b8c73d7398649c82c643f1bb1f8",
    "after": "5ac6cbd097ab1aff1cfefc2ca59b12640fcde0fe521c6c383c16fa7068fb5f56"
  },
  "scripts/acceptance/zeus-z2-postgres.mjs": {
    "before": "671da19f62c8da6b43a387faaf59ca861922d603d861ba3806ce075ea4eed025",
    "after": "30d13cf022862cecbc0abc48335f05c7abfda30fc5972fa173cc2eee4cc208e2"
  },
  "scripts/acceptance/zeus-z3-output-postgres.mjs": {
    "before": null,
    "after": "c537d38d58531c334dae2a32023aa24430c44ff3b3c4d798d1fe98d5499bcf9a"
  },
  "scripts/acceptance/zeus-z3-qc-download-characterization.test.mjs": {
    "before": null,
    "after": "fafb652cde472ac8a73cc3048d9ac546cce8e9c177ba8370bbeebd5c5ffee106"
  },
  "scripts/acceptance/zeus-z2-commercial-approval.test.mjs": {
    "before": "6e39f063e6df2e1b66e2f76899c58d7bed623b114a830974336c986b0b8383e7",
    "after": "4da7dd4854bbef3fc00a12b7f21c7f7c2c035f022b7e7f0ce8195a72fb7e0f6f"
  },
  "apps/web/scripts/zeus-z3-qc-runtime.mjs": {
    "before": null,
    "after": "9c4c7ce80c4bfb83331c449041b9a0bf67f0468c21087dfb47df5829de0eee6e"
  },
  "scripts/acceptance/zeus-z3-output-approval.test.mjs": {
    "before": null,
    "after": "62720be855d0551bf47ae05d40c42d0658c11d8ffa170047fde65cdf3feef5bc"
  },
  "scripts/acceptance/zeus-z3-output-gate.mjs": {
    "before": null,
    "after": "85aefbb8b9c351f865024550c85c960a90611af5fffc97c3741a3bce1395d4fc"
  },
  "scripts/acceptance/zeus-z3-output-activate-local.mjs": {
    "before": null,
    "after": "f9b3ad353d3f4be85e69f2162bfb36b992efce2728b956c0fc6a098c7cd9d096"
  }
};
const root = new URL('../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const original = path => execFileSync('git', ['show', z3OutputOriginalRef + ':' + path], { cwd: root, windowsHide: true });
export function matchesZ3OutputApproval(path, bytes) {
  return Object.hasOwn(z3OutputPins, path) && hash(bytes) === z3OutputPins[path].after;
}
export function inverseZ3OutputInput(path, bytes) {
  if (!matchesZ3OutputApproval(path, bytes) || z3OutputPins[path].before === null) return bytes;
  const before = original(path);
  assert.equal(hash(before), z3OutputPins[path].before, 'Z3 QC original checkpoint drift: ' + path);
  return before;
}
export function verifyZ3OutputApproval(read) {
  assert.equal(Object.keys(z3OutputPins).length, 26, 'Z3 QC exact scope drift');
  for (const [path, pin] of Object.entries(z3OutputPins)) {
    assert(matchesZ3OutputApproval(path, read(path)), 'Z3 QC exact pin drift: ' + path);
    if (pin.before !== null) assert.equal(hash(original(path)), pin.before, 'Z3 QC original checkpoint drift: ' + path);
  }
}
