import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 25;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export function outboxRetryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 2 ** attempt * 1000);
}

export type OutboxHandler = (
  event: { id: string; eventType: string; payload: Prisma.JsonValue },
  tx: Prisma.TransactionClient,
) => Promise<void>;

@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly workerId = randomUUID();
  private readonly handlers = new Map<string, OutboxHandler>();

  constructor(private readonly prisma: PrismaService) {}

  register(eventType: string, handler: OutboxHandler) {
    this.handlers.set(eventType, handler);
  }

  async processBatch(now = new Date()) {
    const claimed = await this.claim(now);
    let sent = 0;
    let failed = 0;
    let deadLettered = 0;
    for (const event of claimed) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const consumerName = `outbox:${event.eventType}`;
          const delivered = await tx.outboxDelivery.findUnique({
            where: {
              eventId_consumerName: { eventId: event.id, consumerName },
            },
          });
          if (!delivered) {
            const handler =
              this.handlers.get(event.eventType) ?? this.handlers.get('*');
            if (handler) await handler(event, tx);
            await tx.outboxDelivery.create({
              data: { eventId: event.id, consumerName },
            });
          }
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'sent',
              sentAt: now,
              lockedAt: null,
              lockedBy: null,
              lastError: null,
            },
          });
        });
        sent += 1;
      } catch (error) {
        const isDeadLetter = event.attempts >= MAX_ATTEMPTS;
        const retryDelayMs = outboxRetryDelayMs(event.attempts);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: isDeadLetter ? 'dead_letter' : 'failed',
            availableAt: new Date(now.getTime() + retryDelayMs),
            lockedAt: null,
            lockedBy: null,
            lastError: this.errorMessage(error),
            deadLetteredAt: isDeadLetter ? now : null,
          },
        });
        if (isDeadLetter) deadLettered += 1;
        else failed += 1;
      }
    }
    return { claimed: claimed.length, sent, failed, deadLettered };
  }

  private async claim(now: Date) {
    const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<
        Array<{
          id: string;
          eventType: string;
          payload: Prisma.JsonValue;
          attempts: number;
        }>
      >(Prisma.sql`
        SELECT id, event_type AS "eventType", payload, attempts
        FROM outbox_events
        WHERE (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND locked_at < ${staleBefore})
        )
          AND available_at <= ${now}
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);
      if (!events.length) return [];
      await tx.outboxEvent.updateMany({
        where: { id: { in: events.map((event) => event.id) } },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
          lockedAt: now,
          lockedBy: this.workerId,
        },
      });
      return events.map((event) => ({
        ...event,
        attempts: event.attempts + 1,
      }));
    });
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(message);
    return message.slice(0, 2_000);
  }
}
