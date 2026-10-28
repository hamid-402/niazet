import { ConfigService } from '@nestjs/config';
import type { OrderIntake } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifiedEmailEnabled } from '../auth/verified-email-session';
import { orderIntakeView } from '../orders/domain/order-intake';
import { customerIntakeEnabled } from './customer-intake-config';

/** Additive owner export. Never include challenges, hashes or session tags. */
export async function customerPrivateData(
  prisma: PrismaService,
  config: ConfigService,
  userId: string,
) {
  const email = verifiedEmailEnabled(config);
  const intake = customerIntakeEnabled(config);
  if (!email && !intake) return {};
  const [identity, onboarding, orders] = await Promise.all([
    email
      ? prisma.emailLoginIdentity.findUnique({
          where: { userId },
          select: { emailNormalized: true, verifiedAt: true },
        })
      : null,
    intake
      ? prisma.customerOnboardingState.findUnique({
          where: { userId },
          select: {
            schemaVersion: true,
            revision: true,
            purpose: true,
            skipped: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : null,
    intake
      ? prisma.orderIntake.findMany({
          where: { order: { customerId: userId } },
          orderBy: { orderId: 'asc' },
        })
      : ([] as OrderIntake[]),
  ]);
  return {
    ...(email ? { verifiedEmailIdentity: identity } : {}),
    ...(intake
      ? {
          customerOnboarding: onboarding,
          orderIntakes: orders.map((row) => ({
            orderId: row.orderId,
            ...orderIntakeView(row),
          })),
        }
      : {}),
  };
}
