import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderIntake, OrderStatus, Prisma } from '@prisma/client';
import { mergeOrderIntake, readOrderIntake } from '../order-intake-contract';

export function orderIntakeView(row: OrderIntake | null) {
  return row
    ? {
        schemaVersion: row.schemaVersion,
        orderVersion: row.orderVersion,
        sealedAt: row.sealedAt,
        data: readOrderIntake(row.data),
      }
    : null;
}
/** Execution-only projection; customer financial/preferences data stays private. */
export function executionIntakeView(row: OrderIntake | null) {
  if (!row) return null;
  const data = readOrderIntake(row.data);
  if (!data) return null;
  return {
    schemaVersion: row.schemaVersion,
    sealedAt: row.sealedAt,
    requirements: {
      ...(data.goal === undefined ? {} : { goal: data.goal }),
      ...(data.brandGuidelines === undefined
        ? {}
        : { brandGuidelines: data.brandGuidelines }),
      ...(data.referenceUrls === undefined
        ? {}
        : { referenceUrls: data.referenceUrls }),
      ...(data.constraints === undefined
        ? {}
        : { constraints: data.constraints }),
    },
  };
}
export async function saveOrderIntake(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus; version: number },
  input: unknown,
  formSnapshot: unknown,
) {
  const previous = await tx.orderIntake.findUnique({
    where: { orderId: order.id },
  });
  if (input === undefined && !previous) return null; // legacy remains unknown
  if (order.status !== OrderStatus.draft || previous?.sealedAt)
    throw new BadRequestException(
      'اطلاعات ثبت‌شدهٔ سفارش قابل بازنویسی به‌عنوان پیش‌نویس نیست.',
    );
  const canonical = mergeOrderIntake(
    input === undefined ? previous!.data : input,
    formSnapshot,
    input === undefined,
  );
  if (canonical === null) {
    if (previous) await tx.orderIntake.delete({ where: { orderId: order.id } });
    return null;
  }
  const data = canonical as unknown as Prisma.InputJsonObject;
  const row = await tx.orderIntake.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, orderVersion: order.version, data },
    update: { orderVersion: order.version, data },
  });
  return orderIntakeView(row);
}
export async function sealOrderIntake(
  tx: Prisma.TransactionClient,
  order: { id: string; version: number },
) {
  const row = await tx.orderIntake.findUnique({ where: { orderId: order.id } });
  if (!row) return; // no speculative snapshot/backfill for an old order
  readOrderIntake(row.data);
  if (row.sealedAt)
    throw new ConflictException('اطلاعات این درخواست قبلاً ثبت قطعی شده است.');
  const now = (
    await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`
  )[0].now;
  const claimed = await tx.orderIntake.updateMany({
    where: { orderId: order.id, sealedAt: null },
    data: { sealedAt: now, orderVersion: order.version },
  });
  if (claimed.count !== 1)
    throw new ConflictException('اطلاعات درخواست هم‌زمان ثبت شده است.');
}
