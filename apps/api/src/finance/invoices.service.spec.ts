import { buildInvoicePdf } from './invoices.service';

describe('invoice PDF', () => {
  it('creates a valid single-page PDF payload', () => {
    const pdf = buildInvoicePdf({
      invoiceNumber: 'INV-1',
      orderCode: 'ORD-1',
      amount: 250_000,
      issuedAt: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(pdf.toString()).toContain('250,000 IRT');
    expect(pdf.toString()).toContain('%%EOF');
  });
});
