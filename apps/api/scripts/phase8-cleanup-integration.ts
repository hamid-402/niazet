import { ConfigService } from '@nestjs/config';
import {
  BackgroundJobStatus,
  FileKind,
  FileScanStatus,
  OutboxStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DataCleanupService } from '../src/jobs/data-cleanup.service';
import type { PrismaService } from '../src/prisma/prisma.service';

if (process.env.NODE_ENV !== 'test')
  throw new Error('Cleanup integration only runs in NODE_ENV=test.');
if (process.env.CLEANUP_TEST_CONFIRM !== 'niazat_cleanup_test') {
  throw new Error('CLEANUP_TEST_CONFIRM safety acknowledgement is missing.');
}
if (!process.env.DATABASE_URL?.includes('niazat_ci')) {
  throw new Error('Cleanup integration requires the disposable CI database.');
}

const prisma = new PrismaClient();
const cleanup = new DataCleanupService(
  prisma as unknown as PrismaService,
  new ConfigService({ DATA_CLEANUP_BATCH_SIZE: '100' }),
);
const suffix = randomUUID().slice(0, 8);
const now = new Date('2026-09-03T08:00:00.000Z');
const old = new Date('2026-01-01T00:00:00.000Z');
const future = new Date('2027-01-01T00:00:00.000Z');
const ids = {
  expiredSession: randomUUID(),
  preservedSession: randomUUID(),
  expiredOtp: randomUUID(),
  preservedOtp: randomUUID(),
  expiredIdempotency: randomUUID(),
  preservedIdempotency: randomUUID(),
  sentOutbox: randomUUID(),
  deadOutbox: randomUUID(),
  preservedOutbox: randomUUID(),
  expiredSigned: randomUUID(),
  preservedSigned: randomUUID(),
  oldJob: randomUUID(),
  preservedJob: randomUUID(),
};
let userId: string | undefined;
let serviceId: string | undefined;
let orderId: string | undefined;
let cleanupRunId: string | undefined;

