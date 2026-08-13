import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileScanStatus, NotificationChannel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutorService } from '../executor/executor.service';
import { AntivirusService } from '../files/antivirus.service';
import { QUARANTINE_ROOT, UPLOAD_ROOT } from '../files/files.service';
import { FinanceReportingService } from '../finance/finance-reporting.service';
import { PaymentsService } from '../finance/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { OrdersService } from '../orders/orders.service';
import { JobRunnerService } from './job-runner.service';
import type { JobName, JobResult } from './job.types';
import { OutboxWorkerService } from './outbox-worker.service';
import { SmsService } from '../notifications/sms.service';
import { EmailService } from '../notifications/email.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

@Injectable()
export class JobsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly runner: JobRunnerService,
    private readonly outbox: OutboxWorkerService,
    private readonly payments: PaymentsService,
    private readonly tickets: TicketsService,
    private readonly executor: ExecutorService,
    private readonly antivirus: AntivirusService,
    private readonly reporting: FinanceReportingService,
    private readonly orders: OrdersService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.outbox.register('*', async (event, tx) => {
      const payload = event.payload as Record<string, unknown>;
      if (
        typeof payload?.userId === 'string' &&
        typeof payload.title === 'string' &&
        typeof payload.body === 'string'
      ) {
        const preference = await tx.notificationPreference.findUnique({
          where: { userId: payload.userId },
        });
        const user = await tx.user.findUnique({
          where: { id: payload.userId },
          select: { email: true, phone: true },
        });
        const channels = [
          ...(preference?.inAppEnabled !== false
            ? [NotificationChannel.in_app]
            : []),
          ...(preference?.emailEnabled && user?.email
            ? [NotificationChannel.email]
            : []),
          ...(preference?.smsEnabled && user?.phone
            ? [NotificationChannel.sms]
            : []),
        ];
        for (const channel of channels) {
          await tx.notificationLog.upsert({
            where: {
              outboxEventId_channel: { outboxEventId: event.id, channel },
            },
            update: {},
            create: {
              userId: payload.userId,
              channel,
              eventType: event.eventType,
              title: payload.title,
              body: payload.body,
              sentAt:
                channel === NotificationChannel.in_app ? new Date() : null,
              outboxEventId: event.id,
            },
          });
        }
      }
    });
    this.runner.register({
      name: 'payment_verify_recheck',
      intervalMs: 5 * MINUTE,
      run: (now) => this.recheckPayments(now),
    });
    this.runner.register({
      name: 'release_eligible_escrows',
      intervalMs: 15 * MINUTE,
      run: (now) => this.releaseEligibleEscrows(now),
    });
    this.runner.register({
      name: 'escalate_overdue_tickets',
      intervalMs: 10 * MINUTE,
      run: async () => ({ processed: await this.tickets.flagOverdueTickets() }),
    });
    this.runner.register({
      name: 'recalculate_staff_performance',
      intervalMs: 24 * HOUR,
      run: () => this.recalculateStaffPerformance(),
    });
    this.runner.register({
      name: 'recalculate_executor_scores',
      intervalMs: 24 * HOUR,
      run: () => this.recalculateExecutorScores(),
    });
    this.runner.register({
      name: 'send_outbox_notifications',
      intervalMs: MINUTE,
      run: async (now) => {
        const result = await this.outbox.processBatch(now);
        const dispatched = await this.dispatchNotificationChannels();
        return {
          processed: result.sent + dispatched,
          details: { ...result, dispatched },
        };
      },
    });
    this.runner.register({
      name: 'file_antivirus_scan',
      intervalMs: 2 * MINUTE,
      run: () => this.scanPendingFiles(),
    });
    this.runner.register({
      name: 'expire_signed_urls',
      intervalMs: 5 * MINUTE,
      run: (now) => this.expireSignedUrls(now),
    });
    this.runner.register({
      name: 'generate_periodic_reports',
      intervalMs: 24 * HOUR,
      run: (now) => this.generatePeriodicReports(now),
    });
    this.runner.start();
  }

  private async dispatchNotificationChannels() {
    const pending = await this.prisma.notificationLog.findMany({
      where: {
        channel: { in: [NotificationChannel.email, NotificationChannel.sms] },
        sentAt: null,
        attemptCount: { lt: 5 },
      },
      include: { user: { select: { email: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let sent = 0;
    for (const item of pending) {
      try {
        if (item.channel === NotificationChannel.email && item.user.email) {
          await this.email.send(
            item.user.email,
            item.title,
            item.body,
            item.id,
          );
        } else if (
          item.channel === NotificationChannel.sms &&
          item.user.phone
        ) {
          await this.sms.send(
            item.user.phone,
            `${item.title}\n${item.body}`,
            item.id,
          );
        } else {
          throw new Error('نشانی کانال اعلان در پروفایل موجود نیست.');
        }
        const updated = await this.prisma.notificationLog.updateMany({
          where: { id: item.id, sentAt: null },
          data: {
            sentAt: new Date(),
            attemptCount: { increment: 1 },
            lastError: null,
          },
        });
        sent += updated.count;
      } catch (error) {
        await this.prisma.notificationLog.update({
          where: { id: item.id },
          data: {
            attemptCount: { increment: 1 },
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : 'خطای نامشخص ارسال',
          },
        });
      }
    }
    return sent;
  }

  run(name: JobName) {
    return this.runner.run(name);
  }

  list() {
    return this.runner.list();
  }

  private async recheckPayments(now: Date): Promise<JobResult> {
    const cutoff = new Date(now.getTime() - 10 * MINUTE);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'verifying', createdAt: { lt: cutoff } },
      take: 25,
      orderBy: { createdAt: 'asc' },
    });
    let processed = 0;
    let skipped = 0;
    for (const payment of payments) {
      try {
        await this.payments.verifyAndSettlePayment({
          paymentId: payment.id,
          orderId: payment.orderId,
          customerId: payment.customerId,
          idempotencyKey: `worker-payment-recheck-${payment.id}`,
        });
        processed += 1;
      } catch {
        skipped += 1;
      }
    }
    return { processed, skipped };
  }

  private async releaseEligibleEscrows(now: Date): Promise<JobResult> {
    const days = Number(this.config.get<string>('AUTO_CONFIRM_DAYS') ?? 7);
    const cutoff = new Date(now.getTime() - days * 24 * HOUR);
    const eligible = await this.prisma.order.findMany({
      where: {
        status: 'delivered',
        deliveredAt: { lte: cutoff },
        disputes: { none: { status: 'open' } },
      },
      select: { id: true, customerId: true },
      take: 25,
    });
    let processed = 0;
    let skipped = 0;
    for (const order of eligible) {
      try {
        await this.orders.confirm(
          order.customerId,
          order.id,
          `worker-auto-confirm-${order.id}`,
        );
        processed += 1;
      } catch {
        skipped += 1;
      }
    }
    return { processed, skipped };
  }

  private async recalculateStaffPerformance(): Promise<JobResult> {
    const profiles = await this.prisma.executorProfile.findMany({
      where: { status: { not: 'blocked' } },
      select: { id: true },
    });
    for (const profile of profiles) {
      await this.executor.recalculatePerformance(profile.id);
    }
    return { processed: profiles.length };
  }

  private async recalculateExecutorScores(): Promise<JobResult> {
    const result = await this.prisma.executorProfile.updateMany({
      where: {
        OR: [{ riskScore: { gte: 70 } }, { qcPassRate: { lt: 50 } }],
        status: 'active',
      },
      data: { status: 'under_review' },
    });
    return { processed: result.count };
  }

  private async scanPendingFiles(): Promise<JobResult> {
    const files = await this.prisma.orderFile.findMany({
      where: { scanStatus: FileScanStatus.pending, purgedAt: null },
      take: 20,
      orderBy: { createdAt: 'asc' },
    });
    let processed = 0;
    let skipped = 0;
    for (const file of files) {
      const source = join(QUARANTINE_ROOT, file.storageKey);
      if (!existsSync(source)) {
        skipped += 1;
        continue;
      }
      const buffer = readFileSync(source);
      const scan = await this.antivirus.scan(buffer);
      if (scan.status === 'clean') {
        renameSync(source, join(UPLOAD_ROOT, file.storageKey));
      }
      await this.prisma.orderFile.update({
        where: { id: file.id },
        data: {
          scanStatus:
            scan.status === 'clean'
              ? FileScanStatus.clean
              : FileScanStatus.infected,
        },
      });
      processed += 1;
    }
    return { processed, skipped };
  }

  private async expireSignedUrls(now: Date): Promise<JobResult> {
    const result = await this.prisma.signedUrlGrant.updateMany({
      where: { expiresAt: { lt: now }, revokedAt: null },
      data: { revokedAt: now },
    });
    return { processed: result.count };
  }

  private async generatePeriodicReports(now: Date): Promise<JobResult> {
    const report = await this.reporting.dashboard();
    const date = now.toISOString().slice(0, 10);
    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'finance.periodic_report_generated',
        payload: {
          date,
          checksum: createHash('sha256')
            .update(JSON.stringify(report))
            .digest('hex'),
          report,
        },
      },
    });
    return { processed: 1, details: { date } };
  }
}
