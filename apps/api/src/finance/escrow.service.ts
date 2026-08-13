import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EscrowStatus,
  LedgerAccountType,
  LedgerReferenceType,
  RefundStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

const DEFAULT_COMMISSION_RATE = 0.2;

export function calculateEscrowBalance(escrow: {
  amount: number;
  releasedAmount: number;
  refundedAmount: number;
}) {
  const remaining =
    escrow.amount - escrow.releasedAmount - escrow.refundedAmount;
  if (
    escrow.amount <= 0 ||
    escrow.releasedAmount < 0 ||
    escrow.refundedAmount < 0 ||
    remaining < 0
  ) {
    throw new BadRequestException('مانده حساب امانی ناسازگار است.');
  }
  return {
    released: escrow.releasedAmount,
    refunded: escrow.refundedAmount,
    remaining,
  };
}

export function escrowStatusAfterDistribution(balance: {
  released: number;
  refunded: number;
  remaining: number;
}) {
  if (balance.remaining === 0) {
    return balance.refunded === 0
      ? EscrowStatus.released
      : balance.released === 0
        ? EscrowStatus.refunded
        : EscrowStatus.released;
  }
  if (balance.refunded > 0) return EscrowStatus.partially_refunded;
  if (balance.released > 0) return EscrowStatus.partially_released;
  return EscrowStatus.held;
}