async function main() {
  try {
    const user = await prisma.user.create({
      data: {
        role: UserRole.customer,
        status: UserStatus.active,
        fullName: 'Cleanup CI User',
        phone: `+98910${Date.now().toString().slice(-7)}`,
      },
    });
    userId = user.id;
    const service = await prisma.serviceLine.create({
      data: {
        slug: `cleanup-ci-${suffix}`,
        title: 'Cleanup CI Service',
        category: 'test',
        description: 'Disposable service used by the cleanup integration test.',
      },
    });
    serviceId = service.id;
    const order = await prisma.order.create({
      data: {
        code: `CLEANUP-${suffix}`,
        customerId: user.id,
        serviceId: service.id,
        title: 'Cleanup integration order',
        briefDescription: 'Disposable cleanup integration data',
      },
    });
    orderId = order.id;
    const file = await prisma.orderFile.create({
      data: {
        orderId: order.id,
        uploadedByUserId: user.id,
        fileKind: FileKind.input,
        storageKey: randomUUID(),
        originalName: 'cleanup.txt',
        mimeType: 'text/plain',
        sizeBytes: 1,
        scanStatus: FileScanStatus.clean,
      },
    });

    await prisma.session.createMany({
      data: [
        {
          id: ids.expiredSession,
          userId: user.id,
          familyId: randomUUID(),
          refreshTokenHash: 'expired-hash',
          expiresAt: old,
        },
        {
          id: ids.preservedSession,
          userId: user.id,
          familyId: randomUUID(),
          refreshTokenHash: 'preserved-hash',
          expiresAt: future,
        },
      ],
    });
    await prisma.otpCode.createMany({
      data: [
        {
          id: ids.expiredOtp,
          userId: user.id,
          identifier: user.phone,
          purpose: 'cleanup-expired',
          codeHash: 'expired-hash',
          expiresAt: old,
        },
        {
          id: ids.preservedOtp,
          userId: user.id,
          identifier: user.phone,
          purpose: 'cleanup-preserved',
          codeHash: 'preserved-hash',
          expiresAt: future,
        },
      ],
    });
    await prisma.idempotencyKey.createMany({
      data: [
        {
          id: ids.expiredIdempotency,
          key: `cleanup-old-${suffix}`,
          scope: 'cleanup.integration',
          requestHash: 'old',
          expiresAt: old,
        },
        {
          id: ids.preservedIdempotency,
          key: `cleanup-new-${suffix}`,
          scope: 'cleanup.integration',
          requestHash: 'new',
          expiresAt: future,
        },
      ],
    });
    await prisma.outboxEvent.createMany({
      data: [
        {
          id: ids.sentOutbox,
          eventType: 'cleanup.old.sent',
          payload: {},
          status: OutboxStatus.sent,
          createdAt: old,
          sentAt: old,
        },
        {
          id: ids.deadOutbox,
          eventType: 'cleanup.old.dead',
          payload: {},
          status: OutboxStatus.dead_letter,
          createdAt: old,
          deadLetteredAt: old,
        },
        {
          id: ids.preservedOutbox,
          eventType: 'cleanup.preserved.pending',
          payload: {},
          status: OutboxStatus.pending,
          createdAt: old,
        },
      ],
    });
    await prisma.signedUrlGrant.createMany({
      data: [
        {
          id: ids.expiredSigned,
          fileId: file.id,
          userId: user.id,
          tokenHash: `cleanup-old-${suffix}`,
          expiresAt: old,
        },
        {
          id: ids.preservedSigned,
          fileId: file.id,
          userId: user.id,
          tokenHash: `cleanup-new-${suffix}`,
          expiresAt: future,
        },
      ],
    });
    await prisma.backgroundJobRun.createMany({
      data: [
        {
          id: ids.oldJob,
          jobName: 'cleanup-integration-old',
          runKey: suffix,
          status: BackgroundJobStatus.succeeded,
          startedAt: old,
          completedAt: old,
        },
        {
          id: ids.preservedJob,
          jobName: 'cleanup-integration-running',
          runKey: suffix,
          status: BackgroundJobStatus.running,
          startedAt: old,
        },
      ],
    });

    const result = await cleanup.cleanup(now);
    assert.ok(
      result.processed >= 7,
      'Expected cleanup records were not processed.',
    );
    cleanupRunId =
      'details' in result ? String(result.details?.runId ?? '') : undefined;

    const deleted = await Promise.all([
      prisma.session.findUnique({ where: { id: ids.expiredSession } }),
      prisma.otpCode.findUnique({ where: { id: ids.expiredOtp } }),
      prisma.idempotencyKey.findUnique({
        where: { id: ids.expiredIdempotency },
      }),
      prisma.outboxEvent.findUnique({ where: { id: ids.sentOutbox } }),
      prisma.outboxEvent.findUnique({ where: { id: ids.deadOutbox } }),
      prisma.signedUrlGrant.findUnique({ where: { id: ids.expiredSigned } }),
      prisma.backgroundJobRun.findUnique({ where: { id: ids.oldJob } }),
    ]);
    assert.ok(
      deleted.every((record) => record === null),
      'Expired records were not deleted.',
    );

    const preserved = await Promise.all([
      prisma.session.findUnique({ where: { id: ids.preservedSession } }),
      prisma.otpCode.findUnique({ where: { id: ids.preservedOtp } }),
      prisma.idempotencyKey.findUnique({
        where: { id: ids.preservedIdempotency },
      }),
      prisma.outboxEvent.findUnique({ where: { id: ids.preservedOutbox } }),
      prisma.signedUrlGrant.findUnique({ where: { id: ids.preservedSigned } }),
      prisma.backgroundJobRun.findUnique({ where: { id: ids.preservedJob } }),
    ]);
    assert.ok(
      preserved.every((record) => record !== null),
      'Live or actionable records were deleted.',
    );
    process.stdout.write(
      'Phase 8 PostgreSQL retention cleanup passed: expired rows deleted, live and pending rows preserved.\n',
    );
  } finally {
    await prisma.backgroundJobRun
      .deleteMany({ where: { id: { in: Object.values(ids) } } })
      .catch(() => undefined);
    await prisma.outboxEvent
      .deleteMany({
        where: {
          id: { in: [ids.sentOutbox, ids.deadOutbox, ids.preservedOutbox] },
        },
      })
      .catch(() => undefined);
    await prisma.idempotencyKey
      .deleteMany({
        where: {
          id: { in: [ids.expiredIdempotency, ids.preservedIdempotency] },
        },
      })
      .catch(() => undefined);
    if (orderId) {
      await prisma.order
        .delete({ where: { id: orderId } })
        .catch(() => undefined);
    }
    if (serviceId)
      await prisma.serviceLine
        .delete({ where: { id: serviceId } })
        .catch(() => undefined);
    if (userId)
      await prisma.user
        .delete({ where: { id: userId } })
        .catch(() => undefined);
    if (cleanupRunId) {
      await prisma.auditLog
        .deleteMany({
          where: { action: 'data.cleanup', entityId: cleanupRunId },
        })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Cleanup integration failed: ${message}\n`);
  process.exitCode = 1;
});
