import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QcResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { SubmitQcReviewDto } from './dto/qc.dto';

@Injectable()
export class QcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  listQueue() {
    return this.prisma.qcReview.findMany({
      where: { result: null },
      include: {
        order: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            serviceLine: {
              select: {
                title: true,
                qcChecklistTemplates: { include: { items: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOne(id: string) {
    const review = await this.prisma.qcReview.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            files: { where: { fileKind: 'output', scanStatus: 'clean' } },
            acceptanceCriteria: true,
            serviceLine: {
              include: { qcChecklistTemplates: { include: { items: true } } },
            },
          },
        },
        items: true,
      },
    });
    if (!review) throw new NotFoundException('پرونده QC یافت نشد.');
    return review;
  }

  approve(reviewId: string, reviewerUserId: string, dto: SubmitQcReviewDto) {
    return this.decide(reviewId, reviewerUserId, dto, QcResult.passed);
  }

  requestRework(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
  ) {
    return this.decide(reviewId, reviewerUserId, dto, QcResult.needs_rework);
  }

  reject(reviewId: string, reviewerUserId: string, dto: SubmitQcReviewDto) {
    return this.decide(reviewId, reviewerUserId, dto, QcResult.rejected);
  }

  private decide(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
    result: QcResult,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const review = await tx.qcReview.findUnique({
          where: { id: reviewId },
          include: {
            order: {
              include: {
                files: { where: { fileKind: 'output', scanStatus: 'clean' } },
                serviceLine: {
                  include: {
                    qcChecklistTemplates: { include: { items: true } },
                  },
                },
              },
            },
          },
        });
        if (!review) throw new NotFoundException('پرونده QC یافت نشد.');
        if (review.result)
          throw new BadRequestException('این پرونده قبلاً بررسی شده است.');
        if (review.order.status !== 'qc_in_review') {
          throw new BadRequestException('سفارش در وضعیت بررسی QC نیست.');
        }
        if (!review.order.files.length) {
          throw new BadRequestException(
            'QC بدون حداقل یک خروجی امن قابل ثبت نیست.',
          );
        }

        const executor = await tx.orderAssignment.findFirst({
          where: { orderId: review.orderId, unassignedAt: null },
          include: { executorProfile: true },
        });
        if (executor?.executorProfile.userId === reviewerUserId) {
          throw new ForbiddenException(
            'بازبین QC نمی‌تواند همان مجری سفارش باشد.',
          );
        }

        const expectedIds =
          review.order.serviceLine.qcChecklistTemplates.flatMap((template) =>
            template.items.map((item) => item.id),
          );
        const submittedIds = dto.items.map((item) => item.checklistItemId);
        if (
          new Set(submittedIds).size !== submittedIds.length ||
          expectedIds.length !== submittedIds.length ||
          expectedIds.some((id) => !submittedIds.includes(id))
        ) {
          throw new BadRequestException(
            'تمام و فقط آیتم‌های چک‌لیست این خدمت باید ثبت شوند.',
          );
        }
        if (
          result === QcResult.passed &&
          dto.items.some((item) => !item.passed)
        ) {
          throw new BadRequestException(
            'تأیید QC نیازمند قبولی همه آیتم‌ها است.',
          );
        }
        if (
          result !== QcResult.passed &&
          dto.items.every((item) => item.passed)
        ) {
          throw new BadRequestException(
            'برای رد یا بازکاری باید حداقل یک آیتم ناموفق باشد.',
          );
        }

        await tx.qcReviewItem.createMany({
          data: dto.items.map((item) => ({
            qcReviewId: reviewId,
            checklistItemId: item.checklistItemId,
            passed: item.passed,
            note: item.note,
          })),
        });
        const claimed = await tx.qcReview.updateMany({
          where: { id: reviewId, result: null },
          data: {
            reviewerUserId,
            result,
            comment: dto.comment,
            reviewedAt: new Date(),
          },
        });
        if (claimed.count !== 1)
          throw new BadRequestException('پرونده هم‌زمان بررسی شده است.');

        if (result === QcResult.passed) {
          await tx.orderAcceptanceCriteria.updateMany({
            where: { orderId: review.orderId },
            data: { isMet: true },
          });
        }
        await tx.auditLog.create({
          data: {
            actorUserId: reviewerUserId,
            actorRole: 'admin',
            action: `qc.${result}`,
            entityType: 'qc_review',
            entityId: reviewId,
            after: { orderId: review.orderId, comment: dto.comment ?? null },
            sensitivity: 'sensitive',
          },
        });
        return result === QcResult.passed
          ? this.orders.applyQcApproval(review.orderId, reviewerUserId, tx)
          : this.orders.applyQcRejection(review.orderId, reviewerUserId, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
