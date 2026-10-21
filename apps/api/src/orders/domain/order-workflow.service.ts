import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderStatus, OrderStatusSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isTransitionAllowedForSource } from '../order-state-machine';

export interface FinancialTransitionEffect {
  type: string;
  amount?: number;
  context?: Prisma.InputJsonValue;
}

@Injectable()
export class OrderWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

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
    const perform = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('سفارش یافت نشد.');
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
      const claimed = await client.order.updateMany({
        where: { id: orderId, status: order.status, version: order.version },
        data: { status: toStatus, version: { increment: 1 }, ...extraData },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'سفارش هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.',
        );
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
      return client.order.findUniqueOrThrow({ where: { id: orderId } });
    };
    if (tx) return perform(tx);
    return this.prisma.$transaction((client) => perform(client), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
