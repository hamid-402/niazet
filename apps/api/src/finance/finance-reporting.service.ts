import { Injectable } from '@nestjs/common';
import { LedgerReferenceType, PaymentStatus } from '@prisma/client';
import { startOfCurrentTehranMonthUtc } from '../common/utils/tehran-time';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const periodStart = startOfCurrentTehranMonthUtc();
    const [
      gmv,
      commissions,
      escrows,
      wallets,
      refunds,
      pendingWithdrawals,
      failedPayments,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.succeeded,
          verifiedAt: { gte: periodStart },
        },
      }),
      this.prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: {
          referenceType: LedgerReferenceType.commission,
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.escrowHold.aggregate({
        _sum: { amount: true, releasedAmount: true, refundedAmount: true },
        _count: true,
      }),
      this.prisma.wallet.aggregate({ _sum: { balance: true }, _count: true }),
      this.prisma.refund.aggregate({
        _sum: { amount: true },
        where: { status: 'processed', createdAt: { gte: periodStart } },
      }),
      this.prisma.withdrawal.count({ where: { status: 'pending' } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.failed } }),
    ]);
    const escrowHeld =
      (escrows._sum.amount ?? 0) -
      (escrows._sum.releasedAmount ?? 0) -
      (escrows._sum.refundedAmount ?? 0);
    return {
      period: { timeZone: 'Asia/Tehran', startUtc: periodStart },
      gmv: gmv._sum.amount ?? 0,
      revenue: commissions._sum.amount ?? 0,
      commission: commissions._sum.amount ?? 0,
      escrow: {
        held: escrowHeld,
        total: escrows._sum.amount ?? 0,
        count: escrows._count,
      },
      walletLiability: {
        balance: wallets._sum.balance ?? 0,
        count: wallets._count,
      },
      refunds: refunds._sum.amount ?? 0,
      pendingWithdrawals,
      failedPayments,
    };
  }
}
