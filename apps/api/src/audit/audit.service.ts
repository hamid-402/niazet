import { Injectable } from '@nestjs/common';
import { AuditSensitivity, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  sensitivity?: AuditSensitivity;
  ipAddress?: string | null;
}

/**
 * Records سند v4 §19 «عملیات حساس» (تغییر role/scope، refund، release escrow،
 * resolve dispute، حذف/مسدود کاربر، دانلود فایل حساس، مشاهده ledger).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogInput) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        sensitivity: input.sensitivity ?? AuditSensitivity.normal,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async list(params: {
    entityType?: string;
    actorUserId?: string;
    skip?: number;
    take?: number;
  }) {
    const where = {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
