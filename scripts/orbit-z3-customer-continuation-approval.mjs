import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inverseIdentityIntake } from './orbit-z3-identity-intake-approval.mjs';

// Separate standing Z3 presentation authority. This module grants NO API,
// auth, role, schema or financial implementation exemption. Pins alone do not
// certify runtime UI acceptance or phase completion.
export const customerContinuationPins = {
  "apps/web/src/app/(customer)/orders/[id]/page.tsx": {
    "before": "1657f2aed4dea7a0f81e9d62de25744415f68cf283fab17ff56824bc6a209d09",
    "after": "83cb062c19604e25e9bfc221a0849579444240130c264be48944ca7c89028b26"
  },
  "apps/web/src/app/(customer)/orders/new/page.tsx": {
    "before": "bf180269302a7a9cec6bef90907c199623c121e13fbd5fb09de8d165d0bebc53",
    "after": "5804691607a4167ee81b7adecbec21214fde0c06e85b513192dd163719b95b20"
  },
  "apps/web/src/app/(customer)/wallet/page.tsx": {
    "before": "15c2b4dce0348a5a2be388da8b52f6b2bd551a24901c6fc8351df4e5365d5538",
    "after": "83aeb06c5afaf6bf5c492ff84e44edaff27b3c18e98a21b21d86f357aaf34045"
  },
  "apps/web/src/app/globals.css": {
    "before": "7d68c518936f6e9e9f2e080e02223ab20cd1490547a7e2c73a719f58d47f6db3",
    "after": "27ed9d6681f99633bab613867bf49d6143b774c2ccd1e1e9af5c5c2da6821d8a"
  },
  "apps/web/src/app/layout.tsx": {
    "before": "ded0996530be1324c8d84f52bf94da00c765573d0212052a3df6636cb6017b95",
    "after": "a635ab08884e7732f251adeb2ba809e79e58dc864af482e2528a0128c2602253"
  },
  "apps/web/src/app/login/page.tsx": {
    "before": "21e5db6959de03b9e485b9cee7761c2627fb91b80273ca6349c89574fe2bfe7a",
    "after": "7710e8b1b71e001e84c6cb7d424efb00501008050a096f2ca04f90a1d9adfb11"
  },
  "apps/web/src/app/login/otp/page.tsx": {
    "before": null,
    "after": "3d4ac3574cdaf82d41327d2e550d9fda807341eef7046d9c73a9c2766cc3bc2b"
  },
  "apps/web/src/components/customer-navigation.ts": {
    "before": null,
    "after": "bc3018a2be2fed2ecf62a3ede040a6d31d3b14dad6fb790e9d2f50734c79ecb6"
  },
  "apps/web/src/components/login-screen.tsx": {
    "before": null,
    "after": "372e2331d4b57e31428561965f75eeec800c397b2a1b57eaff1b4d13070c2391"
  },
  "apps/web/src/components/orbit-customer-surface.module.css": {
    "before": "6afcf5e70935000113f538a99625881f20fcfcd8110d16e05e38476e6ae5a99f",
    "after": "40664c9e70c46ad182080b8ff6d16295dbfdd87a15a0c20161a4df4cac7b0ee5"
  },
  "apps/web/src/components/orbit-hero.module.css": {
    "before": "dc1fa052ca4cb6483a04d0759a3d9594b40fc9587de0b407d902a8d270b607c9",
    "after": "6b3260d6155940fc423301c73885b325201ec78ab24b7c081bacadc0a03e3765"
  },
  "apps/web/src/components/orbit-ops-surface.module.css": {
    "before": "cb55a2cab02649f4f6027353d87f92c886e3ed554406b383b87481e90639e0b5",
    "after": "bada9515a2250c7cdcbb5b85658b9d80860b8319cc5b3203a33fc38894087d75"
  },
  "apps/web/src/components/ui.tsx": {
    "before": "60893014b3da5ed5c6f67f0eaea579535d5a88702c42af7b5aaea2161b943e34",
    "after": "e60bed49f483c49c04ee8a703898c96fd4a5240b61c0618587d0280fc6c915de"
  }
};
export const customerContinuationAdapterPins = {
  "apps/web/tests/phase8-visual-baseline.json": {"before":"4dc6019b18c398472f3812b9420081803c1291d9550ccde9d77eb120f4fbc0f5","after":"8f3bd730e32ade793cc9483115093783da2d41d1c40cc7d6efb4c18de327b416"},
  "scripts/acceptance/zeus-z2-commercial-approval.test.mjs": {
    "before": "4da7dd4854bbef3fc00a12b7f21c7f7c2c035f022b7e7f0ce8195a72fb7e0f6f",
    "after": "67253dac6b4bb1717786096791b5d8a4f5e0ba77d9c1e0d1790e8ea41d909041"
  },
  "scripts/acceptance/zeus-z3-output-approval.test.mjs": {
    "before": "62720be855d0551bf47ae05d40c42d0658c11d8ffa170047fde65cdf3feef5bc",
    "after": "aa730f8546143291ee5a1b37d0708c2c8889ba9ca1693382a39963774010668c"
  },
  "scripts/acceptance/zeus-z3-publication-ui-approval.test.mjs": {
    "before": "741ea4748c668daf045ac2001c694aed5b352397be417b76d35d654e0f9acfe3",
    "after": "3c3854a34251d931d1de6aa5dea7f2a3132c45a2b98afc4ca91fb8e2e9b5b5e5"
  },
  "apps/web/scripts/zeus-order-composer-contract.test.mjs": {
    "before": "12c87679f594bc8c7ea4bbd70a85c436b49814f162084eb42b35dbc79cdd9d8e",
    "after": "de27d70635cbc32c46c287a0757267adf966ac3f8c6cc8929ef1256442763a1a"
  },
  "apps/web/scripts/phase8-ui-runtime.mjs": {
    "before": "ccbdb613792114249bc6f65f6c6cc75901bb09059106f2b50c0e9c526385feb3",
    "after": "8509690531ad2df36707933b40f536770a6bdabac2524c6f60da4293b2b02455"
  },
  "apps/web/scripts/zeus-commercial-order-runtime.mjs": {
    "before": "13103c65d2af40e4e657a54bb70951c4630496df7a7e33f1515a508220d921eb",
    "after": "8283ed9970b719df6c7cb88babc50ca5c7a6055840449090f0cee2b4fe2edbcf"
  }
};
export const customerContinuationGuardPin = {
  "before": "585f88d1d903f2720b720412ec7cbb2f80b4eec5571881018a483908127ca7b7",
  "after": "2b4f21549d0bd48ad077d9f6b91e1b66dd35e279885ab5a7b14269b102735fcf"
};
export const customerHistoricalReviewerPin = { before: 'f51c807c410964b90c9c7c8fe020932d1829c0b69f7665196af79e127429f234', after: 'df174b95ca55cc3bef1088384631e751889a9ae5d498ff0ca8ccb9365caf4d16' };
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const guard = 'scripts/orbit-preservation-contract.mjs';
export function matchesCustomerContinuation(path, bytes) {
  return Object.hasOwn(customerContinuationPins, path) && hash(bytes) === customerContinuationPins[path].after;
}
export function inverseCustomerContinuation(path, bytes) {
  bytes = inverseIdentityIntake(path, bytes);
  if (path === 'scripts/acceptance/zeus-z1-dependency-review.mjs') {
    if (hash(bytes) !== customerHistoricalReviewerPin.after) return bytes;
    let source = bytes.toString('utf8').replaceAll('\r\n', '\n');
    for (const addition of [
      "import { inverseCustomerContinuation, matchesCustomerContinuation } from '../orbit-z3-customer-continuation-approval.mjs';\n",
      ' || matchesCustomerContinuation(path, readFileSync(new URL(path, root)))',
    ]) { assert.equal(source.split(addition).length, 2); source = source.replace(addition, ''); }
    const wrap = 'inverseCustomerContinuation(path, readFileSync(new URL(path, root)))';
    assert.equal(source.split(wrap).length, 2); source = source.replace(wrap, 'readFileSync(new URL(path, root))');
    assert.equal(hash(source), customerHistoricalReviewerPin.before, 'Historical reviewer changed outside exact UI recognition');
    return Buffer.from(source);
  }
  if (path === guard) {
    if (hash(bytes) !== customerContinuationGuardPin.after) return bytes;
    let source = bytes.toString('utf8').replaceAll('\r\n', '\n');
    for (const addition of [
      "import { inverseCustomerContinuation, verifyCustomerContinuation } from './orbit-z3-customer-continuation-approval.mjs';\n",
      '  verifyCustomerContinuation(rawRead);\n',
      '  const read = path => inverseCustomerContinuation(path, rawRead(path));\n',
    ]) { assert.equal(source.split(addition).length, 2); source = source.replace(addition, ''); }
    source = source.replace('  const rawRead = path => readFileSync', '  const read = path => readFileSync');
    assert.equal(hash(source), customerContinuationGuardPin.before, 'UI guard adapter changed outside exact wiring');
    return Buffer.from(source);
  }
  if (Object.hasOwn(customerContinuationAdapterPins, path)) {
    const pin = customerContinuationAdapterPins[path];
    if (hash(bytes) !== pin.after) return bytes;
    const previous = execFileSync('git', ['show', '7e5409f:' + path], { cwd: new URL('../', import.meta.url), windowsHide: true });
    assert.equal(hash(previous), pin.before, 'UI test adapter historical hash drift: ' + path);
    return previous;
  }
  if (!matchesCustomerContinuation(path, bytes) || customerContinuationPins[path].before === null) return bytes;
  const previous = execFileSync('git', ['show', '7e5409f:' + path], { cwd: new URL('../', import.meta.url), windowsHide: true });
  assert.equal(hash(previous), customerContinuationPins[path].before, 'UI historical hash drift: ' + path);
  return previous;
}
export function verifyCustomerContinuation(read) {
  const currentRead = read;
  read = path => inverseIdentityIntake(path, currentRead(path));
  assert.equal(Object.keys(customerContinuationPins).length, 13, 'Customer continuation exact UI scope drift');
  for (const [path, pin] of Object.entries(customerContinuationPins)) {
    assert(path.startsWith('apps/web/src/') && !path.startsWith('apps/web/src/lib/'), 'Non-UI path in presentation approval');
    assert(matchesCustomerContinuation(path, read(path)), 'Customer continuation UI pin drift: ' + path);
    if (pin.before !== null) inverseCustomerContinuation(path, read(path));
  }
  assert.equal(hash(read(guard)), customerContinuationGuardPin.after, 'Customer continuation guard pin drift');
  inverseCustomerContinuation(guard, read(guard));
  const reviewer = 'scripts/acceptance/zeus-z1-dependency-review.mjs';
  assert.equal(hash(read(reviewer)), customerHistoricalReviewerPin.after, 'Customer historical reviewer pin drift');
  inverseCustomerContinuation(reviewer, read(reviewer));
  for (const [path, pin] of Object.entries(customerContinuationAdapterPins)) {
    assert.equal(hash(read(path)), pin.after, 'Customer continuation test adapter pin drift: ' + path);
    inverseCustomerContinuation(path, read(path));
  }
}
