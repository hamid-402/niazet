import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync(new URL('../src/components/commercial-order-contract.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { readCommercialRevision, readCommercialState, commercialOfferRequest, readGatewayPayment, commercialId } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const offer = { id: 'revision-1', sequence: 1, fingerprint: 'a'.repeat(64), priority: 'normal', currency: 'IRT', base_price: 101, surcharge_pct: 0, surcharge_amount: 0, final_price: 101, issuedAt: '2026-10-27T09:30:00.000Z', expiresAt: '2026-10-27T09:45:00.000Z', proposedDeadlineAt: '2026-10-28T09:30:00.000Z', deadlineNormal: '2026-10-28T09:30:00.000Z', durationMode: 'elapsed_minutes', acceptedAt: null, deadlineAt: null, payableUntil: null, invalidatedAt: null };
const accepted = { ...offer, acceptedAt: '2026-10-27T09:31:00.000Z', deadlineAt: offer.proposedDeadlineAt, payableUntil: offer.expiresAt, paymentAllowed: true, financialReviewRequired: false, reservation: null };
test('revision/current are separate contracts; private fields are never projected', () => {
  assert.deepEqual(readCommercialRevision({ ...offer, actorUserId: 'private' }), offer);
  assert.deepEqual(readCommercialState(accepted), accepted);
  assert.equal(readCommercialState(null), null);
  assert.throws(() => readCommercialState(offer));
  for (const value of [undefined, [], false, 'legacy']) assert.throws(() => readCommercialState(value));
});
for (const [priority, pct, extra] of [['normal', 0, 0], ['urgent', 30, 30], ['same_day', 80, 80]]) test(`server arithmetic ${priority} is checked, not re-priced`, () => {
  const value = { ...offer, priority, surcharge_pct: pct, surcharge_amount: extra, final_price: 101 + extra, durationMode: priority === 'same_day' ? 'tehran_same_day_cutoff' : 'elapsed_minutes' };
  assert.equal(readCommercialRevision(value).final_price, value.final_price);
});
for (const [key, value] of Object.entries({ currency: 'IRR', priority: 'high', fingerprint: 'bad', sequence: 0, base_price: -1, surcharge_pct: 30, surcharge_amount: 1, final_price: 102, durationMode: 'business_hours', expiresAt: '2026-10-27T09:29:00.000Z', proposedDeadlineAt: null, acceptedAt: '2026-10-27T09:31:00.000Z', invalidatedAt: '2026-02-30T00:00:00.000Z', deadlineNormal: 'tomorrow' })) test(`invalid revision rejected: ${key}`, () => assert.throws(() => readCommercialRevision({ ...offer, [key]: value })));
for (const value of [0, 1.5, NaN, Infinity, '101', 2_000_000_001]) test(`invalid binding amount ${value}`, () => assert.throws(() => readCommercialRevision({ ...offer, final_price: value })));
test('accepted deadline cannot move, acceptance cannot follow expiry and payment bounds are coupled', () => {
  assert.throws(() => readCommercialState({ ...accepted, deadlineAt: '2026-10-29T09:30:00.000Z' }));
  assert.throws(() => readCommercialState({ ...accepted, acceptedAt: offer.expiresAt }));
  assert.throws(() => readCommercialState({ ...accepted, payableUntil: '2026-10-27T10:00:00.000Z' }));
});
test('payment never follows an invalidated, unaccepted or financial-review contract', () => {
  assert.throws(() => readCommercialState({ ...accepted, invalidatedAt: offer.issuedAt }));
  assert.throws(() => readCommercialState({ ...accepted, financialReviewRequired: true }));
  assert.throws(() => readCommercialState({ ...offer, paymentAllowed: true, financialReviewRequired: false, reservation: null }));
  const same = { ...accepted, priority: 'same_day', surcharge_pct: 80, surcharge_amount: 80, final_price: 181, durationMode: 'tehran_same_day_cutoff' };
  assert.throws(() => readCommercialState(same));
  assert.equal(readCommercialState({ ...same, reservation: { status: 'held', expiresAt: offer.expiresAt } }).paymentAllowed, true);
  for (const status of ['expired', 'released', 'committed', 'invented']) assert.throws(() => readCommercialState({ ...same, reservation: { status, expiresAt: offer.expiresAt } }));
});
test('fixed/manual/formula requests stay distinct and never include client money or dates', () => {
  assert.deepEqual(commercialOfferRequest({ serviceLine: { pricingModel: 'fixed' } }, 'urgent'), { priority: 'urgent' });
  assert.throws(() => commercialOfferRequest({ serviceLine: { pricingModel: 'manual_quote' } }, 'normal'), /عملیات/);
  assert.throws(() => commercialOfferRequest({ serviceLine: {} }, 'normal'));
  const value = commercialOfferRequest({ serviceLine: { pricingModel: 'formula' }, formResponses: { fields: [{ key: 'pages', type: 'number', answer: 3 }, { key: 'title', type: 'text', answer: 'ignored' }] } }, 'same_day');
  assert.equal(value.inputs.pages, 3); assert.deepEqual(Object.keys(value).sort(), ['inputs', 'priority']);
  assert.equal(Object.getPrototypeOf(value.inputs), null);
});
for (const key of ['__proto__', 'constructor', 'prototype', 'unknown/name']) test(`unsafe formula key ${key}`, () => assert.throws(() => commercialOfferRequest({ serviceLine: { pricingModel: 'formula' }, formResponses: { fields: [{ key, type: 'number', answer: 3 }] } }, 'normal')));
test('formula duplicate/oversized/invalid quantities fail closed without eval', () => {
  const order = fields => ({ serviceLine: { pricingModel: 'formula' }, formResponses: { fields } });
  const field = { key: 'pages', type: 'number', answer: 3 };
  assert.throws(() => commercialOfferRequest(order([field, field]), 'normal'));
  for (const answer of [1.5, -1, 1_000_001, '3', Infinity]) assert.throws(() => commercialOfferRequest(order([{ ...field, answer }]), 'normal'));
  assert.throws(() => commercialOfferRequest(order(Array.from({ length: 33 }, (_, i) => ({ ...field, key: 'key_' + i }))), 'normal'));
});
test('IDs, data-only envelopes and redirects cannot inject a URL or execute getters', () => {
  for (const id of ['', '../other', 'a/b', 'x?y', '%2f']) assert.throws(() => commercialId(id));
  const getter = Object.defineProperty({}, 'id', { get() { throw new Error('getter executed'); }, enumerable: true });
  assert.throws(() => readCommercialRevision(getter), error => !error.message.includes('getter executed'));
  assert.deepEqual(readGatewayPayment({ payment: { id: 'payment-1', gateway: 'mock' }, redirectUrl: 'javascript:bad()' }), { id: 'payment-1', gateway: 'mock', redirectUrl: null });
  assert.equal(readGatewayPayment({ payment: { id: 'p1', gateway: 'zarinpal' }, redirectUrl: 'https://www.zarinpal.com/pg/StartPay/authority' }).redirectUrl, 'https://www.zarinpal.com/pg/StartPay/authority');
  for (const url of ['javascript:alert(1)', 'https://evil.test/pg/StartPay/a', 'https://www.zarinpal.com.evil.test/pg/StartPay/a', 'https://user@www.zarinpal.com/pg/StartPay/a', 'https://www.zarinpal.com:444/pg/StartPay/a', 'https://www.zarinpal.com/pg/StartPay/a?next=bad']) assert.throws(() => readGatewayPayment({ payment: { id: 'p1', gateway: 'zarinpal' }, redirectUrl: url }));
});
