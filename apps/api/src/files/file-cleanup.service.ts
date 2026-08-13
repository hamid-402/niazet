import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditSensitivity, FileScanStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QUARANTINE_ROOT, UPLOAD_ROOT } from './files.service';
import {
  deleteContainedFile,
  listStalePhysicalFiles,
} from './file-cleanup-storage';

const FILE_CLEANUP_LOCK_ID = 731_942_017;
const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_ORPHAN_GRACE_MINUTES = 60;
const DEFAULT_REJECTED_RETENTION_HOURS = 24;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class FileCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileCleanupService.name);
  private interval?: NodeJS.Timeout;
  private initialRun?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (
      this.config.get<string>('NODE_ENV') === 'test' ||
      this.config.get<string>('FILE_CLEANUP_ENABLED') === 'false'
    ) {
      return;
    }

    const intervalMinutes = positiveInteger(
      this.config.get<string>('FILE_CLEANUP_INTERVAL_MINUTES'),
      DEFAULT_INTERVAL_MINUTES,
    );
    this.initialRun = setTimeout(() => void this.runScheduled(), 30_000);
    this.initialRun.unref();
    this.interval = setInterval(
      () => void this.runScheduled(),
      intervalMinutes * 60_000,
    );
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.initialRun) clearTimeout(this.initialRun);
    if (this.interval) clearInterval(this.interval);
  }

  private async runScheduled() {
    try {
      await this.cleanup();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`File cleanup failed: ${message}`);
    }
  }

  async cleanup(now = new Date()) {
    if (this.running) return { skipped: 'already_running' as const };
    this.running = true;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
            Prisma.sql`SELECT pg_try_advisory_xact_lock(${FILE_CLEANUP_LOCK_ID}) AS acquired`,
          );
          if (!lock?.acquired) {
            return { skipped: 'lock_unavailable' as const };
          }

          const graceMinutes = positiveInteger(
            this.config.get<string>('FILE_ORPHAN_GRACE_MINUTES'),
            DEFAULT_ORPHAN_GRACE_MINUTES,
          );
          const retentionHours = positiveInteger(
            this.config.get<string>('FILE_REJECTED_RETENTION_HOURS'),
            DEFAULT_REJECTED_RETENTION_HOURS,
          );
          const orphanCutoff = new Date(now.getTime() - graceMinutes * 60_000);
          const rejectedCutoff = new Date(
            now.getTime() - retentionHours * 60 * 60_000,
          );

          const rejectedFiles = await tx.orderFile.findMany({
            where: {
              scanStatus: FileScanStatus.infected,
              purgedAt: null,
              createdAt: { lt: rejectedCutoff },
            },
            select: { id: true, storageKey: true },
          });

          let rejectedPhysicalFiles = 0;
          for (const file of rejectedFiles) {
            if (deleteContainedFile(UPLOAD_ROOT, file.storageKey)) {
              rejectedPhysicalFiles += 1;
            }
            if (deleteContainedFile(QUARANTINE_ROOT, file.storageKey)) {
              rejectedPhysicalFiles += 1;
            }
          }
          if (rejectedFiles.length) {
            await tx.orderFile.updateMany({
              where: { id: { in: rejectedFiles.map((file) => file.id) } },
              data: { purgedAt: now },
            });
          }

          const physicalKeys = [
            ...new Set([
              ...listStalePhysicalFiles(UPLOAD_ROOT, orphanCutoff),
              ...listStalePhysicalFiles(QUARANTINE_ROOT, orphanCutoff),
            ]),
          ];
          const knownFiles = physicalKeys.length
            ? await tx.orderFile.findMany({
                where: { storageKey: { in: physicalKeys } },
                select: { storageKey: true },
              })
            : [];
          const knownKeys = new Set(knownFiles.map((file) => file.storageKey));
          const orphanKeys = physicalKeys.filter((key) => !knownKeys.has(key));

          let orphanPhysicalFiles = 0;
          for (const key of orphanKeys) {
            if (deleteContainedFile(UPLOAD_ROOT, key)) orphanPhysicalFiles += 1;
            if (deleteContainedFile(QUARANTINE_ROOT, key)) {
              orphanPhysicalFiles += 1;
            }
          }

          const runId = randomUUID();
          await tx.auditLog.create({
            data: {
              action: 'file.cleanup',
              entityType: 'maintenance_job',
              entityId: runId,
              sensitivity: AuditSensitivity.sensitive,
              after: {
                rejectedRecordsPurged: rejectedFiles.length,
                rejectedPhysicalFiles,
                orphanKeys: orphanKeys.length,
                orphanPhysicalFiles,
                orphanCutoff: orphanCutoff.toISOString(),
                rejectedCutoff: rejectedCutoff.toISOString(),
              },
            },
          });

          return {
            runId,
            rejectedRecordsPurged: rejectedFiles.length,
            rejectedPhysicalFiles,
            orphanKeys: orphanKeys.length,
            orphanPhysicalFiles,
          };
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    } finally {
      this.running = false;
    }
  }
}
