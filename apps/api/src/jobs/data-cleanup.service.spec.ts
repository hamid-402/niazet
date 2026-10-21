import { ConfigService } from '@nestjs/config';
import { DataCleanupService, cleanupCutoffs } from './data-cleanup.service';

const delegate = () => ({
  findMany: jest.fn().mockResolvedValue([{ id: 'old-record' }]),
  deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
});

describe('DataCleanupService', () => {
  it('calculates independent retention cutoffs', () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    const cutoffs = cleanupCutoffs(now, {
      sessionDays: 30,
      otpDays: 7,
      idempotencyGraceDays: 1,
      sentOutboxDays: 30,
      deadLetterDays: 90,
      signedUrlDays: 7,
      jobRunDays: 30,
      batchSize: 500,
    });
    expect(cutoffs.sessions.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(cutoffs.otpCodes.toISOString()).toBe('2026-08-27T00:00:00.000Z');
    expect(cutoffs.deadLetters.toISOString()).toBe('2026-06-05T00:00:00.000Z');
  });

  it('deletes only selected batches and writes one audit record', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      session: delegate(),
      otpCode: delegate(),
      idempotencyKey: delegate(),
      outboxEvent: delegate(),
      signedUrlGrant: delegate(),
      backgroundJobRun: delegate(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new DataCleanupService(
      prisma as never,
      config as unknown as ConfigService,
    );
    const result = await service.cleanup(new Date('2026-09-03T00:00:00.000Z'));

    expect(result.processed).toBe(6);
    expect(tx.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            expect.objectContaining({ status: 'sent' }),
            expect.objectContaining({ status: 'dead_letter' }),
          ],
        },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('does no work when the advisory lock is unavailable', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new DataCleanupService(
      prisma as never,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(service.cleanup()).resolves.toEqual({
      processed: 0,
      skipped: 1,
      details: { reason: 'lock_unavailable' },
    });
  });
});
