import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function requestFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  requireKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || !KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'هدر Idempotency-Key با طول ۸ تا ۱۲۸ و فقط نویسه‌های امن الزامی است.',
      );
    }
    return key;
  }

  async execute<T>(params: {
    key: string;
    scope: string;
    request: unknown;
    work: (tx: Prisma.TransactionClient) => Promise<T>;
  }): Promise<T> {
    const key = this.requireKey(params.key);
    const requestHash = requestFingerprint(params.request);

    const run = () =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.idempotencyKey.findUnique({
            where: { scope_key: { scope: params.scope, key } },
          });
          if (existing) {
            return this.replay<T>(existing, requestHash);
          }

          const record = await tx.idempotencyKey.create({
            data: {
              key,
              scope: params.scope,
              requestHash,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });

          const result = await params.work(tx);
          const snapshot = JSON.parse(
            JSON.stringify(result),
          ) as Prisma.InputJsonValue;
          await tx.idempotencyKey.update({
            where: { id: record.id },
            data: { responseSnapshot: snapshot, completedAt: new Date() },
          });
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { scope_key: { scope: params.scope, key } },
        });
        if (!existing) throw error;
        return this.replay<T>(existing, requestHash);
      }
    }
    throw new ConflictException('تراکنش پس از سه تلاش هم‌زمان تکمیل نشد.');
  }

  private replay<T>(
    record: { requestHash: string; responseSnapshot: Prisma.JsonValue | null },
    requestHash: string,
  ): T {
    if (record.requestHash !== requestHash) {
      throw new ConflictException(
        'این Idempotency-Key قبلاً با محتوای متفاوت استفاده شده است.',
      );
    }
    if (record.responseSnapshot == null) {
      throw new ConflictException('درخواست همسان هنوز در حال پردازش است.');
    }
    return record.responseSnapshot as T;
  }
}
