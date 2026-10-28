import { Order, Prisma } from '@prisma/client';

export async function captureQuotedContract(
  tx: Prisma.TransactionClient,
  order: Order,
  note?: string,
) {
  const service = await tx.serviceLine.findUniqueOrThrow({
    where: { id: order.serviceId },
  });
  let policy = await tx.serviceContractPolicy.findFirst({
    where: { serviceId: service.id },
    orderBy: { version: 'desc' },
  });
  if (!policy)
    policy = await tx.serviceContractPolicy.upsert({
      where: { serviceId_version: { serviceId: service.id, version: 1 } },
      create: { serviceId: service.id, version: 1 },
      update: {},
    });
  // Manual quote is authoritative only for finalPrice. A base/rate/deadline
  // cannot be reverse-engineered from today's catalogue or an unknown old date.
  await tx.orderContractSnapshot.create({
    data: {
      orderId: order.id,
      internalNote: note?.trim() || null,
      policySnapshot: {
        schemaVersion: 1,
        source: 'human_quote',
        currency: order.currency,
        agreedFinalPrice: order.finalPrice,
        quotedAt: order.quotedAt?.toISOString() ?? null,
        serviceId: service.id,
        pricingModel: service.pricingModel,
        slaHours: service.slaHours,
        servicePolicyVersion: policy.version,
        normalRateBps: policy.normalRateBps,
        urgentRateBps: policy.urgentRateBps,
        sameDayRateBps: policy.sameDayRateBps,
        ratesApplied: false,
        urgency: order.urgency,
        unknownFields: [
          'basePrice',
          'surchargeRateBps',
          'surchargeAmount',
          'deadlineNormal',
          'deadlineEffective',
        ],
      },
    },
  });
}
