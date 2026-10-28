import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderStatus, OrderStatusSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isTransitionAllowedForSource } from '../order-state-machine';
import { captureQuotedContract } from '../../contracts/order-snapshot';
import { assertFixedRegistrationEligibility } from './fixed-registration-eligibility';

export interface FinancialTransitionEffect {
  type: string;
  amount?: number;
  context?: Prisma.InputJsonValue;
}

@Injectable()
export class OrderWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPaidProof(
    client: Prisma.TransactionClient,
    order: Order,
    effect?: FinancialTransitionEffect,
  ) {
    const context: unknown = effect?.context;
    if (
      !effect ||
      !['wallet_to_escrow', 'payment_to_escrow'].includes(effect.type) ||
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context) ||
      !('paymentId' in context) ||
      typeof context.paymentId !== 'string' ||
      !('escrowId' in context) ||
      typeof context.escrowId !== 'string'
    )
      throw new BadRequestException('گذار پرداخت به سند مالی معتبر نیاز دارد.');
    const payment = await client.payment.findUnique({
      where: { id: context.paymentId },
      include: { escrowHold: true },
    });
    const entry = await client.ledgerEntry.findUnique({
      where: { idempotencyKey: `payment-settle:${context.paymentId}` },
      include: { debitAccount: true, creditAccount: true },
    });
    const escrow = payment?.escrowHold;
    if (
      !payment ||
      !entry ||
      !escrow ||
      payment.orderId !== order.id ||
      payment.customerId !== order.customerId ||
      payment.status !== 'succeeded' ||
      payment.amount !== effect.amount ||
      payment.currency !== 'IRT' ||
      order.currency !== 'IRT' ||
      !order.finalPrice ||
      payment.amount < 1 ||
      entry.amount !== payment.amount ||
      entry.referenceType !== 'payment' ||
      entry.referenceId !== payment.id ||
      entry.creditAccount.accountType !== 'platform_escrow' ||
      entry.creditAccount.ownerUserId !== null ||
      escrow.amount !== payment.amount ||
      escrow.orderId !== order.id ||
      escrow.releasedAmount !== 0 ||
      escrow.refundedAmount !== 0 ||
      context.escrowId !== escrow.id
    )
      throw new ConflictException(
        'سند پرداخت، دفتر مالی و مبلغ امانی منطبق نیستند.',
      );
    const walletPayment = effect.type === 'wallet_to_escrow';
    if (
      (walletPayment &&
        (payment.gateway !== 'wallet' ||
          entry.debitAccount.ownerUserId !== order.customerId)) ||
      (!walletPayment &&
        (payment.gateway === 'wallet' ||
          entry.debitAccount.accountType !== 'payment_gateway_clearing' ||
          entry.debitAccount.ownerUserId !== null))
    )
      throw new ConflictException('منبع وجه پرداخت معتبر نیست.');
    const [unpaid, paid, holds] = await Promise.all([
      client.orderMilestone.count({
        where: { orderId: order.id, paymentStatus: { not: 'succeeded' } },
      }),
      client.payment.aggregate({
        where: { orderId: order.id, status: 'succeeded' },
        _sum: { amount: true },
      }),
      client.escrowHold.aggregate({
        where: { orderId: order.id },
        _sum: { amount: true, releasedAmount: true, refundedAmount: true },
      }),
    ]);
    const remaining =
      (holds._sum.amount ?? 0) -
      (holds._sum.releasedAmount ?? 0) -
      (holds._sum.refundedAmount ?? 0);
    if (
      unpaid ||
      paid._sum.amount !== order.finalPrice ||
      remaining !== order.finalPrice
    )
      throw new ConflictException(
        'پرداخت همه مراحل و پوشش کامل امانی هنوز تأیید نشده است.',
      );
  }

  async transition(
    orderId: string,
    toStatus: OrderStatus,
    source: OrderStatusSource,
    actorUserId: string | null,
    note?: string,
    extraData: Prisma.OrderUpdateInput = {},
    tx?: Prisma.TransactionClient,
    financialEffect?: FinancialTransitionEffect,
    allowDisputeResolution = false,
  ): Promise<Order> {
    for (const key of [
      'id',
      'status',
      'version',
      'customerId',
      'customer',
      'statusHistory',
      'payments',
      'escrowHolds',
      'refunds',
      'invoices',
      'contractSnapshot',
      'publicReview',
    ]) {
      if (Object.prototype.hasOwnProperty.call(extraData, key))
        throw new BadRequestException(
          'فرمان مجاز به بازنویسی شناسه، مالک یا کنترل وضعیت نیست.',
        );
    }
    if (source !== OrderStatusSource.system && !actorUserId)
      throw new BadRequestException('عامل انسانی فرمان باید مشخص باشد.');
    if (allowDisputeResolution && source !== OrderStatusSource.admin)
      throw new BadRequestException('حل اختلاف به فرمان مدیر مجاز نیاز دارد.');
    if (
      financialEffect?.amount !== undefined &&
      (!Number.isSafeInteger(financialEffect.amount) ||
        financialEffect.amount < 0)
    )
      throw new BadRequestException('اثر مالی نامعتبر است.');
    const perform = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('سفارش یافت نشد.');
      if (
        source === OrderStatusSource.customer &&
        actorUserId !== order.customerId
      )
        throw new ForbiddenException('عامل فرمان مالک این سفارش نیست.');
      if (
        source === OrderStatusSource.executor &&
        !(await client.orderAssignment.count({
          where: {
            orderId,
            unassignedAt: null,
            executorProfile: { userId: actorUserId! },
          },
        }))
      )
        throw new ForbiddenException(
          'مجری فرمان تخصیص فعال این سفارش را ندارد.',
        );
      if (order.status === OrderStatus.disputed && !allowDisputeResolution) {
        throw new BadRequestException(
          'خروج از اختلاف فقط از مسیر حل اختلاف مجاز است.',
        );
      }
      if (!isTransitionAllowedForSource(order.status, toStatus, source)) {
        throw new BadRequestException(
          `تغییر وضعیت از ${order.status} به ${toStatus} مجاز نیست.`,
        );
      }
      if (toStatus === OrderStatus.paid)
        await this.assertPaidProof(client, order, financialEffect);
      if (
        order.status === OrderStatus.pending_triage &&
        toStatus === OrderStatus.triaging &&
        source === OrderStatusSource.customer
      )
        await assertFixedRegistrationEligibility(client, order);
      const claimed = await client.order.updateMany({
        where: { id: orderId, status: order.status, version: order.version },
        data: { status: toStatus, version: { increment: 1 }, ...extraData },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'سفارش هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.',
        );
      }
      if (toStatus === OrderStatus.quoted) {
        const quoted = await client.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        await captureQuotedContract(client, quoted, note);
      }
      await client.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus,
          actorUserId,
          source,
          note:
            note?.trim() ||
            `گذار ${order.status} به ${toStatus} توسط ${source}`,
          financialEffectType: financialEffect?.type ?? 'none',
          financialEffectAmount: financialEffect?.amount,
          context: financialEffect?.context,
        },
      });
      await client.auditLog.create({
        data: {
          actorUserId,
          actorRole: source === OrderStatusSource.system ? null : source,
          action: 'order.status.transitioned',
          entityType: 'order',
          entityId: orderId,
          before: { status: order.status, version: order.version },
          after: {
            status: toStatus,
            version: order.version + 1,
            source,
            financialEffectType: financialEffect?.type ?? 'none',
            financialEffectAmount: financialEffect?.amount ?? null,
            note: note?.trim() ?? null,
          },
          sensitivity:
            financialEffect && financialEffect.type !== 'none'
              ? 'critical'
              : 'sensitive',
        },
      });
      return client.order.findUniqueOrThrow({ where: { id: orderId } });
    };
    if (tx) return perform(tx);
    return this.prisma.$transaction((client) => perform(client), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
