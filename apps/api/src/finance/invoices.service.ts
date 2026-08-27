import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function buildInvoicePdf(input: {
  invoiceNumber: string;
  orderCode: string;
  amount: number;
  issuedAt: Date;
}) {
  const escape = (value: string) => value.replace(/([\\()])/g, '\\$1');
  const content = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    `(NIAZAT INVOICE) Tj`,
    '0 -34 Td',
    '/F1 11 Tf',
    `(${escape(`Invoice: ${input.invoiceNumber}`)}) Tj`,
    '0 -20 Td',
    `(${escape(`Order: ${input.orderCode}`)}) Tj`,
    '0 -20 Td',
    `(${escape(`Amount: ${input.amount.toLocaleString('en-US')} IRT`)}) Tj`,
    '0 -20 Td',
    `(${escape(`Issued: ${input.issuedAt.toISOString()}`)}) Tj`,
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForOrder(orderId: string, customerId: string, amount: number) {
    const billingSnapshot = await this.prisma.customerProfile.findUnique({
      where: { userId: customerId },
      select: {
        accountType: true,
        nationalId: true,
        companyName: true,
        companyNationalId: true,
        companyRegistrationNumber: true,
        economicCode: true,
        billingRecipientName: true,
        invoiceEmail: true,
        province: true,
        city: true,
        addressLine: true,
        postalCode: true,
      },
    });
    return this.prisma.invoice.upsert({
      where: { orderId },
      create: {
        orderId,
        customerId,
        invoiceNumber: `INV-${orderId.toUpperCase()}`,
        amount,
        pdfFileKey: `invoices/${orderId}.pdf`,
        billingSnapshot: billingSnapshot ?? undefined,
      },
      update: {},
    });
  }

  listForCustomer(customerId: string) {
    return this.prisma.invoice.findMany({
      where: { customerId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async pdfForCustomer(customerId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, customerId },
      include: { order: { select: { code: true } } },
    });
    if (!invoice) throw new NotFoundException('فاکتور یافت نشد.');
    return {
      filename: `${invoice.invoiceNumber}.pdf`,
      content: buildInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        orderCode: invoice.order.code,
        amount: invoice.amount,
        issuedAt: invoice.issuedAt,
      }),
    };
  }

  async pdfForAdmin(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { order: { select: { code: true } } },
    });
    if (!invoice) throw new NotFoundException('فاکتور یافت نشد.');
    return {
      filename: `${invoice.invoiceNumber}.pdf`,
      content: buildInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        orderCode: invoice.order.code,
        amount: invoice.amount,
        issuedAt: invoice.issuedAt,
      }),
    };
  }

  listForAdmin(params: { skip?: number; take?: number }) {
    return this.prisma.invoice.findMany({
      include: {
        order: { select: { code: true } },
        customer: { select: { fullName: true } },
      },
      orderBy: { issuedAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
