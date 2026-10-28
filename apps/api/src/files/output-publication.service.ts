import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../finance/idempotency.service';
import { ObjectStorageService } from './object-storage.service';
import {
  checksumOf,
  matchesPublishedVersion,
  OUTPUT_PUBLICATION_MIGRATION,
} from './output-publication';
import { ReviewOutputPublicationDto } from './output-publication.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class OutputPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly idempotency: IdempotencyService,
  ) {}
  private async legacyCutoff() {
    const rows = await this.prisma.$queryRaw<
      Array<{ finished_at: Date | null }>
    >`SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${OUTPUT_PUBLICATION_MIGRATION} AND rolled_back_at IS NULL`;
    if (rows.length !== 1 || !rows[0].finished_at)
      throw new ConflictException(
        'فعال‌سازی سیاست انتشار نسخه‌ای کامل نشده است.',
      );
    return rows[0].finished_at;
  }
  async reviewQueue(cursor?: string) {
    const cutoff = await this.legacyCutoff();
    const files = await this.prisma.orderFile.findMany({
      where: {
        fileKind: { in: ['output', 'revision'] },
        scanStatus: 'clean',
        purgedAt: null,
        createdAt: { lt: cutoff },
        outputPublications: { none: { releasedAt: { not: null } } },
      },
      select: {
        id: true,
        orderId: true,
        originalName: true,
        fileKind: true,
        checksum: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      files,
      nextCursor: files.length === 100 ? files[99].id : null,
      automaticApproval: false,
    };
  }
  async forCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    const cutoff = await this.legacyCutoff();
    const files = await this.prisma.orderFile.findMany({
      where: { orderId, fileKind: { in: ['output', 'revision'] } },
      include: {
        outputPublications: {
          include: {
            qcReview: {
              select: { result: true, reviewerUserId: true, reviewedAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      files: files.map((file) => {
        const proof = file.outputPublications.find((p) =>
          matchesPublishedVersion(file, p),
        );
        const unavailable = file.scanStatus !== 'clean' || !!file.purgedAt;
        return {
          id: file.id,
          availability: unavailable
            ? 'unavailable'
            : proof
              ? 'released'
              : file.createdAt < cutoff
                ? 'manual_review_required'
                : 'awaiting_qc',
          approvedAt: proof?.releasedAt ?? null,
        };
      }),
    };
  }
  async reviewFile(
    actor: { id: string; role: UserRole },
    fileId: string,
    dto: ReviewOutputPublicationDto,
    key: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new BadRequestException(
        'علت واقعیِ بررسی باید بین ۳ و ۵۰۰ نویسه باشد.',
      );
    const cutoff = await this.legacyCutoff();
    return this.idempotency.execute({
      key,
      scope: `output.legacy.review:${actor.id}:${fileId}`,
      request: dto,
      work: async (tx) => {
        if (dto.qcReviewId)
          await tx.$queryRaw`SELECT id FROM qc_reviews WHERE id = ${dto.qcReviewId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM order_files WHERE id = ${fileId} FOR UPDATE`;
        const file = await tx.orderFile.findUnique({
          where: { id: fileId },
          include: {
            order: {
              include: {
                serviceLine: {
                  include: {
                    qcChecklistTemplates: { include: { items: true } },
                  },
                },
                assignments: { include: { executorProfile: true } },
              },
            },
            outputPublications: true,
          },
        });
        if (!file) throw new NotFoundException('فایل یافت نشد.');
        if (
          !['output', 'revision'].includes(file.fileKind) ||
          file.scanStatus !== 'clean' ||
          file.purgedAt
        )
          throw new ConflictException('فایل برای بررسی انتشار مجاز نیست.');
        if (file.createdAt >= cutoff)
          throw new ConflictException(
            'این فرمان فقط برای نسخه‌های قدیمیِ فاقد مدرک است؛ نسخه تازه باید مسیر تحویل/QC رسمی را طی کند.',
          );
        if (
          file.uploadedByUserId === actor.id ||
          file.order.customerId === actor.id ||
          file.order.assignments.some(
            (a) => a.executorProfile.userId === actor.id,
          )
        )
          throw new ForbiddenException(
            'بازبین مستقل نباید صاحب سفارش، نویسنده فایل یا مجری آن باشد.',
          );
        const body = await this.storage.get(file.storageKey),
          checksum = checksumOf(body);
        if (
          body.length !== file.sizeBytes ||
          checksum !== dto.expectedChecksum ||
          (file.checksum !== null && checksum !== file.checksum)
        )
          throw new ConflictException(
            'checksum یا اندازه نسخه با مدرک بررسی برابر نیست.',
          );
        let result: {
          id: string;
          fileId: string;
          released: boolean;
          requiresQcDecision: boolean;
        };
        if (dto.qcReviewId) {
          const review = await tx.qcReview.findUnique({
            where: { id: dto.qcReviewId },
          });
          if (
            !review ||
            review.orderId !== file.orderId ||
            review.result ||
            file.order.status !== 'qc_in_review'
          )
            throw new ConflictException('پرونده QC فعالِ همین سفارش لازم است.');
          if (dto.items.length)
            throw new BadRequestException(
              'اتصال فهرست نسخه، جای ثبت نتیجه QC نیست؛ items باید خالی باشد.',
            );
          const existing = await tx.outputPublication.findUnique({
            where: { qcReviewId_fileId: { qcReviewId: review.id, fileId } },
          });
          if (
            !existing &&
            (await tx.outputPublication.count({
              where: { qcReviewId: review.id, deliveryReportId: { not: null } },
            }))
          )
            throw new ConflictException(
              'فهرست خودکارِ تحویل جدید قابل افزودن فایل قدیمی نیست؛ هر نسخه باید همان مسیر تحویل را طی کند.',
            );
          const publication =
            existing ??
            (await tx.outputPublication.create({
              data: {
                orderId: file.orderId,
                fileId,
                qcReviewId: review.id,
                checksum,
                storageKey: file.storageKey,
                sizeBytes: file.sizeBytes,
                basis: 'pending_qc',
                bindingActorUserId: actor.id,
                reason,
              },
            }));
          result = {
            id: publication.id,
            fileId,
            released: false,
            requiresQcDecision: true,
          };
        } else {
          if (
            file.order.status === 'qc_in_review' ||
            file.outputPublications.some((p) => p.basis === 'pending_qc')
          )
            throw new ConflictException(
              'برای پروندهٔ QC فعال ابتدا فهرست نسخه را متصل کنید؛ انتشار دستی جای تصمیم آن پرونده نیست.',
            );
          const expected = file.order.serviceLine.qcChecklistTemplates.flatMap(
            (t) => t.items,
          );
          const ids = dto.items.map((item) => item.checklistItemId);
          if (
            new Set(ids).size !== ids.length ||
            ids.length !== expected.length ||
            expected.some((item) => !ids.includes(item.id)) ||
            dto.items.some((item) => item.passed !== true)
          )
            throw new BadRequestException(
              'بررسی انسانیِ نسخه نیازمند قبولی همه و فقط آیتم‌های چک‌لیست خدمت است.',
            );
          const existing = await tx.outputPublication.findFirst({
            where: {
              fileId,
              basis: 'manual_qc',
              checksum,
              releasedAt: { not: null },
            },
          });
          const publication =
            existing ??
            (await tx.outputPublication.create({
              data: {
                orderId: file.orderId,
                fileId,
                checksum,
                storageKey: file.storageKey,
                sizeBytes: file.sizeBytes,
                basis: 'manual_qc',
                bindingActorUserId: actor.id,
                reviewerUserId: actor.id,
                reason,
                releasedAt: new Date(),
                checklistSnapshot: {
                  version: 1,
                  items: expected.map((item) => ({
                    id: item.id,
                    label: item.label,
                    passed: true,
                  })),
                },
              },
            }));
          result = {
            id: publication.id,
            fileId,
            released: true,
            requiresQcDecision: false,
          };
        }
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            actorRole: actor.role,
            action: result.released
              ? 'output.manual_qc_approved'
              : 'output.legacy_manifest_bound',
            entityType: 'output_publication',
            entityId: result.id,
            after: {
              orderId: file.orderId,
              fileId,
              checksum,
              reason,
              requiresQcDecision: result.requiresQcDecision,
            },
            sensitivity: 'sensitive',
          },
        });
        return result;
      },
    });
  }
}
