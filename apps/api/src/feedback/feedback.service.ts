import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/feedback.dto';

const FEEDBACK_ALLOWED_STATUSES: OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.confirmed,
  OrderStatus.closed,
];

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(customerId: string, orderId: string, dto: CreateFeedbackDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.customerId !== customerId) {
      throw new ForbiddenException('این سفارش متعلق به شما نیست.');
    }
    if (!FEEDBACK_ALLOWED_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        'بازخورد فقط پس از تحویل سفارش قابل ثبت است.',
      );
    }

    let targetInternalId: string | undefined;

    if (dto.publicHandlerCode) {
      const handler = await this.prisma.orderPublicHandler.findFirst({
        where: { orderId, publicHandlerCode: dto.publicHandlerCode },
      });
      if (!handler) throw new NotFoundException('کد مسئول یافت نشد.');

      if (dto.targetType === 'executor') {
        const profile = await this.prisma.executorProfile.findUnique({
          where: { userId: handler.internalUserId },
        });
        targetInternalId = profile?.id;
      } else if (dto.targetType === 'team') {
        targetInternalId = handler.teamId ?? undefined;
      }
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        orderId,
        customerId,
        targetType: dto.targetType,
        targetInternalId,
        publicHandlerCode: dto.publicHandlerCode,
        rating: dto.rating,
        satisfactionPercent: dto.satisfactionPercent,
        feedbackType: dto.feedbackType,
        comment: dto.comment,
      },
    });

    if (dto.targetType === 'executor' && targetInternalId) {
      if (dto.feedbackType === 'complaint') {
        await this.prisma.executorProfile.update({
          where: { id: targetInternalId },
          data: { complaintCount: { increment: 1 } },
        });
      } else if (dto.feedbackType === 'compliment') {
        await this.prisma.executorProfile.update({
          where: { id: targetInternalId },
          data: { complimentCount: { increment: 1 } },
        });
      }
    }

    return feedback;
  }

  listForOrder(orderId: string) {
    return this.prisma.feedback.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForExecutor(executorProfileId: string) {
    return this.prisma.feedback.findMany({
      where: { targetType: 'executor', targetInternalId: executorProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
