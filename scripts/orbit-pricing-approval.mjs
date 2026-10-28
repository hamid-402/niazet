import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Owner approval 2026-10-24, ZEUS-EXEC-002: public, nonbinding catalog
// estimates only. No blanket pricing/API exemption; text is LF-normalized.
export const approvedPricingFiles = {
  'apps/api/src/app.module.ts': '9d0d3c111235dae07907318fa8d0a54df2f3e5d87250b10fc0729765570e2904',
  'apps/api/src/pricing/dto/calculate-price.dto.ts': 'b4d8d9e18e4a7c7cd648f3cb273c863d0eb71e01999ecce269211b166b65c3db',
  'apps/api/src/pricing/pricing-calculation.ts': 'd8576f12c8f97515ebfd53a5a773e9c702da91f85103daffc5791032d9ae6a48',
  'apps/api/src/pricing/pricing-calculation.spec.ts': '9d6a8488d5b1daad29e2376f54869d0170f7de2930f9b44a503e536762965c98',
  'apps/api/src/pricing/pricing.service.ts': 'c3ede71366baf5310b2382108890e5c1e6dca55483d9d82069ae60546dada799',
  'apps/api/src/pricing/pricing.service.spec.ts': 'f98d521145cbc5ebd4363e6666a5158aec5e16e75436e9de11eb68a3a9e3701a',
  'apps/api/src/pricing/pricing.controller.ts': '3f8247c08aeb1f3625cb04529f57a8894ae7818aa2ddec53586ae6f94b0ce72a',
  'apps/api/src/pricing/pricing.http.spec.ts': '47bc3f691e56e19e1abf21a49c5c8efce822c676d42479e5af9382cc6d5b3592',
  'apps/api/src/pricing/pricing.module.ts': '8c6b764af4d61b9303f5a1a4f4363eefc9f8b055907f698d51c959a70c8a86c5',
};

const normalize = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
export function matchesPricingApproval(path, bytes) {
  return Object.hasOwn(approvedPricingFiles, path) &&
    createHash('sha256').update(normalize(bytes)).digest('hex') === approvedPricingFiles[path];
}

export function verifyPricingWiring(previous, current) {
  const source = normalize(current);
  const importLine = "import { PricingModule } from './pricing/pricing.module';\n";
  const moduleLine = '    PricingModule,\n';
  assert.equal(source.split(importLine).length, 2, 'Exactly one PricingModule import approved.');
  assert.equal(source.split(moduleLine).length, 2, 'Exactly one PricingModule entry approved.');
  assert.equal(source.replace(importLine, '').replace(moduleLine, ''), normalize(previous),
    'Only additive PricingModule wiring approved; all existing guards/modules stay identical.');
}

export function verifyPricingApproval(baselineRead, currentRead) {
  for (const path of Object.keys(approvedPricingFiles)) {
    assert.ok(matchesPricingApproval(path, currentRead(path)), `Pricing approval missing or byte pin changed: ${path}`);
  }
  const path = 'apps/api/src/app.module.ts';
  verifyPricingWiring(baselineRead(path), currentRead(path));
}
