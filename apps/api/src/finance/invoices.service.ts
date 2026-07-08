import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateReferenceCode } from '../common/utils/code-generator';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForOrder(orderId: string, customerId: string, amount: number) {
    return this.prisma.invoice.create({
      data: {
        orderId,
        customerId,
        invoiceNumber: generateReferenceCode('INV'),
        amount,
      },
    });
  }

  listForCustomer(customerId: string) {
    return this.prisma.invoice.findMany({
      where: { customerId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  listForAdmin(params: { skip?: number; take?: number }) {
    return this.prisma.invoice.findMany({
      include: { order: { select: { code: true } }, customer: { select: { fullName: true } } },
      orderBy: { issuedAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
