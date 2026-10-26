import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ModerateReviewDto, SubmitReviewDto } from './review.dto';
import { contractTransactionError } from './transaction-error';

const ownerSelect = {
  id: true,
  orderId: true,
  rating: true,
  comment: true,
  publicConsent: true,
  moderationStatus: true,
  publishedAt: true,
  version: true,
  createdAt: true,
} as const;
export function assertPublicComment(value: string | undefined) {
  const text = value?.trim() || null;
  // Conservative PII/contact guard plus explicit human review. This is not a
  // claim of automatic semantic PII detection; publication is never automatic.
  if (
    text &&
    /(?:[\p{N}][\p{N}\s()+-]{6,}[\p{N}]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|@[\p{L}\p{N}_]{3,}|[a-f\d]{8}-[a-f\d-]{27,}|<[^>]*>)/iu.test(
      text,
    )
  )
    throw new BadRequestException(
      'متن عمومی باید بدون اطلاعات تماس، شناسه داخلی یا markup بازبینی شود.',
    );
  return text;
}
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}
  async submit(customerId: string, orderId: string, dto: SubmitReviewDto) {
    if (
      !Number.isInteger(dto.rating) ||
      dto.rating < 1 ||
      dto.rating > 5 ||
      typeof dto.publicConsent !== 'boolean'
    )
      throw new BadRequestException('امتیاز یا رضایت معتبر نیست.');
    return this.prisma
      .$transaction(
        async (tx) => {
          const order = await tx.order.findFirst({
            where: { id: orderId, customerId },
          });
          if (!order) throw new NotFoundException('سفارش یافت نشد.');
          if (!['delivered', 'confirmed', 'closed'].includes(order.status))
            throw new BadRequestException(
              'نظر خدمت فقط پس از تحویل قابل ثبت است.',
            );
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
          );
          const before = await tx.publicServiceReview.findUnique({
            where: { orderId },
          });
          const data = {
            rating: dto.rating,
            comment: dto.comment?.trim() || null,
            publicConsent: dto.publicConsent,
            publicComment: null,
            moderationStatus: 'pending',
            reviewedByUserId: null,
            publishedAt: null,
          };
          const review = await tx.publicServiceReview.upsert({
            where: { orderId },
            create: { ...data, orderId, customerId },
            update: { ...data, version: { increment: 1 } },
            select: ownerSelect,
          });
          await tx.auditLog.create({
            data: {
              actorUserId: customerId,
              actorRole: 'customer',
              action: 'review.submitted',
              entityType: 'public_service_review',
              entityId: review.id,
              before: before
                ? {
                    version: before.version,
                    published: before.publishedAt !== null,
                  }
                : Prisma.JsonNull,
              after: { version: review.version, consent: review.publicConsent },
              sensitivity: 'sensitive',
            },
          });
          return review;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(contractTransactionError);
  }
  async own(customerId: string, orderId: string) {
    if (
      !(await this.prisma.order.count({ where: { id: orderId, customerId } }))
    )
      throw new NotFoundException('سفارش یافت نشد.');
    return this.prisma.publicServiceReview.findUnique({
      where: { orderId },
      select: ownerSelect,
    });
  }
  async publicList(slug: string) {
    const service = await this.prisma.serviceLine.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('خدمت یافت نشد.');
    const where = {
      order: { serviceId: service.id },
      publicConsent: true,
      moderationStatus: 'approved',
      publishedAt: { not: null },
    } as const;
    const [items, totals] = await this.prisma.$transaction([
      this.prisma.publicServiceReview.findMany({
        where,
        select: {
          id: true,
          rating: true,
          publicComment: true,
          publishedAt: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.prisma.publicServiceReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);
    return {
      items,
      count: totals._count.id,
      averageRating: totals._avg.rating,
    };
  }
  listForModeration() {
    return this.prisma.publicServiceReview.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        ...ownerSelect,
        publicComment: true,
        order: { select: { code: true, serviceId: true } },
      },
    });
  }
  async moderate(actor: AuthenticatedUser, id: string, dto: ModerateReviewDto) {
    const reason = dto.reason.trim();
    if (reason.length < 3 || dto.privacyReviewed !== true)
      throw new BadRequestException(
        'علت واقعی و تأیید بررسی حریم خصوصی لازم است.',
      );
    const publicComment =
      dto.status === 'approved' ? assertPublicComment(dto.publicComment) : null;
    return this.prisma
      .$transaction(
        async (tx) => {
          const current = await tx.publicServiceReview.findUnique({
            where: { id },
          });
          if (!current) throw new NotFoundException('نظر یافت نشد.');
          if (dto.status === 'approved' && !current.publicConsent)
            throw new ConflictException('مشتری رضایت انتشار نداده است.');
          const result = await tx.publicServiceReview.updateMany({
            where: { id, version: dto.version },
            data: {
              moderationStatus: dto.status,
              reviewedByUserId: actor.id,
              publicComment,
              publishedAt: dto.status === 'approved' ? new Date() : null,
              version: { increment: 1 },
            },
          });
          if (result.count !== 1)
            throw new ConflictException(
              'نظر هم‌زمان تغییر کرده است؛ بازخوانی کنید.',
            );
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              actorRole: actor.role,
              action: 'review.moderated',
              entityType: 'public_service_review',
              entityId: id,
              before: {
                version: current.version,
                status: current.moderationStatus,
              },
              after: {
                version: current.version + 1,
                status: dto.status,
                reason,
                privacyReviewed: true,
              },
              sensitivity: 'sensitive',
            },
          });
          return tx.publicServiceReview.findUnique({
            where: { id },
            select: ownerSelect,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(contractTransactionError);
  }
}