@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async getCommissionRate(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'finance.commission_rate' },
    });
    if (setting && typeof setting.value === 'number') {
      return setting.value;
    }
    return DEFAULT_COMMISSION_RATE;
  }

  /** آزادسازی escrow به مجری با کسر کارمزد (الحاقیه v4 §۲.۵). */
  async release(params: {
    orderId: string;
    amount?: number;
    decidedByUserId: string;
    note: string;
  }) {
    const escrow = await this.prisma.escrowHold.findFirst({
      where: {
        orderId: params.orderId,
        status: {
          in: [
            EscrowStatus.held,
            EscrowStatus.partially_released,
            EscrowStatus.partially_refunded,
          ],
        },
      },
      orderBy: { heldAt: 'desc' },
    });
    if (!escrow) {
      throw new NotFoundException('مبلغ در امانتی برای این سفارش یافت نشد.');
    }

    const assignment = await this.prisma.orderAssignment.findFirst({
      where: { orderId: params.orderId, unassignedAt: null },
      include: { executorProfile: true },
      orderBy: { assignedAt: 'asc' },
    });
    if (!assignment) {
      throw new BadRequestException(
        'هیچ مجری‌ای برای این سفارش تخصیص داده نشده است.',
      );
    }

    const balance = calculateEscrowBalance(escrow);
    const amount = params.amount ?? balance.remaining;
    if (amount <= 0 || amount > balance.remaining) {
      throw new BadRequestException('مبلغ آزادسازی نامعتبر است.');
    }

    const commissionRate = await this.getCommissionRate();
    const commissionAmount = Math.round(amount * commissionRate);
    const executorAmount = amount - commissionAmount;

    const escrowAccount = await this.ledger.getSystemAccount(
      LedgerAccountType.platform_escrow,
    );
    const commissionAccount = await this.ledger.getSystemAccount(
      LedgerAccountType.platform_commission,
    );

    const operationId = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const nextBalance = {
        released: balance.released + amount,
        refunded: balance.refunded,
        remaining: balance.remaining - amount,
      };
      const claimed = await tx.escrowHold.updateMany({
        where: {
          id: escrow.id,
          releasedAmount: balance.released,
          refundedAmount: balance.refunded,
        },
        data: {
          releasedAmount: { increment: amount },
          status: escrowStatusAfterDistribution(nextBalance),
          releasedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'مانده حساب امانی هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.',
        );
      }

      const executorAccount = await this.ledger.getOrCreateUserAccount(
        tx,
        assignment.executorProfile.userId,
        LedgerAccountType.executor_wallet,
      );

      await this.ledger.postEntry(
        {
          debitAccountId: escrowAccount.id,
          creditAccountId: executorAccount.id,
          amount: executorAmount,
          referenceType: LedgerReferenceType.escrow_release,
          referenceId: escrow.id,
          idempotencyKey: `escrow-release-executor-${escrow.id}-${operationId}`,
          createdByUserId: params.decidedByUserId,
        },
        tx,
      );

      await this.ledger.postEntry(
        {
          debitAccountId: escrowAccount.id,
          creditAccountId: commissionAccount.id,
          amount: commissionAmount,
          referenceType: LedgerReferenceType.commission,
          referenceId: escrow.id,
          idempotencyKey: `escrow-release-commission-${escrow.id}-${operationId}`,
          createdByUserId: params.decidedByUserId,
        },
        tx,
      );

      const updatedEscrow = await tx.escrowHold.findUniqueOrThrow({
        where: { id: escrow.id },
      });

      return updatedEscrow;
    });

    return { escrow: result, executorAmount, commissionAmount };
  }

  /** برگشت وجه به کیف پول مشتری (کامل یا جزئی). */
  async refund(params: {
    orderId: string;
    amount?: number;
    reason: string;
    note: string;
    decidedByUserId: string;
  }) {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }

    const escrow = await this.prisma.escrowHold.findFirst({
      where: {
        orderId: params.orderId,
        status: {
          in: [
            EscrowStatus.held,
            EscrowStatus.partially_released,
            EscrowStatus.partially_refunded,
          ],
        },
      },
      orderBy: { heldAt: 'desc' },
    });
    if (!escrow) {
      throw new NotFoundException('مبلغ در امانتی برای این سفارش یافت نشد.');
    }

    const balance = calculateEscrowBalance(escrow);
    const amount = params.amount ?? balance.remaining;
    if (amount <= 0 || amount > balance.remaining) {
      throw new BadRequestException('مبلغ رفاند نامعتبر است.');
    }

    const escrowAccount = await this.ledger.getSystemAccount(
      LedgerAccountType.platform_escrow,
    );

    const operationId = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const nextBalance = {
        released: balance.released,
        refunded: balance.refunded + amount,
        remaining: balance.remaining - amount,
      };
      const claimed = await tx.escrowHold.updateMany({
        where: {
          id: escrow.id,
          releasedAmount: balance.released,
          refundedAmount: balance.refunded,
        },
        data: {
          refundedAmount: { increment: amount },
          status: escrowStatusAfterDistribution(nextBalance),
          refundedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'مانده حساب امانی هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.',
        );
      }

      const customerAccount = await this.ledger.getOrCreateUserAccount(
        tx,
        order.customerId,
        LedgerAccountType.customer_wallet,
      );

      await this.ledger.postEntry(
        {
          debitAccountId: escrowAccount.id,
          creditAccountId: customerAccount.id,
          amount,
          referenceType: LedgerReferenceType.escrow_refund,
          referenceId: escrow.id,
          idempotencyKey: `escrow-refund-${escrow.id}-${operationId}`,
          createdByUserId: params.decidedByUserId,
        },
        tx,
      );

      const updatedEscrow = await tx.escrowHold.findUniqueOrThrow({
        where: { id: escrow.id },
      });

      const refund = await tx.refund.create({
        data: {
          orderId: params.orderId,
          escrowHoldId: escrow.id,
          amount,
          reason: params.reason,
          note: params.note,
          decidedByUserId: params.decidedByUserId,
          status: RefundStatus.processed,
        },
      });

      return { escrow: updatedEscrow, refund };
    });

    return result;
  }

  listForAdmin(params: {
    status?: EscrowStatus;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.escrowHold.findMany({
      where: params.status ? { status: params.status } : {},
      include: { order: { select: { code: true, title: true, status: true } } },
      orderBy: { heldAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
