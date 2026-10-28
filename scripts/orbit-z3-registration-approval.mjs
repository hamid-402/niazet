import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Owner-approved Z3 fixed registration ONLY. Historical reconstruction is not
// acceptance of the current implementation. No directory or status waiver.
export const registrationOriginalRef = '7e5409f';
export const registrationApiPins = {
  "apps/api/src/orders/order-state-machine.ts": {
    "before": "db51ed40eb814d594d03eda56041c8bcfbded61eba2f7a468673c661c3a225c2",
    "after": "76dc2d21480bb990af2988ac939551b5faa2d89a66e6f2006b10550f0e6107c0"
  },
  "apps/api/src/orders/domain/order-workflow.service.ts": {
    "before": "bfde217f1ecb96cd29cfb282b92d1cbde28d188f721381a45f047d3946701e5a",
    "after": "b6a89fac53822116c32c22eb3009cccd1aa634b415c43303683158d1f91fde18"
  },
  "apps/api/src/orders/domain/fixed-registration-eligibility.ts": {
    "before": null,
    "after": "bee9dff605d1a2150c34635ccd0c59c6438c346bf8d3b88edbec8ba987cae3d2"
  },
  "apps/api/src/orders/domain/fixed-registration-eligibility.spec.ts": {
    "before": null,
    "after": "fc3d53bd37f687ea063938adf100a34a772cc94463a9fe7bb541a9bcec05c6ee"
  },
  "apps/api/src/pricing/commercial.controller.ts": {
    "before": "2e833347997afd680a2e74fd161976edd1750c72c18f6ee43816995a3f837b48",
    "after": "fd9be7b150f2da4a7b99180379fe0892caf291b2be0c705b0b350e3288861539"
  },
  "apps/api/src/pricing/commercial.dto.ts": {
    "before": "695d90828f7c003e86f88d0374b7b67a232273c5bd3ef14d88ca4b069972482e",
    "after": "60fbc5536a9764be4140a76112281f5e47b19d1934def02bce816b7ec860e267"
  },
  "apps/api/src/pricing/commercial.module.ts": {
    "before": "2be1843cdc31536aab34b7d093b54ea5a9093b90c06b0352996ef6f56299e11d",
    "after": "13dc47e88c34fc49cdefb70b8e65ed14501699a0cf30291ec150ed84b6b0c981"
  },
  "apps/api/src/pricing/commercial.service.ts": {
    "before": "57244dd6394dfed6a4e2a9fbbeaae0bf7385dfd1c10d7a1cd13dface227adc69",
    "after": "147eb186016af49b890ff8ab95269703be744221be447babaf8e8531ea2eccee"
  },
  "apps/api/src/pricing/fixed-registration.service.ts": {
    "before": null,
    "after": "91909f7430acbe2bc65cc83a210b485a8b3b69c90ecaf97e29d89dbb149b6455"
  }
};
export const registrationAdapterPins = {
  "scripts/orbit-preservation-contract.mjs": {
    "before": "5c7858d24b6d414a1d53c6064f12d3360a874a3821a50e1365d128221cdbeb42",
    "after": "585f88d1d903f2720b720412ec7cbb2f80b4eec5571881018a483908127ca7b7"
  },
  "scripts/orbit-z3-publication-ui-approval.mjs": {
    "before": "9defd7263f70e77299b21af20991a600493162c053568831341fe5a01ef14e84",
    "after": "b2c944fac980d05b8eb3386edef4f48b3ae1e338b5620389dda1d654363ab12c"
  },
  "scripts/acceptance/zeus-z1-dependency-review.mjs": {
    "before": "a6e2f02d98cdab41676cb25b56ac8200d18e8409eac9d0839a6453dc67a3a7c5",
    "after": "f51c807c410964b90c9c7c8fe020932d1829c0b69f7665196af79e127429f234"
  },
  "scripts/acceptance/zeus-z2-postgres.mjs": {
    "before": "30d13cf022862cecbc0abc48335f05c7abfda30fc5972fa173cc2eee4cc208e2",
    "after": "7ba1acbdc0d20a8ad83b6db8efbace2dbf536ba4dc1fd150cef2ab453498b040"
  },
  "scripts/acceptance/zeus-z3-registration-cases.mjs": {
    "before": null,
    "after": "301183db33b15608d1e9707c59439f3e06f2898ba259e9beeb6b797af7f6aa6f"
  }
};
const pins = () => ({ ...registrationApiPins, ...registrationAdapterPins });
export const registrationHash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const originals = new Map();
function original(path, pin) {
  if (!originals.has(path)) originals.set(path, execFileSync('git', ['show', `${registrationOriginalRef}:${path}`], { cwd: new URL('../', import.meta.url), windowsHide: true }));
  const bytes = originals.get(path);
  assert.equal(registrationHash(bytes), pin.before, 'Registration original hash drift: ' + path);
  return bytes;
}
export function matchesRegistrationApproval(path, bytes) {
  return Object.hasOwn(registrationApiPins, path) && registrationHash(bytes) === registrationApiPins[path].after;
}
export function inverseRegistrationInput(path, bytes) {
  const approved = pins();
  if (!Object.hasOwn(approved, path)) return bytes;
  const pin = approved[path];
  if (registrationHash(bytes) !== pin.after || pin.before === null) return bytes;
  return original(path, pin);
}
export function verifyRegistrationApproval(read) {
  assert.equal(Object.keys(registrationApiPins).length, 9, 'Registration exact API scope drift');
  for (const [path, pin] of Object.entries(pins())) {
    assert.equal(registrationHash(read(path)), pin.after, 'Registration exact pin drift: ' + path);
    if (pin.before !== null) original(path, pin);
  }
}
