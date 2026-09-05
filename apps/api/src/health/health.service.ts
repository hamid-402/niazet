import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOAD_ROOT } from '../files/files.service';
import { MockPaymentGateway } from '../finance/payment-gateway';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';
import { MetricsRegistry } from '../observability/metrics-registry.service';
import { ObservabilityAlertService } from '../observability/observability-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DependencyCheck,
  ReadinessReport,
  ReadinessStatus,
} from './health.types';

interface ProbeResult {
  status: ReadinessStatus;
  details?: DependencyCheck['details'];
  reason?: string;
}

export interface QueueSnapshot {
  backgroundEnabled: boolean;
  deadLetters24h: number;
  oldestPendingAgeSeconds: number | null;
  pending: number;
  staleLocks: number;
}

export function evaluateQueue(
  snapshot: QueueSnapshot,
  thresholds: {
    maxDeadLetters24h: number;
    maxPending: number;
    maxPendingAgeSeconds: number;
    production: boolean;
  },
): ProbeResult {
  const reasons = [
    ...(snapshot.pending > thresholds.maxPending ? ['queue_backlog'] : []),
    ...(snapshot.oldestPendingAgeSeconds !== null &&
    snapshot.oldestPendingAgeSeconds > thresholds.maxPendingAgeSeconds
      ? ['queue_age']
      : []),
    ...(snapshot.staleLocks > 0 ? ['stale_locks'] : []),
    ...(snapshot.deadLetters24h > thresholds.maxDeadLetters24h
      ? ['dead_letters']
      : []),
    ...(!snapshot.backgroundEnabled && thresholds.production
      ? ['workers_disabled']
      : []),
  ];
  return {
    status: reasons.length === 0 ? 'ready' : 'not_ready',
    reason: reasons.length > 0 ? reasons.join(',') : undefined,
    details: {
      backgroundEnabled: snapshot.backgroundEnabled,
      deadLetters24h: snapshot.deadLetters24h,
      oldestPendingAgeSeconds: snapshot.oldestPendingAgeSeconds,
      pending: snapshot.pending,
      staleLocks: snapshot.staleLocks,
    },
  };
}

@Injectable()
export class HealthService {
  private cached?: { expiresAt: number; report: Promise<ReadinessReport> };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly payment: MockPaymentGateway,
    private readonly metrics: MetricsRegistry,
    private readonly alerts: ObservabilityAlertService,
  ) {}

  liveness() {
    return {
      status: 'ok',
      service: 'niazat-api',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  readiness() {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.report;
    const report = this.runReadiness();
    this.cached = {
      expiresAt:
        now + Number(this.config.get('READINESS_CACHE_TTL_MS') ?? 5_000),
      report,
    };
    return report;
  }

  private async runReadiness(): Promise<ReadinessReport> {
    const checks = await Promise.all([
      this.check('database', () => this.databaseProbe()),
      this.check('storage', () => this.storageProbe()),
      this.check('queue', () => this.queueProbe()),
      this.check('sms', () => Promise.resolve(this.sms.readiness())),
      this.check('email', () => Promise.resolve(this.email.readiness())),
      this.check('payment', () => Promise.resolve(this.payment.readiness())),
    ]);
    for (const check of checks) {
      const ready = check.status === 'ready';
      this.metrics.setDependencyStatus(check.name, ready);
      this.alerts.recordDependency(check.name, ready, check.reason);
    }
    return {
      status: checks.every(
        (check) => !check.critical || check.status === 'ready',
      )
        ? 'ready'
        : 'not_ready',
      checkedAt: new Date().toISOString(),
      checks,
    };
  }

  private async check(
    name: DependencyCheck['name'],
    probe: () => Promise<ProbeResult>,
  ): Promise<DependencyCheck> {
    const started = process.hrtime.bigint();
    try {
      const result = await this.withTimeout(
        probe(),
        Number(this.config.get('READINESS_TIMEOUT_MS') ?? 3_000),
      );
      return {
        name,
        critical: true,
        latencyMs: this.elapsedMs(started),
        ...result,
      };
    } catch {
      return {
        name,
        critical: true,
        status: 'not_ready',
        latencyMs: this.elapsedMs(started),
        reason: 'probe_failed_or_timed_out',
      };
    }
  }

  private async databaseProbe(): Promise<ProbeResult> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }

  private async storageProbe(): Promise<ProbeResult> {
    const probePath = join(UPLOAD_ROOT, `.readiness-${randomUUID()}.tmp`);
    try {
      await writeFile(probePath, 'ready', {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      return { status: 'ready' };
    } finally {
      await rm(probePath, { force: true });
    }
  }

  private async queueProbe(): Promise<ProbeResult> {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const staleBefore = new Date(now.getTime() - 5 * 60 * 1_000);
    const [pending, deadLetters24h, oldestPending, staleLocks] =
      await Promise.all([
        this.prisma.outboxEvent.count({
          where: {
            status: {
              in: [
                OutboxStatus.pending,
                OutboxStatus.failed,
                OutboxStatus.processing,
              ],
            },
          },
        }),
        this.prisma.outboxEvent.count({
          where: { deadLetteredAt: { gte: since } },
        }),
        this.prisma.outboxEvent.findFirst({
          where: {
            status: { in: [OutboxStatus.pending, OutboxStatus.failed] },
            availableAt: { lte: now },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.outboxEvent.count({
          where: {
            status: OutboxStatus.processing,
            lockedAt: { lt: staleBefore },
          },
        }),
      ]);
    const snapshot: QueueSnapshot = {
      backgroundEnabled: this.config.get('BACKGROUND_JOBS_ENABLED') !== false,
      deadLetters24h,
      oldestPendingAgeSeconds: oldestPending
        ? Math.floor(
            (now.getTime() - oldestPending.createdAt.getTime()) / 1_000,
          )
        : null,
      pending,
      staleLocks,
    };
    return evaluateQueue(snapshot, {
      maxDeadLetters24h: Number(
        this.config.get('QUEUE_MAX_DEAD_LETTERS_24H') ?? 10,
      ),
      maxPending: Number(this.config.get('QUEUE_MAX_PENDING') ?? 1_000),
      maxPendingAgeSeconds: Number(
        this.config.get('QUEUE_MAX_AGE_SECONDS') ?? 900,
      ),
      production: this.config.get('NODE_ENV') === 'production',
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('readiness_timeout')),
        timeoutMs,
      );
      timer.unref();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(
            error instanceof Error
              ? error
              : new Error('readiness_probe_failed'),
          );
        },
      );
    });
  }

  private elapsedMs(started: bigint) {
    return (
      Math.round(
        (Number(process.hrtime.bigint() - started) / 1_000_000) * 100,
      ) / 100
    );
  }
}
