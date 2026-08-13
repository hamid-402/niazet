import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * تولیدکننده Transactional Outbox (سند v4 §۲۱.۹ و §۱۸). رویداد در همان
 * تراکنش دامنه ذخیره می‌شود و Worker آن را با مصرف idempotent به اعلان تبدیل می‌کند.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(
    userId: string,
    eventType: string,
    title: string,
    body: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.outboxEvent.create({
      data: { eventType, payload: { userId, title, body } },
    });
    this.logger.log(`[NOTIFY_QUEUED] ${eventType} -> ${userId}: ${title}`);
  }

  async listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notificationLog.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notificationLog.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
}
