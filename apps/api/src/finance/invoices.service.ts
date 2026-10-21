import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildInvoicePdf } from './invoice-pdf.renderer';

export { buildInvoicePdf } from './invoice-pdf.renderer';

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
      content: await buildInvoicePdf({
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
      content: await buildInvoicePdf({
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
