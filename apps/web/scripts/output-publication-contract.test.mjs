import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync(new URL('../src/components/output-publication-contract.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { readCustomerPublications, readLegacyQueue, readLegacyInspection, publicationDownloadPath, readPublicationBytes, outputKindLabel } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const at = '2026-10-27T09:30:00.000Z';
const file = { id: 'file-1', orderId: 'order-1', originalName: 'old.txt', fileKind: 'output', checksum: 'a'.repeat(64), createdAt: at };
test('file labels stay readable Persian and unknown kinds cannot access object prototypes', () => { assert.equal(outputKindLabel('output'), 'خروجی'); assert.equal(outputKindLabel('revision'), 'اصلاحیه'); assert.equal(outputKindLabel('__proto__'), 'فایل'); });
test('customer projection accepts only exact availability and does not retain staff fields', () => {
  const data = readCustomerPublications({ reviewerUserId: 'secret', files: [{ id: file.id, availability: 'released', approvedAt: at, reviewerUserId: 'secret' }] });
  assert.deepEqual(data, [{ id: file.id, availability: 'released', approvedAt: at }]);
  for (const availability of ['awaiting_qc', 'manual_review_required', 'unavailable']) assert.equal(readCustomerPublications({ files: [{ id: file.id, availability, approvedAt: null }] })[0].availability, availability);
});
for (const fields of [{ availability: 'passed' }, { availability: 'released', approvedAt: null }, { availability: 'manual_review_required', approvedAt: at }, { id: '../other' }, { approvedAt: '2026-02-30T09:30:00.000Z' }]) test('malformed publication fails closed: ' + JSON.stringify(fields), () => assert.throws(() => readCustomerPublications({ files: [{ id: file.id, availability: 'released', approvedAt: at, ...fields }] })));
test('duplicates and partial/absent data never mean released', () => {
  for (const raw of [undefined, null, {}, [], { files: null }, { files: [null] }]) assert.throws(() => readCustomerPublications(raw));
  const value = { id: file.id, availability: 'released', approvedAt: at };
  assert.throws(() => readCustomerPublications({ files: [value, value] }));
});
test('queue is bounded, opaque cursor is constrained, and automatic approval is never accepted', () => {
  assert.deepEqual(readLegacyQueue({ files: [file], nextCursor: null, automaticApproval: false }), { files: [file], nextCursor: null });
  for (const patch of [{ automaticApproval: true }, { nextCursor: '../x' }, { files: [file, file] }, { files: Array(101).fill(file) }, { files: [{ ...file, fileKind: 'input' }] }]) assert.throws(() => readLegacyQueue({ files: [file], nextCursor: null, automaticApproval: false, ...patch }));
});
const order = { id: file.orderId, code: 'OLD-1', title: 'آزمون نسخه', status: 'closed', serviceId: 'service-1', files: [{ ...file, scanStatus: 'clean', purgedAt: null, sizeBytes: 3, mimeType: 'text/plain' }], qcReviews: [] };
const service = { id: 'service-1', qcChecklistTemplates: [{ items: [{ id: 'item-1', label: 'بازبینی محتوا' }] }] };
test('manual legacy inspection binds exact order/file/service and current checklist', () => {
  const result = readLegacyInspection(order, service, file);
  assert.equal(result.reviewId, null); assert.deepEqual(result.items, service.qcChecklistTemplates[0].items);
  assert.equal(readLegacyInspection({ ...order, status: 'qc_in_review', qcReviews: [{ id: 'review-1', result: null }] }, service, file).reviewId, 'review-1');
});
for (const patch of [{ id: 'other' }, { serviceId: 'other' }, { files: [] }, { files: [{ ...order.files[0], purgedAt: at }] }, { files: [{ ...order.files[0], scanStatus: 'pending' }] }, { files: [{ ...order.files[0], checksum: 'b'.repeat(64) }] }, { qcReviews: [{ id: 'review-1', result: null }] }, { status: 'qc_in_review', qcReviews: [] }]) test('ambiguous/changed legacy inspection rejected: ' + JSON.stringify(patch), () => assert.throws(() => readLegacyInspection({ ...order, ...patch }, service, file)));
test('no checklist still produces an explicit human review contract, not an approval', () => {
  const data = readLegacyInspection(order, { ...service, qcChecklistTemplates: [] }, file);
  assert.deepEqual(data.items, []); assert.equal(Object.hasOwn(data, 'released'), false);
});
test('download always uses the local token proxy, never a response-supplied host or path', () => {
  assert.equal(publicationDownloadPath({ url: 'https://outside.invalid/private?token=a%2Fb%3Fc' }), '/api/backend/files/download?token=a%2Fb%3Fc');
  for (const url of ['/v1/files/download', '?token=', '?token=a&token=b', '?token=a%0Ab']) assert.throws(() => publicationDownloadPath({ url }));
});
test('actual bytes are bounded and must match exact expected size; no HTML/error is accepted', async () => {
  assert.deepEqual(await readPublicationBytes(new Response('abc'), 3), new TextEncoder().encode('abc'));
  await assert.rejects(() => readPublicationBytes(new Response('abcd'), 3));
  await assert.rejects(() => readPublicationBytes(new Response('ab'), 3));
  await assert.rejects(() => readPublicationBytes(new Response('no', { status: 403 }), 2));
  await assert.rejects(() => readPublicationBytes(new Response(''), 26214401));
});
test('getters cannot execute while reading contract data', () => {
  const raw = Object.defineProperty({}, 'files', { get() { throw new Error('getter executed'); }, enumerable: true });
  assert.throws(() => readCustomerPublications(raw), error => !error.message.includes('getter executed'));
});
