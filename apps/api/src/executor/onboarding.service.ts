import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { nextOnboardingStage } from './onboarding-policy';
import type { ReviewOnboardingDto } from './onboarding.controller';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}
  async read(profileId: string) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        displayAlias: true,
        executorType: true,
        verificationStatus: true,
        onboarding: {
          include: {
            reviews: {
              orderBy: { createdAt: 'desc' },
              take: 100,
              include: { actor: { select: { fullName: true } } },
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('مجری پیدا نشد.');
    if (profile.executorType !== 'vetted_external')
      throw new BadRequestException('این پرونده مربوط به مجری بیرونی نیست.');
    return profile;
  }
  async start(profileId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM executor_profiles WHERE id = ${profileId} FOR UPDATE`;
      const profile = await tx.executorProfile.findUnique({
        where: { id: profileId },
        include: { onboarding: true },
      });
      if (!profile) throw new NotFoundException('مجری پیدا نشد.');
      if (profile.executorType !== 'vetted_external')
        throw new BadRequestException('نوع مجری باید بیرونی باشد.');
      if (profile.onboarding) return profile.onboarding;
      if (
        await tx.orderAssignment.count({
          where: { executorProfileId: profileId, unassignedAt: null },
        })
      )
        throw new ConflictException(
          'ابتدا سفارش‌های فعال این مجری را تعیین تکلیف کنید.',
        );
      const dossier = await tx.executorOnboarding.create({
        data: { executorProfileId: profileId },
      });
      await tx.executorProfile.update({
        where: { id: profileId },
        data: { verificationStatus: 'pending' },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'onboarding.started',
          entityType: 'executor_profile',
          entityId: profileId,
          sensitivity: 'critical',
        },
      });
      return dossier;
    });
  }
  async review(
    profileId: string,
    dto: ReviewOnboardingDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the same profile row used by assignment and profile edits.
      await tx.$queryRaw`SELECT id FROM executor_profiles WHERE id = ${profileId} FOR UPDATE`;
      const profile = await tx.executorProfile.findUnique({
        where: { id: profileId },
        include: { onboarding: true },
      });
      if (!profile?.onboarding)
        throw new NotFoundException('ابتدا پرونده جذب را تشکیل دهید.');
      if (profile.executorType !== 'vetted_external')
        throw new BadRequestException('پرونده بیرونی معتبر نیست.');
      if (profile.userId === actor.id)
        throw new BadRequestException('بررسی پرونده خودتان مجاز نیست.');
      const before = profile.onboarding;
      if (before.version !== dto.version)
        throw new ConflictException(
          'پرونده تغییر کرده است؛ صفحه را تازه کنید.',
        );
      const stage = nextOnboardingStage(
        before.stage,
        dto.decision,
        dto.evidenceReference,
      );
      if (
        dto.decision === 'reject' &&
        (await tx.orderAssignment.count({
          where: { executorProfileId: profileId, unassignedAt: null },
        }))
      )
        throw new ConflictException(
          'برای رد یا لغو تأیید، ابتدا تخصیص‌های فعال را تعیین تکلیف کنید.',
        );
      const changed = await tx.executorOnboarding.updateMany({
        where: { id: before.id, version: dto.version },
        data: { stage, version: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException('پرونده هم‌زمان تغییر کرد.');
      await tx.onboardingReview.create({
        data: {
          onboardingId: before.id,
          actorUserId: actor.id,
          stage: before.stage,
          decision: dto.decision,
          note: dto.note.trim(),
          evidenceReference: dto.evidenceReference?.trim(),
        },
      });
      await tx.executorProfile.update({
        where: { id: profileId },
        data: {
          verificationStatus:
            stage === 'approved'
              ? 'approved'
              : stage === 'rejected'
                ? 'rejected'
                : 'in_review',
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'onboarding.reviewed',
          entityType: 'executor_profile',
          entityId: profileId,
          sensitivity: 'critical',
          before: { stage: before.stage, version: before.version },
          after: { stage, decision: dto.decision, version: before.version + 1 },
        },
      });
      return { stage, version: before.version + 1 };
    });
  }
}
