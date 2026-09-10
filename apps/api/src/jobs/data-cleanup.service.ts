import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditSensitivity, OutboxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const DATA_CLEANUP_LOCK_ID = 731_942_018;
const DAY = 24 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 500;

export interface CleanupPolicy {
  sessionDays: number;
  otpDays: number;
  idempotencyGraceDays: number;
  sentOutboxDays: number;
  deadLetterDays: number;
  signedUrlDays: number;
  jobRunDays: number;
  batchSize: number;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum = 1,
  maximum = 3_650,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function cleanupCutoffs(now: Date, policy: CleanupPolicy) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  return {
    sessions: before(policy.sessionDays),
    otpCodes: before(policy.otpDays),
    idempotencyKeys: before(policy.idempotencyGraceDays),
    sentOutbox: before(policy.sentOutboxDays),
    deadLetters: before(policy.deadLetterDays),
    signedUrls: before(policy.signedUrlDays),
    jobRuns: before(policy.jobRunDays),
  };
}

@Injectable()
export class DataCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async cleanup(now = new Date()) {
    const policy = this.policy();
    const cutoffs = cleanupCutoffs(now, policy);
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(${DATA_CLEANUP_LOCK_ID}) AS acquired`,
        );
        if (!lock?.acquired) {
          return {
            processed: 0,
            skipped: 1,
            details: { reason: 'lock_unavailable' },
          };
        }

        const sessions = await tx.session.findMany({
          where: {
            OR: [
              { expiresAt: { lt: cutoffs.sessions } },
              { revokedAt: { lt: cutoffs.sessions } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: policy.batchSize,
        });
        const otpCodes = await tx.otpCode.findMany({
          where: {
            OR: [
              { expiresAt: { lt: cutoffs.otpCodes } },
              { consumedAt: { lt: cutoffs.otpCodes } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: policy.batchSize,
        });
        const idempotencyKeys = await tx.idempotencyKey.findMany({
          where: { expiresAt: { lt: cutoffs.idempotencyKeys } },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: policy.batchSize,
        });
        const outboxEvents = await tx.outboxEvent.findMany({
          where: {
            OR: [
              {
                status: OutboxStatus.sent,
                sentAt: { lt: cutoffs.sentOutbox },
              },
              {
                status: OutboxStatus.dead_letter,
                deadLetteredAt: { lt: cutoffs.deadLetters },
              },
            ],
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: policy.batchSize,
        });
        const signedUrls = await tx.signedUrlGrant.findMany({
          where: {
            OR: [
              { expiresAt: { lt: cutoffs.signedUrls } },
              { usedAt: { lt: cutoffs.signedUrls } },
              { revokedAt: { lt: cutoffs.signedUrls } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: policy.batchSize,
        });
        const jobRuns = await tx.backgroundJobRun.findMany({
          where: { completedAt: { lt: cutoffs.jobRuns } },
          select: { id: true },
          orderBy: { completedAt: 'asc' },
          take: policy.batchSize,
        });

        const [
          sessionResult,
          otpResult,
          idempotencyResult,
          outboxResult,
          signedResult,
          jobRunResult,
        ] = await Promise.all([
          tx.session.deleteMany({
            where: { id: { in: sessions.map(({ id }) => id) } },
          }),
          tx.otpCode.deleteMany({
            where: { id: { in: otpCodes.map(({ id }) => id) } },
          }),
          tx.idempotencyKey.deleteMany({
            where: { id: { in: idempotencyKeys.map(({ id }) => id) } },
          }),
          tx.outboxEvent.deleteMany({
            where: { id: { in: outboxEvents.map(({ id }) => id) } },
          }),
          tx.signedUrlGrant.deleteMany({
            where: { id: { in: signedUrls.map(({ id }) => id) } },
          }),
          tx.backgroundJobRun.deleteMany({
            where: { id: { in: jobRuns.map(({ id }) => id) } },
          }),
        ]);
        const counts = {
          sessions: sessionResult.count,
          otpCodes: otpResult.count,
          idempotencyKeys: idempotencyResult.count,
          outboxEvents: outboxResult.count,
          signedUrls: signedResult.count,
          jobRuns: jobRunResult.count,
        };
        const runId = randomUUID();
        await tx.auditLog.create({
          data: {
            action: 'data.cleanup',
            entityType: 'maintenance_job',
            entityId: runId,
            sensitivity: AuditSensitivity.sensitive,
            after: {
              counts,
              batchSize: policy.batchSize,
              cutoffs: Object.fromEntries(
                Object.entries(cutoffs).map(([name, value]) => [
                  name,
                  value.toISOString(),
                ]),
              ),
            },
          },
        });
        return {
          processed: Object.values(counts).reduce(
            (sum, count) => sum + count,
            0,
          ),
          details: { runId, counts, batchSize: policy.batchSize },
        };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  private policy(): CleanupPolicy {
    return {
      sessionDays: boundedInteger(
        this.config.get<string>('SESSION_RETENTION_DAYS'),
        30,
      ),
      otpDays: boundedInteger(this.config.get<string>('OTP_RETENTION_DAYS'), 7),
      idempotencyGraceDays: boundedInteger(
        this.config.get<string>('IDEMPOTENCY_CLEANUP_GRACE_DAYS'),
        1,
      ),
      sentOutboxDays: boundedInteger(
        this.config.get<string>('OUTBOX_SENT_RETENTION_DAYS'),
        30,
      ),
      deadLetterDays: boundedInteger(
        this.config.get<string>('OUTBOX_DEAD_LETTER_RETENTION_DAYS'),
        90,
      ),
      signedUrlDays: boundedInteger(
        this.config.get<string>('SIGNED_URL_RETENTION_DAYS'),
        7,
      ),
      jobRunDays: boundedInteger(
        this.config.get<string>('JOB_RUN_RETENTION_DAYS'),
        30,
      ),
      batchSize: boundedInteger(
        this.config.get<string>('DATA_CLEANUP_BATCH_SIZE'),
        DEFAULT_BATCH_SIZE,
        1,
        5_000,
      ),
    };
  }
}
