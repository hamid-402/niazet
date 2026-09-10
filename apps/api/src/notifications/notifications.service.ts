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
      where: {
        userId,
        channel: 'in_app',
        ...(unreadOnly ? { readAt: null } : {}),
      },
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

  async markAllRead(userId: string) {
    return this.prisma.notificationLog.updateMany({
      where: { userId, channel: 'in_app', readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
      },
    });
  }

  async updatePreferences(
    userId: string,
    input: {
      inAppEnabled: boolean;
      emailEnabled: boolean;
      smsEnabled: boolean;
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
      select: {
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
      },
    });
  }
}
