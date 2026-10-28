import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inverseRegistrationInput } from './orbit-z3-registration-approval.mjs';
// Z3 B3 presentation only, using approved QC APIs. No backend/auth/money change.
export const z3PublicationOriginalRef = '3868336';
export const z3PublicationPins = {
  "apps/web/src/app/(customer)/orders/[id]/page.tsx": {
    "before": "eb763329bcbc94325a3091d2b5e37e5c0a54d6ccd4b99f264ba7fcdff84faf8b",
    "after": "1657f2aed4dea7a0f81e9d62de25744415f68cf283fab17ff56824bc6a209d09"
  },
  "apps/web/src/app/(admin)/admin/qc/[id]/page.tsx": {
    "before": "a0c23a17393e020bd8282a7976e850c76b023d8982bafcf0c611eadbcb54da4a",
    "after": "6d084a7d33e38c45ef7500962b7507a6995c7e21d22cccc034a023199b3eae4a"
  },
  "apps/web/src/app/(admin)/admin/qc/page.tsx": {
    "before": "f775a0d33e581864a97bf62c4e639827a88695276d763ec44f59bd5b2134d2b6",
    "after": "a7957291ebb69ae746a230d34f0a3b052fad6de46752edde29d3b25d737e5489"
  },
  "apps/web/src/app/(admin)/admin/qc/legacy/page.tsx": {
    "before": null,
    "after": "e4f02ca576a4b38ada3a81519cf279b8f2836b356cb889030f6c9b624d105307"
  },
  "apps/web/src/components/output-publication-contract.ts": {
    "before": null,
    "after": "3551fe27e40685b0349c4bf9125be6e31c4beea2d0f53ca48a08b1ac4d9906d4"
  },
  "apps/web/src/components/customer-output-publications.tsx": {
    "before": null,
    "after": "08d2e6b8783e50f6f4d472993fed4b4535e3ef9f084a0918ad4359ad23a08084"
  },
  "apps/web/src/components/legacy-output-review.tsx": {
    "before": null,
    "after": "03ab89f92cfafb0158c9f8aca526fd0c6866404760b970ccf11cc7bacedc2d7c"
  },
  "apps/web/scripts/output-publication-contract.test.mjs": {
    "before": null,
    "after": "7e8977bb5ff30b7067465490af5790564a8a44e3fa49a7ad7704b7946ed8296b"
  },
  "apps/web/scripts/zeus-publication-browser.mjs": {
    "before": null,
    "after": "559741eef2dc4544bfc5b588c0854af05fa0e48603f2fda0a4aeb3a208d0ea73"
  },
  "scripts/acceptance/zeus-z3-output-postgres.mjs": {
    "before": "c537d38d58531c334dae2a32023aa24430c44ff3b3c4d798d1fe98d5499bcf9a",
    "after": "b7c1f078300d6476147596767c17d65218085c077bbb27246fa0c1e72b2808d6"
  },
  "scripts/orbit-z3-customer-ui-approval.mjs": {
    "before": "28993d50befc9caed2642b6d8c644c3b1a5cac33fb67494dcc8c93bbb8990757",
    "after": "6bbaf5e4b9163f7a4b101f0197a38c257ca9c53a2bd0c11a1428446e3496d1c5"
  },
  "scripts/orbit-z3-output-approval.mjs": {
    "before": "154d131997100480e6e2b324475f52b3197fe1501e03f4e62a6bce3d15bfa3f6",
    "after": "207d54eb160fedd047bff04c7ee258b88e6f1fe02a4e7d8b9295e352a24cd015"
  },
  "scripts/acceptance/zeus-z1-dependency-review.mjs": {
    "before": "5ac6cbd097ab1aff1cfefc2ca59b12640fcde0fe521c6c383c16fa7068fb5f56",
    "after": "a6e2f02d98cdab41676cb25b56ac8200d18e8409eac9d0839a6453dc67a3a7c5"
  },
  "scripts/acceptance/zeus-z3-publication-ui-approval.test.mjs": {
    "before": null,
    "after": "741ea4748c668daf045ac2001c694aed5b352397be417b76d35d654e0f9acfe3"
  },
  "scripts/acceptance/zeus-z3-publication-ui-gate.mjs": {
    "before": null,
    "after": "67228ef564d819e3b3b349d94f83588f93c35dbd637117e024757c6ca5742e08"
  },
  "apps/web/scripts/zeus-z3-qc-runtime.mjs": {
    "before": "9c4c7ce80c4bfb83331c449041b9a0bf67f0468c21087dfb47df5829de0eee6e",
    "after": "7e959a2b485ac526a774fdb8eab6bf4017d0cc8367a19d2752bdd56c48a6de03"
  }
};
const root = new URL('../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const originals = new Map();
function original(path) {
  if (!originals.has(path)) originals.set(path, execFileSync('git', ['show', z3PublicationOriginalRef + ':' + path], { cwd: root, windowsHide: true }));
  return originals.get(path);
}
export function matchesZ3PublicationApproval(path, bytes) {
  bytes = inverseRegistrationInput(path, bytes);
  return Object.hasOwn(z3PublicationPins, path) && hash(bytes) === z3PublicationPins[path].after;
}
export function inverseZ3PublicationInput(path, bytes) {
  bytes = inverseRegistrationInput(path, bytes);
  if (!matchesZ3PublicationApproval(path, bytes) || z3PublicationPins[path].before === null) return bytes;
  const before = original(path);
  assert.equal(hash(before), z3PublicationPins[path].before, 'Z3 B3 original source drift: ' + path);
  return before;
}
export function verifyZ3PublicationApproval(read) {
  assert.equal(Object.keys(z3PublicationPins).length, 16, 'Z3 B3 exact scope drift');
  for (const [path, pin] of Object.entries(z3PublicationPins)) {
    assert(matchesZ3PublicationApproval(path, read(path)), 'Z3 B3 pin drift: ' + path);
    if (pin.before !== null) assert.equal(hash(original(path)), pin.before, 'Z3 B3 original source drift: ' + path);
  }
}
