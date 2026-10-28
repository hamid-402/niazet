import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inverseZ2CommercialInput } from './orbit-z2-commercial-approval.mjs';
// ZEUS-EXEC-010, owner-approved Z1.1/Z1.3 scope. Exact paths only;
// does not authorize live providers, financial data repair or baseline rebase.
export const z1DataPins = {
  "apps/api/src/feedback/feedback.module.ts": {
    "before": "ac3edf13c322477f47543411090c677af17f4d6b6efaa515b2e2e593f2aa0f66",
    "after": "1d47df00ff43d0168e7532d05b66642e174fad59da36f41ff5981cce67240433"
  },
  "apps/api/src/contracts/calendar.controller.ts": {
    "before": null,
    "after": "bc03d4bdb0e4033969fe3d621259f4df0950c1205326139d31fd25bb22909b40"
  },
  "apps/api/src/contracts/dashboard.controller.ts": {
    "before": null,
    "after": "1db69547819afc56f3638070d60d9be2934b9fb787a29c953faabb93b87b801d"
  },
  "apps/api/src/contracts/dashboard.service.ts": {
    "before": null,
    "after": "9592ebcfed2af36ec62c2851cd780ef56d66f74d91779405b02c36d60d0a0c5d"
  },
  "apps/api/src/contracts/deferred-ai.controller.ts": {
    "before": null,
    "after": "7ab84fb6578c84be125598fee16913e6aadd1a3bf5612a9a05f2f5c8f0fa5e8f"
  },
  "apps/api/src/contracts/order-snapshot.ts": {
    "before": null,
    "after": "0cca103de0dd8f53c8d0fd71af7d2df99ebdb0d50a3b96ea4afff69affbb9bb2"
  },
  "apps/api/src/contracts/review.dto.ts": {
    "before": null,
    "after": "f72731e25b01a33422f862ec8bf33e6ab6489405450b22904eda998637c386ef"
  },
  "apps/api/src/contracts/reviews.controller.ts": {
    "before": null,
    "after": "1af4832c0b72d7ba2a18a6879c3b37d86f8fe76cdecf986e85aaa336a37d0d54"
  },
  "apps/api/src/contracts/reviews.service.spec.ts": {
    "before": null,
    "after": "030f6658cad9f910c528d042f8921f7da3931ef9d214a018640c3db1fe0b5be3"
  },
  "apps/api/src/contracts/reviews.service.ts": {
    "before": null,
    "after": "f90c59d1c7399c0b1808707539b3558da3720bb87ddabcd3ad180d76e35581a8"
  },
  "apps/api/src/contracts/service-policy.controller.ts": {
    "before": null,
    "after": "d55116499cf815082cc4103558325ae0035b44add403504d860b5558fb671971"
  },
  "apps/api/src/contracts/sla-calendar.spec.ts": {
    "before": null,
    "after": "683682daced3a3d3410d9f427063da07007ce002df9d1803e6a171ab7ed54bf1"
  },
  "apps/api/src/contracts/sla-calendar.ts": {
    "before": null,
    "after": "89e210defcc9f6bc3e50b722d1d9ea66b8b938ee6d88b21327b86052bac38ead"
  },
  "apps/api/src/contracts/support-scope.guard.ts": {
    "before": null,
    "after": "b47b9afdcfd708b6f595ca1e9aaa1bf907355c96eaee69a1ee95fb7791388813"
  },
  "apps/api/src/contracts/transaction-error.ts": {
    "before": null,
    "after": "3814bf2be876606f4df388fb2e81e85862308c29f79aceb7c3c0f9ff9bf5b85a"
  },
  "apps/api/src/catalog/catalog.module.ts": {
    "before": "dc50fb5a1184657a420c086db2ee77939bd08b62a9a14ce45d5946e27d13b291",
    "after": "df5ae8ee9f9e1f039ae9bc21cd36466b9ddc7975800f5456d473a9155cf8788c"
  },
  "apps/api/src/catalog/catalog.service.ts": {
    "before": "164849e84b15ee262f7bc205dc8b89c8e20296828428f936058f5318c6b63103",
    "after": "48ab9734741183f7b449bd886c297e472d680a637a4b1f0bdcf9db5b83f20535"
  },
  "apps/api/src/orders/domain/order-query.service.ts": {
    "before": "0135f011c64d0a6a298fdcbac160c06c80251c8b9068a90e416d803466f42397",
    "after": "3ea47a67fe8adadd48de934efbc55878b427959ecd217f3cff1d46b6ebb06185"
  },
  "apps/api/src/tickets/tickets.controller.ts": {
    "before": "89564be4aac12b142b725e82d5025ba6fe8b8ce007ab7a6c458e9e3ee0299673",
    "after": "efbdea3e0b98339ea0f798ba3a42234ed23b947367c3702e7d2f3fba4adfdfe8"
  },
  "apps/api/src/tickets/tickets.service.ts": {
    "before": "a537f779a29f18d8652baa8f6846cfc750b41efdafc9901139da79f092a733dd",
    "after": "c7b24b5e35e072cdd598f90c5679905b8f9d4273646d45308f9755526b5ba5e0"
  },
  "apps/api/src/tickets/tickets.module.ts": {
    "before": "9c829acf47d52310d586567c19f3fc48686291964318a6714e28fbc924e78a8f",
    "after": "8503684ff742e1ff6782cdb5e4348b2b573f419d617b9d436524572dc6bdaec6"
  },
  "apps/api/src/tickets/tickets.support.controller.ts": {
    "before": "86248b0a6ab39a0ba84cb4552c900b134d3d81cde3e46f9e24a7c97f535a90d8",
    "after": "6c31d433264845ce14af49b68adc13f888cc45d38c393e5867ba04c8613f33b6"
  },
  "apps/api/prisma/migrations/20261026100000_zeus_data_contracts/migration.sql": {
    "before": null,
    "after": "bd0bc9ef9cad86153103862498c58c97df199b5b2ce8b28911c6202c1dd8e2dc"
  }
};
const hash = v => createHash('sha256').update(v.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
export function matchesZ1DataApproval(path, bytes) { return Object.hasOwn(z1DataPins, path) && hash(inverseZ2CommercialInput(path, bytes)) === z1DataPins[path].after; }
export function verifyZ1DataApproval(originalRead, currentRead) {
  for (const [path, pin] of Object.entries(z1DataPins)) {
    assert(matchesZ1DataApproval(path, currentRead(path)), 'Z1 data/API pin drift: ' + path);
    if (pin.before !== null) assert.equal(hash(originalRead(path)), pin.before, 'Z1 data/API baseline drift: ' + path);
  }
}
