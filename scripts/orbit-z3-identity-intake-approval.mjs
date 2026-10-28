import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Owner-approved identity/onboarding/intake packet only. Reconstructed bytes
// prove preservation of earlier contracts, NEVER acceptance of current code.
export const identityIntakeOriginalRef = 'c166209';
export const identityIntakeApiPins = {
  "apps/api/prisma/migrations/20261028120000_zeus_verified_identity_intake/migration.sql": {
    "before": null,
    "after": "419c7a3ce28535f8b685ecc5142a630e0c0a595aa3e7e89db79e8d3706903fb5"
  },
  "apps/api/prisma/schema.prisma": {
    "before": "775a712997552a4fd238cc288f1a9e8f9a5cf09e0dcf8f8a5c8238cd34ab9731",
    "after": "10d1d1fdaebac0ec1812b9afebce24f54e6cc2e30c82ba09524399aae55ca2b4"
  },
  "apps/api/src/account/account.module.ts": {
    "before": "4cae8235c8620e5307437d0636d09f86ee6e97e4df75c4055e8b8c74424a4e6f",
    "after": "32f87c363886327d8a5fdf5510da16a1d4c651a887cf820bcbb60db199653bd9"
  },
  "apps/api/src/account/account.service.ts": {
    "before": "bb768e11f0d70ee1ed1d8ecc7df9e0fc900d98639bf27977e02cf0fa9eb062fa",
    "after": "279314ed27798b8f460b402e415417724ac3b3596d5724a88227eaa3af625f2e"
  },
  "apps/api/src/account/customer-intake-config.ts": {
    "before": null,
    "after": "ba6fdce822cfd3b5a1bf2e1834a584d3fad0a1c7d8356f4948ea2ce3cd428d9e"
  },
  "apps/api/src/account/customer-onboarding.controller.ts": {
    "before": null,
    "after": "1dbdf2584cbb9bed6523433e22a188068310ea0b390deedb36172dea32063ff3"
  },
  "apps/api/src/account/customer-onboarding.service.ts": {
    "before": null,
    "after": "a10442535aa80790703e28e729897d3531ec1bf781c6b98a97d48a10cec45d11"
  },
  "apps/api/src/account/customer-private-data.spec.ts": {
    "before": null,
    "after": "22ac5c04be816db70bcecbcae99e21babd2303b5f1f264d83a8b2762576904fa"
  },
  "apps/api/src/account/customer-private-data.ts": {
    "before": null,
    "after": "7b46376fbfdfc0b84a97430eb4e9848ae1293c436fae0d03dc09d6b23ac5e891"
  },
  "apps/api/src/account/dto/onboarding.dto.ts": {
    "before": null,
    "after": "6f3e12271878a2d43cb6f17d58ccadcd99c295b9ad6941a872c1b251608f8872"
  },
  "apps/api/src/auth/auth-session.service.ts": {
    "before": "52c86c580498e2ca9ba1c5cacf0ed299cca8711993091e7fe5f5e0841a9a0153",
    "after": "409a4aa56e2f48cd84188e49c0c5413fa10fa9203472fd112f3e9eb35199c299"
  },
  "apps/api/src/auth/auth.module.ts": {
    "before": "d9f3c8e7650baedc30836078cf3e1b5f8782e78ba9a434fcd20ab7f53f258688",
    "after": "53d6d99fe6fe8825edbeb6c75518630d4d2997a834efcc7440867df7d0e3e5e7"
  },
  "apps/api/src/auth/auth.service.ts": {
    "before": "afce9e352c38c83857bf7cda1e8f8dd87abc8d02c8af622712c41151de2ccf4f",
    "after": "2300200064ceb3680a8dda562b8e02a86f38f8713b4015df6401fd625ecea1d4"
  },
  "apps/api/src/auth/dto/verified-email.dto.ts": {
    "before": null,
    "after": "c56a2bd9c1b29dbd09acc4fa5925ff3636412c14cfcd2bdec18593e32304fd42"
  },
  "apps/api/src/auth/verified-email-session.spec.ts": {
    "before": null,
    "after": "35ad467ca24bf8f268810deb6037380064b4177a76c1af2ec7123ab068845d74"
  },
  "apps/api/src/auth/verified-email-session.ts": {
    "before": null,
    "after": "eb6fc57344b51f9332e7f01f20bcea202899a9b217bef26f1afed800557c1ca6"
  },
  "apps/api/src/auth/verified-email.controller.ts": {
    "before": null,
    "after": "1c33cd1c4a18dae16f8fb4b330a5ac33e9851f4ee3cea7ba761a69e688cd1f19"
  },
  "apps/api/src/auth/verified-email.service.ts": {
    "before": null,
    "after": "a93bba85681cbe84d6762efe063b91594e8aa08ea9937c581854d99c53f1bb23"
  },
  "apps/api/src/auth/verified-identifier-contract.spec.ts": {
    "before": null,
    "after": "799787247a42c88bb00449f5d218a72ef70b2a29612a1f6ee39d062286bf96b4"
  },
  "apps/api/src/auth/verified-identifier-contract.ts": {
    "before": null,
    "after": "d768f821d265e7a86479fcc8cabd23bddd36dd677622cc4f15acf017e6d27f30"
  },
  "apps/api/src/orders/domain/fixed-registration-eligibility.ts": {
    "before": "bee9dff605d1a2150c34635ccd0c59c6438c346bf8d3b88edbec8ba987cae3d2",
    "after": "e4efe0865663ba87d516e6adb355bd6a69ee3837883a7724d929fa0b6fab1cb1"
  },
  "apps/api/src/orders/domain/order-intake.spec.ts": {
    "before": null,
    "after": "9f8182ab0216b71d24e09e86c1b4564aa753d3d896d7795d2b73d7d25fc8613a"
  },
  "apps/api/src/orders/domain/order-intake.ts": {
    "before": null,
    "after": "c790c0ef2a019ec2dc2ceff934a19ce7d68d23f267daf50e48155fa18a7dba8e"
  },
  "apps/api/src/orders/dto/order.dto.ts": {
    "before": "3836862fbbddb7344551b4d197d2e73660c5ca2d4118cf0a1dc02e4724db93e7",
    "after": "3405a23906190539080cbe309c7fdf97f7f8d062818c8d9b7fd9cefa89a9ab64"
  },
  "apps/api/src/orders/order-intake-contract.spec.ts": {
    "before": null,
    "after": "cd727102d4143f112a6aee2d5f844ef7c35d7961595b4cb5ebf6f3ab29b3edd0"
  },
  "apps/api/src/orders/order-intake-contract.ts": {
    "before": null,
    "after": "520a20446a701e8ad39a1c49537b141d39d2eea1dac0c7155b0734d31ac77c21"
  },
  "apps/api/src/orders/orders.admin.controller.ts": {
    "before": "46d6e3201a6554981a5e0c06b1d5c763376429ece5f79c522f893042689e9715",
    "after": "8931bf7755e7a5aa4ec0f85d9b74fb14f250fa28f984b35d979fd03e56d62631"
  },
  "apps/api/src/orders/orders.service.ts": {
    "before": "5d90a851d30c292521784ff18a62c6cf37e198cf4863be7c90b0ec5d1d4fb864",
    "after": "26f0def12e55b4d325d7fa506937f03b30bd9fd1c418678367bc2fe47b24ea33"
  }
};
export const identityIntakeAdapterPins = {
  "scripts/acceptance/zeus-z3-publication-ui-approval.test.mjs": {"before":"3c3854a34251d931d1de6aa5dea7f2a3132c45a2b98afc4ca91fb8e2e9b5b5e5","after":"a31e5cc1a7093a8fe0a75d1ddab9a545eaa7fc239dc4a2592e48d33101dd03b7"},
  "scripts/orbit-preservation-contract.mjs": {
    "before": "2b4f21549d0bd48ad077d9f6b91e1b66dd35e279885ab5a7b14269b102735fcf",
    "after": "fae35f7cbcc8e7730cf7aa172a1d9c5d1769470ec7ec4301374c2560df861668"
  },
  "scripts/orbit-z3-customer-continuation-approval.mjs": {
    "before": "b0c05018e677b3d385b226364a18acd3d6b27ab6f787d5798ba130cfe0286531",
    "after": "ae2a73bab2f2bab1feebff0f11a2487d0e34e5abb5fd79a8bda01b23cea9567f"
  },
  "scripts/acceptance/zeus-z3-registration-approval.test.mjs": {
    "before": "9834be71fe1a45411c5d1eecbddf2dc98893e13e2c09d93bc0c68170f06e6b44",
    "after": "5086d79c9393ee322d8569281686372732a6924656336dcf04657df4b88367bd"
  },
  "scripts/acceptance/zeus-z1-dependency-review.mjs": {
    "before": "df174b95ca55cc3bef1088384631e751889a9ae5d498ff0ca8ccb9365caf4d16",
    "after": "99b4cb8b91cebfcf16bf47bff1164e485db75bd75fe60ca931ce9ecfc26a9344"
  }
};
export const identityIntakeHash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const previous = new Map();
function original(path, pin) {
  if (!previous.has(path)) previous.set(path, execFileSync('git', ['show', identityIntakeOriginalRef + ':' + path], { cwd: new URL('../', import.meta.url), windowsHide: true }));
  const bytes = previous.get(path);
  assert.equal(identityIntakeHash(bytes), pin.before, 'Identity/intake historical hash drift: ' + path);
  return bytes;
}
export function matchesIdentityIntake(path, bytes) {
  return Object.hasOwn(identityIntakeApiPins, path) && identityIntakeHash(bytes) === identityIntakeApiPins[path].after;
}
export function inverseIdentityIntake(path, bytes) {
  const pins = { ...identityIntakeApiPins, ...identityIntakeAdapterPins };
  if (!Object.hasOwn(pins, path)) return bytes;
  const pin = pins[path];
  if (pin.before === null || identityIntakeHash(bytes) !== pin.after) return bytes;
  return original(path, pin);
}
export function verifyIdentityIntake(read) {
  assert.equal(identityIntakeOriginalRef, 'c166209');
  assert.equal(Object.keys(identityIntakeApiPins).length, 28, 'Identity/intake exact API scope drift');
  assert.equal(Object.keys(identityIntakeAdapterPins).length, 5, 'Identity/intake exact adapter scope drift');
  for (const [path, pin] of Object.entries({ ...identityIntakeApiPins, ...identityIntakeAdapterPins })) {
    assert.equal(identityIntakeHash(read(path)), pin.after, 'Identity/intake exact pin drift: ' + path);
    if (pin.before !== null) original(path, pin);
  }
}
