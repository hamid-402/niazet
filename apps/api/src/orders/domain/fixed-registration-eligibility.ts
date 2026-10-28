import { ConflictException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { readCommercialPolicy } from '../../pricing/commercial-policy';
import { requestFingerprint } from '../../finance/idempotency.service';
import { answersFromSnapshot, snapshotServiceForm } from '../service-form';
import { intakeNeedsHumanReview } from '../order-intake-contract';

/** Only the owner-initiated pending-triage -> triaging edge uses this gate. */
export async function assertFixedRegistrationEligibility(
  tx: Prisma.TransactionClient,
  order: Order,
) {
  if (
    !order.submittedAt ||
    order.finalPrice !== null ||
    order.quotedAt !== null ||
    order.title.trim().length < 3 ||
    order.briefDescription.trim().length < 10
  )
    throw new ConflictException(
      'ثبت معتبر و بدون قیمت قبلی برای این مسیر لازم است.',
    );
  await tx.$queryRaw`SELECT id FROM service_lines WHERE id = ${order.serviceId} FOR UPDATE`;
  const service = await tx.serviceLine.findUnique({
    where: { id: order.serviceId },
    include: { packages: true, formFields: true },
  });
  if (!service || !service.isActive || service.pricingModel !== 'fixed')
    throw new ConflictException(
      'این مسیر فقط برای خدمت فعال با قیمت ثابت معتبر است.',
    );
  const selected = order.packageId
    ? service.packages.find((p) => p.id === order.packageId && p.isActive)
    : null;
  const base = selected ? selected.price : service.basePrice;
  if (
    (order.packageId && !selected) ||
    !Number.isSafeInteger(base) ||
    (base ?? 0) < 1 ||
    base! > 2_000_000_000
  )
    throw new ConflictException(
      'قیمت یا بستهٔ معتبر برای پرداخت هنگام ثبت موجود نیست.',
    );
  const policy = await tx.commercialPolicy.findFirst({
    where: { serviceId: service.id },
    orderBy: { version: 'desc' },
  });
  if (!policy)
    throw new ConflictException('سیاست مصوب قیمت و مهلت هنوز تنظیم نشده است.');
  readCommercialPolicy(policy.config);
  const snapshot = snapshotServiceForm(
    service,
    service.formFields,
    answersFromSnapshot(order.formResponses),
    true,
  );
  const stable = (value: Prisma.JsonValue | Prisma.InputJsonValue) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value, capturedAt: null }
      : null;
  if (
    requestFingerprint(stable(snapshot)) !==
    requestFingerprint(stable(order.formResponses))
  )
    throw new ConflictException(
      'تعریف فرم یا خدمت از زمان ثبت تغییر کرده است؛ بررسی انسانی لازم است.',
    );
  // Schema detection keeps the accepted 27-migration local environment usable
  // until the additive upgrade; a disabled UI flag cannot bypass stored terms.
  const intakeSchema = await tx.$queryRaw<
    Array<{ present: boolean }>
  >`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname='order_intakes' AND relkind IN ('r','p')) AS present`;
  const intake = intakeSchema[0]?.present
    ? await tx.orderIntake.findUnique({ where: { orderId: order.id } })
    : null;
  if (intakeNeedsHumanReview(intake?.data, order.formResponses))
    throw new ConflictException(
      'شرایط محرمانگی، تحویل مرحله‌ای یا افزودنی درخواستی به بررسی انسانی و قرارداد صریح نیاز دارد؛ قیمت یا اولویت خودکار عوض نمی‌شود.',
    );
  const [payments, contract, milestones, unsafeFiles] = await Promise.all([
    tx.payment.count({ where: { orderId: order.id } }),
    tx.commercialState.count({ where: { orderId: order.id } }),
    tx.orderMilestone.count({ where: { orderId: order.id } }),
    tx.orderFile.count({
      where: {
        orderId: order.id,
        OR: [{ scanStatus: { not: 'clean' } }, { purgedAt: { not: null } }],
      },
    }),
  ]);
  if (payments || contract || milestones || unsafeFiles)
    throw new ConflictException(
      'پرداخت، قرارداد، تحویل مرحله‌ای یا فایلِ نامطمئن به بررسی مسیر فعلی نیاز دارد.',
    );
}
