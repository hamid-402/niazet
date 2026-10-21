import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { approvedInvoiceFiles, matchesInvoiceApproval, verifyInvoiceDomain } from '../orbit-invoice-approval.mjs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const baseline = path => execFileSync('git', ['show', `2c701d7:${path}`], { encoding: 'utf8', windowsHide: true });
test('invoice class/issuance/ownership and inherited assertions stay identical', () => verifyInvoiceDomain(baseline, read));
test('approval never includes auth, ledger, schema, controllers or a directory wildcard', () => {
  for (const path of Object.keys(approvedInvoiceFiles)) assert.ok(!/auth|ledger|prisma|controller|\*/.test(path));
  assert.equal(matchesInvoiceApproval('apps/api/src/finance/ledger.service.ts', Buffer.from('anything')), false);
  assert.equal(matchesInvoiceApproval('apps/api/src/finance/invoices.service.ts', Buffer.from('wrong bytes')), false);
});
test('the additional domain guard rejects financial logic edits even before hash validation', () => {
  assert.throws(() => verifyInvoiceDomain(baseline, path => read(path).replace('amount,\n', 'amount: amount + 1,\n')));
  assert.throws(() => verifyInvoiceDomain(baseline, path => read(path).replace('where: { id: invoiceId, customerId }', 'where: { id: invoiceId }')));
});
test('all twelve approved files match; code/asset mutation fails; text checkout line endings are portable', () => {
  assert.equal(Object.keys(approvedInvoiceFiles).length, 12);
  for (const path of Object.keys(approvedInvoiceFiles)) {
    const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
    assert.equal(matchesInvoiceApproval(path, bytes), true, path);
    assert.equal(matchesInvoiceApproval(path, Buffer.concat([bytes, Buffer.from('changed')])), false, path);
    if (!path.endsWith('.ttf')) assert.equal(matchesInvoiceApproval(path, Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))), true, path);
  }
});
