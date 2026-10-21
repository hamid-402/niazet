import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderAssignmentService {
  async loadEligibleExecutor(
    client: Prisma.TransactionClient,
    order: { id: string; serviceId: string },
    executorProfileId: string,
    requestedTeamId?: string,
    assignmentRole?: string,
  ) {
    await client.$queryRaw`SELECT id FROM executor_profiles WHERE id = ${executorProfileId} FOR UPDATE`;
    const profile = await client.executorProfile.findUnique({
      where: { id: executorProfileId },
      include: {
        user: true,
        onboarding: true,
        skills: { include: { skill: true } },
      },
    });
    if (!profile) throw new NotFoundException('مجری یافت نشد.');
    if (
      profile.executorType === 'vetted_external' &&
      profile.onboarding?.stage !== 'approved'
    ) {
      throw new BadRequestException(
        'مراحل جذب مجری بیرونی هنوز کامل نشده است.',
      );
    }
    if (
      profile.status !== 'active' ||
      profile.verificationStatus !== 'approved' ||
      profile.user.status !== 'active' ||
      profile.capacityPercent >= 100
    ) {
      throw new BadRequestException(
        'مجری باید فعال، تأییدشده و دارای ظرفیت آزاد باشد.',
      );
    }
    if (requestedTeamId && profile.teamId !== requestedTeamId) {
      throw new BadRequestException('مجری عضو تیم انتخاب‌شده نیست.');
    }
    const service = await client.serviceLine.findUnique({
      where: { id: order.serviceId },
      select: { category: true },
    });
    const categorizedSkills = service
      ? await client.skill.count({ where: { category: service.category } })
      : 0;
    if (
      service &&
      categorizedSkills > 0 &&
      !profile.skills.some((item) => item.skill.category === service.category)
    ) {
      throw new BadRequestException(
        'مهارت مجری با دسته خدمت سفارش سازگار نیست.',
      );
    }
    if (assignmentRole === 'qc_reviewer') {
      const activeExecutor = await client.orderAssignment.findFirst({
        where: {
          orderId: order.id,
          unassignedAt: null,
          assignmentRole: { not: 'qc_reviewer' },
        },
        include: { executorProfile: true },
      });
      if (activeExecutor?.executorProfile.userId === profile.userId) {
        throw new BadRequestException(
          'بازبین QC نمی‌تواند همان مجری سفارش باشد.',
        );
      }
    }
    return profile;
  }
}
