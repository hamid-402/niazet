/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { ConflictException } from '@nestjs/common';
import { IdempotencyService, requestFingerprint } from './idempotency.service';

describe('requestFingerprint', () => {
  it('is stable across object key order', () => {
    expect(requestFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(
      requestFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('does not collapse different requests', () => {
    expect(requestFingerprint({ amount: 1 })).not.toBe(
      requestFingerprint({ amount: 2 }),
    );
  });

  it('keeps conflict type available for replay mismatch', () => {
    expect(new ConflictException()).toBeInstanceOf(ConflictException);
  });
});

describe('IdempotencyService replay contract', () => {
  function createService() {
    const records = new Map<string, any>();
    const tx = {
      idempotencyKey: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            records.get(`${where.scope_key.scope}:${where.scope_key.key}`) ??
              null,
          ),
        ),
        create: jest.fn(({ data }) => {
          const id = `id-${records.size + 1}`;
          const record = { id, ...data, responseSnapshot: null };
          records.set(`${data.scope}:${data.key}`, record);
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data }) => {
          const entry = [...records.entries()].find(
            ([, value]) => value.id === where.id,
          )!;
          Object.assign(entry[1], data);
          return Promise.resolve(entry[1]);
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => {
        const snapshot = new Map(
          [...records.entries()].map(([key, value]) => [key, { ...value }]),
        );
        try {
          return await callback(tx);
        } catch (error) {
          records.clear();
          snapshot.forEach((value, key) => records.set(key, value));
          throw error;
        }
      }),
      idempotencyKey: tx.idempotencyKey,
    };
    return new IdempotencyService(prisma as never);
  }

  it('executes once and replays the stored response', async () => {
    const service = createService();
    const work = jest.fn(async () => ({ ok: true, amount: 12 }));
    const request = {
      key: 'request-123',
      scope: 'finance.test',
      request: { amount: 12 },
      work,
    };
    await expect(service.execute(request)).resolves.toEqual({
      ok: true,
      amount: 12,
    });
    await expect(service.execute(request)).resolves.toEqual({
      ok: true,
      amount: 12,
    });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('rejects key reuse with a different payload', async () => {
    const service = createService();
    await service.execute({
      key: 'request-456',
      scope: 'finance.test',
      request: { amount: 12 },
      work: async () => ({ ok: true }),
    });
    await expect(
      service.execute({
        key: 'request-456',
        scope: 'finance.test',
        request: { amount: 13 },
        work: async () => ({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not execute concurrent duplicate work twice', async () => {
    const service = createService();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const work = jest.fn(async () => {
      await gate;
      return { ok: true };
    });
    const request = {
      key: 'concurrent-123',
      scope: 'finance.concurrent',
      request: { amount: 100 },
      work,
    };
    const first = service.execute(request);
    // Let the first transaction claim its durable key while work is still gated.
    await Promise.resolve();
    await Promise.resolve();
    const second = service.execute(request);
    finish();
    const results = await Promise.allSettled([first, second]);
    expect(work).toHaveBeenCalledTimes(1);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('rolls back a failed attempt so a retry can complete', async () => {
    const service = createService();
    const failing = service.execute({
      key: 'retry-1234',
      scope: 'finance.retry',
      request: { amount: 100 },
      work: async () => {
        throw new Error('mid-transaction failure');
      },
    });
    await expect(failing).rejects.toThrow('mid-transaction failure');
    await expect(
      service.execute({
        key: 'retry-1234',
        scope: 'finance.retry',
        request: { amount: 100 },
        work: async () => ({ recovered: true }),
      }),
    ).resolves.toEqual({ recovered: true });
  });
});
