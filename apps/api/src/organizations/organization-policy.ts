import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
export async function requireMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  roles?: string[],
) {
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (
    !member ||
    member.status !== 'active' ||
    (roles && !roles.includes(member.role))
  )
    throw new ForbiddenException('دسترسی به این سازمان مجاز نیست.');
  return member;
}
export function subscriptionIsActive(
  subscription: { status: string; startsAt: Date; endsAt: Date } | null,
  now = new Date(),
) {
  return (
    !!subscription &&
    subscription.status === 'active' &&
    subscription.startsAt <= now &&
    subscription.endsAt > now
  );
}
export async function activeSubscription(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const subscription = await tx.organizationSubscription.findUnique({
    where: { organizationId },
  });
  if (!subscription || !subscriptionIsActive(subscription))
    throw new BadRequestException(
      'برای این اقدام، اشتراک سازمان باید فعال و در دوره معتبر باشد.',
    );
  return subscription;
}
