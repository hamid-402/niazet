import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * پیاده‌سازی پایه outbox (سند v4 §۲۱.۹ و §۱۸). برای MVP این نوبت، رویداد هم در
 * outbox_events ثبت می‌شود (برای پردازش‌های پس‌زمینه بعدی) و هم بلافاصله به‌صورت
 * in-app notification_log نوشته می‌شود تا در میز کار کاربر قابل نمایش باشد.
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
  ) {
    await this.prisma.outboxEvent.create({
      data: { eventType, payload: { userId, title, body } },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId,
        channel: NotificationChannel.in_app,
        eventType,
        title,
        body,
        sentAt: new Date(),
      },
    });

    this.logger.log(`[NOTIFY] ${eventType} -> ${userId}: ${title}`);
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
