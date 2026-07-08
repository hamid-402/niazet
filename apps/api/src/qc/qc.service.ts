import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QcResult } from '@prisma/client';
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
            files: { where: { fileKind: 'output' } },
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

  private async assertReviewerNotExecutor(
    orderId: string,
    reviewerUserId: string,
  ) {
    const executorUserId = await this.orders.getExecutorUserIdForOrder(orderId);
    if (executorUserId === reviewerUserId) {
      throw new ForbiddenException('reviewer نمی‌تواند همان مجری سفارش باشد.');
    }
  }

  private async saveItems(reviewId: string, dto: SubmitQcReviewDto) {
    if (!dto.items?.length) return;
    await this.prisma.qcReviewItem.deleteMany({
      where: { qcReviewId: reviewId },
    });
    await this.prisma.qcReviewItem.createMany({
      data: dto.items.map((item) => ({
        qcReviewId: reviewId,
        checklistItemId: item.checklistItemId,
        passed: item.passed,
        note: item.note,
      })),
    });
  }

  async approve(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
  ) {
    const review = await this.prisma.qcReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('پرونده QC یافت نشد.');
    if (review.result)
      throw new BadRequestException('این پرونده قبلاً بررسی شده است.');

    await this.assertReviewerNotExecutor(review.orderId, reviewerUserId);
    await this.saveItems(reviewId, dto);

    await this.prisma.qcReview.update({
      where: { id: reviewId },
      data: {
        reviewerUserId,
        result: QcResult.passed,
        comment: dto.comment,
        reviewedAt: new Date(),
      },
    });

    return this.orders.applyQcApproval(review.orderId, reviewerUserId);
  }

  async requestRework(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
  ) {
    return this.rejectInternal(
      reviewId,
      reviewerUserId,
      dto,
      QcResult.needs_rework,
    );
  }

  async reject(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
  ) {
    return this.rejectInternal(
      reviewId,
      reviewerUserId,
      dto,
      QcResult.rejected,
    );
  }

  private async rejectInternal(
    reviewId: string,
    reviewerUserId: string,
    dto: SubmitQcReviewDto,
    result: QcResult,
  ) {
    const review = await this.prisma.qcReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('پرونده QC یافت نشد.');
    if (review.result)
      throw new BadRequestException('این پرونده قبلاً بررسی شده است.');

    await this.assertReviewerNotExecutor(review.orderId, reviewerUserId);
    await this.saveItems(reviewId, dto);

    await this.prisma.qcReview.update({
      where: { id: reviewId },
      data: {
        reviewerUserId,
        result,
        comment: dto.comment,
        reviewedAt: new Date(),
      },
    });

    return this.orders.applyQcRejection(review.orderId, reviewerUserId);
  }
}
