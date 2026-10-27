import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inverseZ2CommercialInput } from './orbit-z2-commercial-approval.mjs';
// Owner-approved Z1.1-Z1.6, 2026-10-25. These exact files only.
// Fixed baseline remains 2c701d7. EXEC-008 separately accepted local/mock
// activation; EXEC-009 pins only accepted order/payment/session refinements.
// Delivery correction: the wallet test uses public get() mocking rather than
// ConfigService's private setter. Same assertions and production sources.
export const z1DomainPins = {
  "apps/api/prisma/schema.prisma": {
    "before": "bfa97ddb906f4d2bdfb7e02940bd8b07a4bf6f375371b4df47408d87b66e99be",
    "after": "2691b0f6090d07d8950e1f44ac72900af5d5cb22affd26a65bdb7a704b498ebc"
  },
  "apps/api/prisma/migrations/20261025100000_zeus_wallet_funding/migration.sql": {
    "before": null,
    "after": "f8234d7394c7412dc0ed8489557f8c74a3a7b2f2f53c41fd3eb3d04c520c989f"
  },
  "apps/api/src/auth/auth-session.service.spec.ts": {
    "before": "875491b8527ec965a6e671864df82450b5df842d9a86a8c9c33916cde4feef57",
    "after": "6ff5327af0a09e6e8a684cb0b58230410ed108ed786133956c3fdbfa84f4aa2a"
  },
  "apps/api/src/auth/auth-session.service.ts": {
    "before": "5245d9239ffe53c1a05c30ae6e7438ebaa533087c3f6554386853226b3c0c65a",
    "after": "52c86c580498e2ca9ba1c5cacf0ed299cca8711993091e7fe5f5e0841a9a0153"
  },
  "apps/api/src/auth/auth.controller.ts": {
    "before": "e28ace8255ab6cca4aa00fd62718bf14dd9c805c5dc7754df973ee3fa46ce927",
    "after": "e4e7f5fae8cd83c7972a3d075b084ea29c554daac72bd3ca2c14c0cc0f4e04f4"
  },
  "apps/api/src/finance/finance.module.ts": {
    "before": "a794a7d20c05888ea6eb18abcc14ba6dd18d14120916812f6a60e537c940c6f9",
    "after": "a391ec704f1ead6b321ea9cba1749fbab2405ddd5d8e078aa79dd58f1c928ad9"
  },
  "apps/api/src/finance/idempotency.service.spec.ts": {
    "before": "28fa972b93eef8d8ba0aa9198f590df815be1c9f92076d06f3e6b0a1bb4cb8fd",
    "after": "9c0a4725aba5d1568aaaf9246931e5e2924f9a5e1852d683dc2c2f7752b5181c"
  },
  "apps/api/src/finance/idempotency.service.ts": {
    "before": "d151a0bfe5fab825872f2f32b32bbdc2d865b8eadd20ca99d6904c8cff3e4aac",
    "after": "34ba333a686e475dc14e8ad3c12ee69c9d63b218f8116796e6a2a46da5c3d630"
  },
  "apps/api/src/finance/payment-gateway.ts": {
    "before": "078be618453e61ccd295a1b84e7b96e777f86f283d9134520b944dbc2fcfd484",
    "after": "d9272031abe3b0f615213ac22faedda3179a7efba5b498af54176ec6dc9c7c54"
  },
  "apps/api/src/finance/payments.service.ts": {
    "before": "0e7715eee002a8605b7ac4477503b8ec175f4314573c3fcfca81eadcbae29524",
    "after": "04bbdad6c221c4bc0812901d38693c5147f3ce1a84de59e52c3bfc4c0d624b54"
  },
  "apps/api/src/finance/wallet-payments.controller.ts": {
    "before": null,
    "after": "54367ab82adb1165553e95f1c3f68e657c53d55ed89668b8643f71c9b7a96b83"
  },
  "apps/api/src/finance/wallet-payments.service.ts": {
    "before": null,
    "after": "de3189c435b900c5a38392cd5f6878c85fba7afc0efcea32b220e93b3022dbbd"
  },
  "apps/api/src/finance/wallet-payments.service.spec.ts": {
    "before": null,
    "after": "21000eed99fc17e7289867db9d917c51af878c4c52c37d310ec717d57689d56c"
  },
  "apps/api/src/orders/domain/order-workflow.service.ts": {
    "before": "d458f9f5ab95474feafc89df44ded81e002d348d7fc5a28aa86821875da5ca53",
    "after": "bfde217f1ecb96cd29cfb282b92d1cbde28d188f721381a45f047d3946701e5a"
  },
  "apps/api/src/orders/order-state-machine.ts": {
    "before": "36268072c280d36fb6ef0ab526e4861142bbb87578a92d9015dad89b4fec99d8",
    "after": "db51ed40eb814d594d03eda56041c8bcfbded61eba2f7a468673c661c3a225c2"
  }
};
const hash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
export function matchesZ1DomainApproval(path, bytes) {
  return Object.hasOwn(z1DomainPins, path) && hash(inverseZ2CommercialInput(path, bytes)) === z1DomainPins[path].after;
}
export function verifyZ1DomainApproval(baselineRead, currentRead) {
  for (const [path, pin] of Object.entries(z1DomainPins)) {
    assert(matchesZ1DomainApproval(path, currentRead(path)), 'Z1 exact approval drift: ' + path);
    if (pin.before !== null) assert.equal(hash(baselineRead(path)), pin.before, 'Z1 original baseline drift: ' + path);
  }
}
