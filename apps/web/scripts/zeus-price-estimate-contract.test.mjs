import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/components/price-estimate-contract.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { estimateRequest, readPriceEstimate } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const request = { serviceSlug: 'design', priority: 'urgent' };
const response = {
  policy_version: 'zeus-estimate-v1', currency: 'IRT', service_slug: 'design', package_id: null,
  priority: 'urgent', is_binding: false, payment_allowed: false, availability: 'not_checked',
  capacity_reserved: false, requires_operational_confirmation: true, status: 'estimated',
  base_price: 101, surcharge_pct: 30, surcharge_amount: 30, final_price: 131,
};

test('request contains only catalog identity and exactly matching supported priority', () => {
  assert.deepEqual(estimateRequest('design', '', 'urgent'), request);
  assert.deepEqual(estimateRequest('design', 'package', 'normal'), { serviceSlug: 'design', packageId: 'package', priority: 'normal' });
});
for (const urgency of ['low', 'high', 'same_day', '', '__proto__']) {
  test(`no invented mapping for ${urgency}`, () => assert.equal(estimateRequest('design', '', urgency), null));
}
test('no request until a service is selected', () => assert.equal(estimateRequest(undefined, '', 'normal'), null));
test('validated money is returned without leaking server fields', () => {
  assert.deepEqual(readPriceEstimate({ ...response, internal: 'not for display' }, request), {
    status: 'estimated', base_price: 101, surcharge_pct: 30, surcharge_amount: 30, final_price: 131,
  });
});
test('zero is real money, not an absent amount', () => {
  assert.equal(readPriceEstimate({ ...response, base_price: 0, surcharge_amount: 0, final_price: 0 }, request).final_price, 0);
});
test('quote required accepts only null amounts, never placeholder numbers', () => {
  const quote = { ...response, status: 'quote_required', base_price: null, surcharge_pct: null, surcharge_amount: null, final_price: null };
  assert.deepEqual(readPriceEstimate(quote, request), { status: 'quote_required' });
  assert.throws(() => readPriceEstimate({ ...quote, final_price: 0 }, request));
});
for (const [field, value] of Object.entries({
  policy_version: 'next', currency: 'IRR', service_slug: 'other', package_id: 'other', priority: 'normal',
  is_binding: true, payment_allowed: true, availability: 'confirmed', capacity_reserved: true,
  requires_operational_confirmation: false, status: 'paid', base_price: -1, surcharge_pct: 80,
  surcharge_amount: 31, final_price: 130,
})) {
  test(`rejects inconsistent response ${field}`, () => assert.throws(() => readPriceEstimate({ ...response, [field]: value }, request)));
}
for (const invalid of [NaN, Infinity, 1.5, 2_147_483_648, '131', null]) {
  test(`rejects invalid amount ${String(invalid)}`, () => assert.throws(() => readPriceEstimate({ ...response, final_price: invalid }, request)));
}
test('rejects non-object envelopes', () => {
  for (const value of [null, [], '131', 131]) assert.throws(() => readPriceEstimate(value, request));
});
test('historical estimate packet at 14180b2 preserves the complete original form after its three additive UI insertions', () => {
  const path = 'apps/web/src/app/(customer)/orders/new/page.tsx';
  const root = new URL('../../../', import.meta.url);
  const before = execFileSync('git', ['show', `30555d2a26bb5f9a4e1649160751929b5354d1bc:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true });
  // Z3 intentionally changes the wizard. Keep this old packet's exact proof,
  // not a false claim of byte equality for the new form. Current preservation
  // and all three steps are checked in zeus-order-composer-contract/runtime.
  const after = execFileSync('git', ['show', `14180b2:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).replaceAll('\r\n', '\n');
  const insertion = '          <PriceEstimate serviceSlug={selectedService?.slug} packageId={packageId} urgency={urgency} />\n';
  assert.equal(after.split(insertion).length, 3, 'Edit and review each include the estimate');
  assert.equal(after.replace('import { PriceEstimate } from "@/components/price-estimate";\n', '').replaceAll(insertion, ''), before.replaceAll('\r\n', '\n'));
});
