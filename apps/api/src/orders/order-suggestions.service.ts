import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { suggestedPrice, suggestionScore } from './suggestion-metrics';

@Injectable()
export class OrderSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}
  async suggest(id: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: {
            package: true,
            serviceLine: { select: { category: true } },
          },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        const category = order.serviceLine.category;
        const requireSkill = await tx.skill.count({ where: { category } });
        const candidates = await tx.executorProfile.findMany({
          where: {
            status: 'active',
            verificationStatus: 'approved',
            capacityPercent: { lt: 100 },
            user: { status: 'active' },
            OR: [
              { executorType: 'internal_staff' },
              {
                executorType: 'vetted_external',
                onboarding: { stage: 'approved' },
              },
            ],
            ...(requireSkill
              ? { skills: { some: { skill: { category } } } }
              : {}),
          },
          select: {
            id: true,
            displayAlias: true,
            publicHandlerCode: true,
            capacityPercent: true,
            qcPassRate: true,
            onTimeDeliveryRate: true,
            riskScore: true,
            team: { select: { name: true } },
            skills: {
              where: { skill: { category } },
              select: { level: true, skill: { select: { name: true } } },
            },
          },
          orderBy: [{ capacityPercent: 'asc' }, { id: 'asc' }],
          take: 100,
        });
        const past = await tx.order.findMany({
          where: {
            id: { not: id },
            serviceId: order.serviceId,
            currency: 'IRT',
            status: 'closed',
            finalPrice: { gt: 0 },
            closedAt: { gte: new Date(Date.now() - 180 * 86400000) },
            refunds: { none: {} },
          },
          select: { finalPrice: true },
          orderBy: [{ closedAt: 'desc' }, { id: 'asc' }],
          take: 30,
        });
        const price = suggestedPrice(
          order.package?.isActive && order.package.serviceId === order.serviceId
            ? order.package.price
            : null,
          past.flatMap((row) =>
            row.finalPrice === null ? [] : [row.finalPrice],
          ),
        );
        const ranked = candidates
          .map((profile) => {
            const evidence = {
              skillLevel: Math.max(
                0,
                ...profile.skills.map((row) => row.level),
              ),
              capacityPercent: profile.capacityPercent,
              qcPassRate: Number(profile.qcPassRate),
              onTimeRate: Number(profile.onTimeDeliveryRate),
              riskScore: Number(profile.riskScore),
            };
            return {
              id: profile.id,
              displayAlias: profile.displayAlias,
              publicHandlerCode: profile.publicHandlerCode,
              team: profile.team?.name ?? null,
              score: suggestionScore(evidence),
              evidence,
              skills: profile.skills.map((row) => row.skill.name),
            };
          })
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
          .slice(0, 10);
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'order.suggestions_read',
            entityType: 'order',
            entityId: id,
            sensitivity: 'sensitive',
            after: {
              method: 'rules_v1',
              candidateCount: ranked.length,
              pricingSource: price.source,
              orderVersion: order.version,
            },
          },
        });
        return {
          orderId: id,
          orderVersion: order.version,
          generatedAt: new Date().toISOString(),
          method: 'rules_v1',
          requiresHumanReview: true,
          candidates: ranked,
          candidatePoolLimit: 100,
          price: { ...price, currency: 'IRT' },
          limitations: [
            'No scope/urgency/complexity adjustment',
            'Eligibility is rechecked when a human assigns',
            'Quality/risk values may lack history for new staff',
          ],
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
  }
}
