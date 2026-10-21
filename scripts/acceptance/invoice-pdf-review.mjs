import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

// Read-only application review: invoke the existing compiled renderer with
// explicit test values, without a database, credentials, or invoice mutation.
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { buildInvoicePdf } = apiRequire('./dist/finance/invoices.service.js');
const directory = new URL('../../.artifacts/acceptance/invoice-review/', import.meta.url);
mkdirSync(directory, { recursive: true });
const base = { invoiceNumber: 'INV-00000000-0000-4000-8000-000000000123', orderCode: 'NIA-20261021-001', amount: 250000, issuedAt: new Date('2026-10-21T06:00:00.000Z') };
for (const [name, values] of [['current-standard', base], ['persian-probe', { ...base, orderCode: 'نیازت-آزمایش-۱۲۳' }]]) {
  const pdf = buildInvoicePdf(values);
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.ok(pdf.toString().includes('250,000 IRT'));
  writeFileSync(new URL(`${name}.pdf`, directory), pdf);
}
console.log('Existing invoice renderer sampled without database changes: standard output plus explicitly synthetic Persian glyph probe. Visual/RTL acceptance is not implied.');
