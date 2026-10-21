import { buildInvoicePdf, invoiceTextRuns } from './invoice-pdf.renderer';

describe('approved invoice presentation', () => {
  const input = {
    invoiceNumber: 'INV-00000000-0000-4000-8000-000000000123',
    orderCode: 'NIA-20261021-001',
    amount: 250000,
    issuedAt: new Date('2026-10-21T06:00:00Z'),
  };
  it('keeps RTL words logical for shaping and LTR identifiers intact', () => {
    expect(invoiceTextRuns('نیازت با ما')).toEqual(['نیازت با ما']);
    expect(invoiceTextRuns('INV-123')).toEqual(['INV-123']);
    expect(invoiceTextRuns('نیازت-آزمایش-۱۲۳')).toEqual([
      '۱۲۳',
      'نیازت-آزمایش-',
    ]);
    expect(invoiceTextRuns('کد INV-123')).toEqual(['INV-123', 'کد ']);
  });
  it.each([0, 250000, 2147483647])(
    'embeds fonts and keeps the exact original amount %i in searchable metadata',
    async (amount) => {
      const pdf = await buildInvoicePdf({ ...input, amount });
      expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
      expect(pdf.toString()).toContain(`${amount.toLocaleString('en-US')} IRT`);
      expect(pdf.toString()).toContain(input.invoiceNumber);
      expect(pdf.toString()).toContain(input.orderCode);
      expect(pdf.toString()).toContain('/FontFile2');
      expect(pdf.toString()).toContain('/ToUnicode');
      expect(pdf.toString()).toContain('/Lang (fa-IR)');
      expect(pdf.length).toBeLessThan(100000);
    },
  );
});
