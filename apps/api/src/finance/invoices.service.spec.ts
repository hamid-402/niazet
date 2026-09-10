import { NotFoundException } from '@nestjs/common';
import { buildInvoicePdf, InvoicesService } from './invoices.service';

describe('invoice PDF', () => {
  it('queries a customer invoice by both invoice id and owner id', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new InvoicesService({ invoice: { findFirst } } as never);
    await expect(
      service.pdfForCustomer('customer-1', 'invoice-1'),
    ).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'invoice-1', customerId: 'customer-1' },
      include: { order: { select: { code: true } } },
    });
  });

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
