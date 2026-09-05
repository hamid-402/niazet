import { Injectable } from '@nestjs/common';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';
import { calculateEscrowBalance } from './escrow.service';

export function calculateCustomerFinanceTotals(input: {
  payments: ReadonlyArray<{ amount: number; status: PaymentStatus }>;
  escrows: ReadonlyArray<{
    amount: number;
    releasedAmount: number;
    refundedAmount: number;
  }>;
  refunds: ReadonlyArray<{ amount: number; status: RefundStatus }>;
  pendingPaymentCount: number;
}) {
  return {
    totalPaid: input.payments
      .filter((payment) => payment.status === PaymentStatus.succeeded)
      .reduce((sum, payment) => sum + payment.amount, 0),
    totalHeld: input.escrows.reduce(
      (sum, escrow) => sum + calculateEscrowBalance(escrow).remaining,
      0,
    ),
    totalRefunded: input.refunds
      .filter((refund) => refund.status === RefundStatus.processed)
      .reduce((sum, refund) => sum + refund.amount, 0),
    pendingPaymentCount: input.pendingPaymentCount,
  };
}

@Injectable()
export class CustomerFinanceOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async get(userId: string) {
    const [wallet, payments, escrows, refunds, invoices, ordersNeedingPayment] =
      await Promise.all([
        this.wallet.getSummary(userId),
        this.prisma.payment.findMany({
          where: { customerId: userId },
          select: {
            id: true,
            amount: true,
            currency: true,
            gateway: true,
            gatewayRef: true,
            status: true,
            failureReason: true,
            verifiedAt: true,
            createdAt: true,
            order: { select: { id: true, code: true, title: true } },
            milestone: { select: { title: true, sequence: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.escrowHold.findMany({
          where: { order: { customerId: userId } },
          select: {
            id: true,
            amount: true,
            releasedAmount: true,
            refundedAmount: true,
            currency: true,
            status: true,
            heldAt: true,
            releasedAt: true,
            refundedAt: true,
            order: { select: { id: true, code: true, title: true } },
          },
          orderBy: { heldAt: 'desc' },
          take: 100,
        }),
        this.prisma.refund.findMany({
          where: { order: { customerId: userId } },
          select: {
            id: true,
            amount: true,
            reason: true,
            status: true,
            createdAt: true,
            order: { select: { id: true, code: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.invoice.findMany({
          where: { customerId: userId },
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            issuedAt: true,
            emailSentAt: true,
            billingSnapshot: true,
            order: { select: { id: true, code: true, title: true } },
          },
          orderBy: { issuedAt: 'desc' },
          take: 100,
        }),
        this.prisma.order.findMany({
          where: { customerId: userId, status: 'pending_payment' },
          select: {
            id: true,
            code: true,
            title: true,
            finalPrice: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

    const totals = calculateCustomerFinanceTotals({
      payments,
      escrows,
      refunds,
      pendingPaymentCount: ordersNeedingPayment.length,
    });

    return {
      summary: {
        walletBalance: wallet.balance,
        ...totals,
      },
      wallet,
      payments,
      escrows: escrows.map((escrow) => ({
        ...escrow,
        remainingAmount: calculateEscrowBalance(escrow).remaining,
      })),
      refunds,
      invoices,
      ordersNeedingPayment,
    };
  }
}
