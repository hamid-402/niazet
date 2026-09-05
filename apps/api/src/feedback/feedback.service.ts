import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackStatus, FeedbackType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/feedback.dto';
import { generateReferenceCode } from '../common/utils/code-generator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type {
  ListFeedbackQueryDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';

const FEEDBACK_ALLOWED_STATUSES: OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.confirmed,
  OrderStatus.closed,
];

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    customerId: string,
    orderId: string,
    dto: CreateFeedbackDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('کلید یکتای ثبت بازخورد الزامی است.');
    }
    const replay = await this.prisma.feedback.findUnique({
      where: { idempotencyKey },
    });
    if (replay) {
      if (replay.customerId !== customerId || replay.orderId !== orderId) {
        throw new ForbiddenException('کلید یکتا متعلق به درخواست دیگری است.');
      }
      return replay;
    }
    if (dto.feedbackType === 'rating' && dto.rating == null) {
      throw new BadRequestException(
        'برای ثبت امتیاز، انتخاب ۱ تا ۵ ستاره الزامی است.',
      );
    }
    if (
      dto.feedbackType !== 'rating' &&
      (!dto.comment || dto.comment.trim().length < 5)
    ) {
      throw new BadRequestException(
        'برای شکایت یا تشکر، توضیح حداقل پنج‌کاراکتری بنویسید.',
      );
    }
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
    let targetUserId: string | undefined;

    if (dto.targetType === 'executor' || dto.targetType === 'team') {
      if (!dto.publicHandlerCode) {
        throw new BadRequestException(
          'انتخاب مسئول سفارش برای این هدف الزامی است.',
        );
      }
      const handler = await this.prisma.orderPublicHandler.findFirst({
        where: {
          orderId,
          publicHandlerCode: dto.publicHandlerCode,
          visibleToCustomer: true,
        },
      });
      if (!handler) throw new NotFoundException('کد مسئول یافت نشد.');

      if (dto.targetType === 'executor') {
        const profile = await this.prisma.executorProfile.findUnique({
          where: { userId: handler.internalUserId },
        });
        targetInternalId = profile?.id;
        targetUserId = handler.internalUserId;
      } else if (dto.targetType === 'team') {
        targetInternalId = handler.teamId ?? undefined;
      }
    } else if (dto.targetType === 'support') {
      const ticket = await this.prisma.ticket.findFirst({
        where: { orderId, customerId, assignedToUserId: { not: null } },
        select: { assignedToUserId: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (!ticket?.assignedToUserId) {
        throw new BadRequestException(
          'برای این سفارش هنوز پشتیبان مشخصی ثبت نشده است.',
        );
      }
      targetInternalId = ticket.assignedToUserId;
      targetUserId = ticket.assignedToUserId;
    } else if (dto.targetType === 'qc') {
      const review = await this.prisma.qcReview.findFirst({
        where: { orderId, reviewerUserId: { not: null } },
        select: { reviewerUserId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!review?.reviewerUserId) {
        throw new BadRequestException(
          'برای این سفارش هنوز بازبین کنترل کیفیت ثبت نشده است.',
        );
      }
      targetInternalId = review.reviewerUserId;
      targetUserId = review.reviewerUserId;
    } else {
      targetInternalId = orderId;
    }

    return this.prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          code: generateReferenceCode('FBK'),
          orderId,
          customerId,
          targetType: dto.targetType,
          targetInternalId,
          publicHandlerCode: dto.publicHandlerCode,
          rating: dto.rating,
          satisfactionPercent: dto.satisfactionPercent,
          feedbackType: dto.feedbackType,
          comment: dto.comment?.trim(),
          idempotencyKey,
        },
      });

      if (dto.targetType === 'executor' && targetInternalId) {
        if (dto.feedbackType === 'complaint') {
          await tx.executorProfile.update({
            where: { id: targetInternalId },
            data: { complaintCount: { increment: 1 } },
          });
        } else if (dto.feedbackType === 'compliment') {
          await tx.executorProfile.update({
            where: { id: targetInternalId },
            data: { complimentCount: { increment: 1 } },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorUserId: customerId,
          actorRole: 'customer',
          action: 'feedback.created',
          entityType: 'feedback',
          entityId: feedback.id,
          after: {
            code: feedback.code,
            orderId,
            targetType: dto.targetType,
            feedbackType: dto.feedbackType,
          },
          sensitivity:
            dto.feedbackType === 'complaint' ? 'sensitive' : 'normal',
        },
      });
      if (targetUserId) {
        await tx.outboxEvent.create({
          data: {
            eventType: `feedback.${dto.feedbackType}`,
            payload: {
              userId: targetUserId,
              title:
                dto.feedbackType === 'complaint'
                  ? 'بازخورد نیازمند بررسی ثبت شد'
                  : 'بازخورد جدید دریافت کردید',
              body: `کد پیگیری ${feedback.code} برای سفارش ${order.code}`,
            },
          },
        });
      }
      return feedback;
    });
  }

  async listForCustomerOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (!order || order.customerId !== customerId) {
      throw new ForbiddenException('این سفارش متعلق به شما نیست.');
    }
    return this.prisma.feedback.findMany({
      where: { orderId, customerId },
      select: {
        id: true,
        code: true,
        targetType: true,
        publicHandlerCode: true,
        rating: true,
        satisfactionPercent: true,
        feedbackType: true,
        comment: true,
        status: true,
        resolutionNote: true,
        resolvedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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

  listForAdmin(query: ListFeedbackQueryDto) {
    return this.prisma.feedback.findMany({
      where: {
        ...(query.code
          ? {
              code: {
                contains: query.code.trim(),
                mode: 'insensitive' as const,
              },
            }
          : {}),
        ...(query.feedbackType ? { feedbackType: query.feedbackType } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        order: { select: { id: true, code: true, title: true } },
        customer: { select: { fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateFeedbackStatusDto,
  ) {
    const before = await this.prisma.feedback.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('بازخورد یافت نشد.');
    if (
      (dto.status === FeedbackStatus.resolved ||
        dto.status === FeedbackStatus.closed) &&
      (!dto.resolutionNote || dto.resolutionNote.trim().length < 5)
    ) {
      throw new BadRequestException(
        'برای پایان رسیدگی، نتیجه حداقل پنج‌کاراکتری الزامی است.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.feedback.update({
        where: { id },
        data: {
          status: dto.status,
          resolutionNote: dto.resolutionNote?.trim(),
          resolvedAt:
            dto.status === FeedbackStatus.resolved ||
            dto.status === FeedbackStatus.closed
              ? new Date()
              : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'feedback.status_updated',
          entityType: 'feedback',
          entityId: id,
          before: { status: before.status },
          after: {
            status: result.status,
            resolutionNote: result.resolutionNote,
          },
          sensitivity:
            before.feedbackType === FeedbackType.complaint
              ? 'sensitive'
              : 'normal',
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'feedback.status_updated',
          payload: {
            userId: before.customerId,
            title: 'وضعیت بازخورد شما به‌روزرسانی شد',
            body: `کد پیگیری ${before.code}: ${dto.status}`,
          },
        },
      });
      return result;
    });
  }
}
