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
  Prisma,
  RefundStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
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
    if (balance.refunded === 0) return EscrowStatus.released;
    if (balance.released === 0) return EscrowStatus.refunded;
    return EscrowStatus.settled;
  }
  if (balance.refunded > 0) return EscrowStatus.partially_refunded;
  if (balance.released > 0) return EscrowStatus.partially_released;
  return EscrowStatus.held;
}

interface ReleaseParams {
  orderId: string;
  milestoneId?: string;
  amount?: number;
  decidedByUserId: string;
  decidedByRole?: UserRole;
  note: string;
  idempotencyKey: string;
}

interface RefundParams {
  orderId: string;
  amount?: number;
  reason: string;
  note: string;
  decidedByUserId: string;
  decidedByRole?: UserRole;
  idempotencyKey: string;
}

@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private async getCommissionRate(tx: Prisma.TransactionClient) {
    const setting = await tx.systemSetting.findUnique({
      where: { key: 'finance.commission_rate' },
    });
    const rate =
      typeof setting?.value === 'number'
        ? setting.value
        : DEFAULT_COMMISSION_RATE;
    if (rate < 0 || rate > 1) {
      throw new BadRequestException('نرخ کارمزد مالی باید بین صفر و یک باشد.');
    }
    return rate;
  }

  release(params: ReleaseParams) {
    return this.idempotency.execute({
      key: params.idempotencyKey,
      scope: `escrow.release:${params.orderId}:${params.milestoneId ?? 'order'}`,
      request: {
        amount: params.amount ?? null,
        milestoneId: params.milestoneId ?? null,
        note: params.note,
      },
      work: (tx) => this.releaseInTransaction(params, tx),
    });
  }

  async releaseInTransaction(
    params: ReleaseParams,
    tx: Prisma.TransactionClient,
  ) {
    const escrow = await tx.escrowHold.findFirst({
      where: {
        orderId: params.orderId,
        ...(params.milestoneId
          ? { payment: { milestoneId: params.milestoneId } }
          : {}),
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
    if (!escrow)
      throw new NotFoundException('مبلغ در امانت برای این سفارش یافت نشد.');

    const assignment = await tx.orderAssignment.findFirst({
      where: { orderId: params.orderId, unassignedAt: null },
      include: { executorProfile: true },
      orderBy: { assignedAt: 'asc' },
    });
    if (!assignment) {
      throw new BadRequestException(
        'هیچ مجری فعالی برای این سفارش تخصیص داده نشده است.',
      );
    }

    const balance = calculateEscrowBalance(escrow);
    const amount = params.amount ?? balance.remaining;
    if (amount <= 0 || amount > balance.remaining) {
      throw new BadRequestException('مبلغ آزادسازی نامعتبر است.');
    }

    const commissionRate = await this.getCommissionRate(tx);
    const commissionAmount = Math.round(amount * commissionRate);
    const executorAmount = amount - commissionAmount;
    if (executorAmount <= 0) {
      throw new BadRequestException('مبلغ خالص مجری باید مثبت باشد.');
    }

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
        'مانده حساب امانی هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',
      );
    }

    const [escrowAccount, commissionAccount, executorAccount] =
      await Promise.all([
        this.ledger.getSystemAccount(LedgerAccountType.platform_escrow, tx),
        this.ledger.getSystemAccount(LedgerAccountType.platform_commission, tx),
        this.ledger.getOrCreateUserAccount(
          tx,
          assignment.executorProfile.userId,
          LedgerAccountType.executor_wallet,
        ),
      ]);

    await this.ledger.postEntry(
      {
        debitAccountId: escrowAccount.id,
        creditAccountId: executorAccount.id,
        amount: executorAmount,
        referenceType: LedgerReferenceType.escrow_release,
        referenceId: escrow.id,
        idempotencyKey: `${params.idempotencyKey}:executor`,
        createdByUserId: params.decidedByUserId,
      },
      tx,
    );
    if (commissionAmount > 0) {
      await this.ledger.postEntry(
        {
          debitAccountId: escrowAccount.id,
          creditAccountId: commissionAccount.id,
          amount: commissionAmount,
          referenceType: LedgerReferenceType.commission,
          referenceId: escrow.id,
          idempotencyKey: `${params.idempotencyKey}:commission`,
          createdByUserId: params.decidedByUserId,
        },
        tx,
      );
    }

    const updatedEscrow = await tx.escrowHold.findUniqueOrThrow({
      where: { id: escrow.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.decidedByUserId,
        actorRole: params.decidedByRole ?? UserRole.admin,
        action: 'escrow.release',
        entityType: 'order',
        entityId: params.orderId,
        before: balance,
        after: {
          ...nextBalance,
          amount,
          executorAmount,
          commissionAmount,
          note: params.note,
        },
        sensitivity: 'critical',
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: 'escrow.released',
        payload: { orderId: params.orderId, escrowId: escrow.id, amount },
      },
    });
    return { escrow: updatedEscrow, executorAmount, commissionAmount };
  }

  refund(params: RefundParams) {
    return this.idempotency.execute({
      key: params.idempotencyKey,
      scope: `escrow.refund:${params.orderId}`,
      request: {
        amount: params.amount ?? null,
        reason: params.reason,
        note: params.note,
      },
      work: (tx) => this.refundInTransaction(params, tx),
    });
  }

  async refundInTransaction(
    params: RefundParams,
    tx: Prisma.TransactionClient,
  ) {
    const order = await tx.order.findUnique({ where: { id: params.orderId } });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    const escrow = await tx.escrowHold.findFirst({
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
    if (!escrow)
      throw new NotFoundException('مبلغ در امانت برای این سفارش یافت نشد.');

    const balance = calculateEscrowBalance(escrow);
    const amount = params.amount ?? balance.remaining;
    if (amount <= 0 || amount > balance.remaining) {
      throw new BadRequestException('مبلغ بازپرداخت نامعتبر است.');
    }

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
        'مانده حساب امانی هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',
      );
    }

    const [escrowAccount, customerAccount] = await Promise.all([
      this.ledger.getSystemAccount(LedgerAccountType.platform_escrow, tx),
      this.ledger.getOrCreateUserAccount(
        tx,
        order.customerId,
        LedgerAccountType.customer_wallet,
      ),
    ]);
    await this.ledger.postEntry(
      {
        debitAccountId: escrowAccount.id,
        creditAccountId: customerAccount.id,
        amount,
        referenceType: LedgerReferenceType.escrow_refund,
        referenceId: escrow.id,
        idempotencyKey: `${params.idempotencyKey}:customer`,
        createdByUserId: params.decidedByUserId,
      },
      tx,
    );

    const refund = await tx.refund.create({
      data: {
        orderId: params.orderId,
        escrowHoldId: escrow.id,
        amount,
        reason: params.reason,
        note: params.note,
        decidedByUserId: params.decidedByUserId,
        status: RefundStatus.processed,
        ledgerEntryReferenceId: `${params.idempotencyKey}:customer`,
      },
    });
    const updatedEscrow = await tx.escrowHold.findUniqueOrThrow({
      where: { id: escrow.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.decidedByUserId,
        actorRole: params.decidedByRole ?? UserRole.admin,
        action: 'escrow.refund',
        entityType: 'order',
        entityId: params.orderId,
        before: balance,
        after: {
          ...nextBalance,
          amount,
          reason: params.reason,
          note: params.note,
        },
        sensitivity: 'critical',
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: 'escrow.refunded',
        payload: { orderId: params.orderId, escrowId: escrow.id, amount },
      },
    });
    return { escrow: updatedEscrow, refund };
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

  listRefundsForAdmin(params: {
    status?: RefundStatus;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.refund.findMany({
      where: params.status ? { status: params.status } : {},
      include: {
        order: { select: { code: true, title: true } },
        decidedBy: { select: { fullName: true } },
        escrowHold: {
          select: { amount: true, releasedAmount: true, refundedAmount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }
}
