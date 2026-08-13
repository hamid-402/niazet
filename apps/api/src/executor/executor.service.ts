import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExecutorStatus,
  ExecutorType,
  OrderStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import { CreateStaffDto, CreateTeamDto } from './dto/executor.dto';
import { SAFE_USER_SELECT } from '../common/selects/safe-user.select';

@Injectable()
export class ExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ---------------------------------------------------------------------
  // Admin: staff & team management
  // ---------------------------------------------------------------------

  async createTeam(dto: CreateTeamDto) {
    return this.prisma.team.create({ data: dto });
  }

  listTeams() {
    return this.prisma.team.findMany({
      include: { _count: { select: { members: true } } },
    });
  }

  async createStaff(dto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'کاربری با این شماره موبایل قبلاً ثبت شده است.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        fullName: dto.fullName,
        role: UserRole.executor,
        status: UserStatus.active,
      },
      select: SAFE_USER_SELECT,
    });

    await this.authService.ensureFinancialAccounts(user.id, UserRole.executor);

    const profile = await this.prisma.executorProfile.create({
      data: {
        userId: user.id,
        executorType: dto.executorType ?? ExecutorType.internal_staff,
        publicHandlerCode: generateReferenceCode('OPS'),
        displayAlias: dto.displayAlias,
        teamId: dto.teamId,
      },
    });

    return { user, profile };
  }

  listStaffForAdmin(params: {
    teamId?: string;
    status?: ExecutorStatus;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.executorProfile.findMany({
      where: {
        ...(params.teamId ? { teamId: params.teamId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        user: { select: { fullName: true, phone: true, status: true } },
        team: true,
        skills: { include: { skill: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async getProfileForAdmin(id: string) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true, phone: true, status: true } },
        team: true,
        skills: { include: { skill: true } },
        assignments: {
          include: {
            order: { select: { code: true, title: true, status: true } },
          },
        },
        performanceSnapshots: { orderBy: { periodEnd: 'desc' }, take: 12 },
      },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    return profile;
  }

  async setStatus(id: string, status: ExecutorStatus) {
    await this.getProfileForAdmin(id);
    return this.prisma.executorProfile.update({
      where: { id },
      data: { status },
    });
  }

  async setCapacity(id: string, capacityPercent: number) {
    await this.getProfileForAdmin(id);
    const status: ExecutorStatus | undefined =
      capacityPercent >= 100 ? 'over_capacity' : undefined;
    return this.prisma.executorProfile.update({
      where: { id },
      data: { capacityPercent, ...(status ? { status } : {}) },
    });
  }

  /**
   * محاسبه شاخص‌های عملکرد (سند v4 §۱۱.۳). برای MVP این نوبت به‌صورت
   * synchronous فراخوانی می‌شود؛ در فاز بعد باید job پس‌زمینه
   * `recalculate_staff_performance` این کار را دوره‌ای انجام دهد.
   */
  async recalculatePerformance(executorProfileId: string) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id: executorProfileId },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');

    const assignments = await this.prisma.orderAssignment.findMany({
      where: { executorProfileId },
      include: { order: true },
    });

    const completed = assignments.filter(
      (a) => a.order.status === OrderStatus.closed,
    );
    const active = assignments.filter(
      (a) => a.unassignedAt === null && a.order.status !== OrderStatus.closed,
    );

    const onTimeCount = completed.filter(
      (a) =>
        a.order.deliveredAt &&
        a.order.confirmedAt &&
        a.order.deliveredAt <= a.order.confirmedAt,
    ).length;

    const qcReviews = await this.prisma.qcReview.findMany({
      where: {
        order: { assignments: { some: { executorProfileId } } },
        result: { not: null },
      },
    });
    const qcPassed = qcReviews.filter((r) => r.result === 'passed').length;

    const feedback = await this.prisma.feedback.findMany({
      where: { targetType: 'executor', targetInternalId: executorProfileId },
    });
    const ratings = feedback
      .filter((f) => f.rating != null)
      .map((f) => f.rating as number);
    const avgRating = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;
    const complaints = feedback.filter(
      (f) => f.feedbackType === 'complaint',
    ).length;
    const compliments = feedback.filter(
      (f) => f.feedbackType === 'compliment',
    ).length;

    const onTimeRate = completed.length
      ? (onTimeCount / completed.length) * 100
      : 0;
    const qcPassRate = qcReviews.length
      ? (qcPassed / qcReviews.length) * 100
      : 0;
    const riskScore = Math.max(
      0,
      complaints * 10 - compliments * 2 - onTimeRate * 0.1,
    );

    await this.prisma.executorProfile.update({
      where: { id: executorProfileId },
      data: {
        qcPassRate,
        onTimeDeliveryRate: onTimeRate,
        customerRatingAvg: avgRating,
        complaintCount: complaints,
        complimentCount: compliments,
        riskScore,
      },
    });

    return this.prisma.staffPerformanceSnapshot.create({
      data: {
        executorProfileId,
        periodStart: new Date(new Date().setDate(1)),
        periodEnd: new Date(),
        completedOrders: completed.length,
        activeOrders: active.length,
        onTimeRate,
        qcPassRate,
        avgCustomerRating: avgRating,
        complaintCount: complaints,
        complimentCount: compliments,
        riskScore,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Executor self-service
  // ---------------------------------------------------------------------

  async acceptOrder(userId: string, orderId: string) {
    const profile = await this.getOwnProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.orderAssignment.findFirst({
        where: {
          orderId,
          executorProfileId: profile.id,
          unassignedAt: null,
        },
        include: {
          order: { include: { acceptanceCriteria: true } },
          executionChecklistItems: true,
        },
      });
      if (!assignment) {
        throw new ForbiddenException('این سفارش به شما ارجاع نشده است.');
      }
      if (assignment.order.status !== OrderStatus.assigned) {
        if (assignment.acceptedAt) return assignment;
        throw new BadRequestException('این سفارش در وضعیت پذیرش مجری نیست.');
      }

      if (!assignment.acceptedAt) {
        await tx.executionChecklistItem.createMany({
          data: assignment.order.acceptanceCriteria.map((criterion) => ({
            assignmentId: assignment.id,
            acceptanceCriterionId: criterion.id,
            label: criterion.description,
          })),
          skipDuplicates: true,
        });
        await tx.orderAssignment.update({
          where: { id: assignment.id },
          data: { acceptedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            actorRole: UserRole.executor,
            action: 'order.assignment_accepted',
            entityType: 'order',
            entityId: orderId,
            after: { assignmentId: assignment.id },
          },
        });
      }

      return tx.orderAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: { executionChecklistItems: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  async updateChecklistItem(
    userId: string,
    orderId: string,
    itemId: string,
    completed: boolean,
  ) {
    const profile = await this.getOwnProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.orderAssignment.findFirst({
        where: {
          orderId,
          executorProfileId: profile.id,
          unassignedAt: null,
        },
        include: { order: { select: { status: true } } },
      });
      if (!assignment) {
        throw new ForbiddenException('این سفارش به شما ارجاع نشده است.');
      }
      if (!assignment.acceptedAt) {
        throw new BadRequestException('ابتدا پذیرش سفارش را ثبت کنید.');
      }
      if (
        assignment.order.status !== OrderStatus.assigned &&
        assignment.order.status !== OrderStatus.in_progress
      ) {
        throw new BadRequestException('چک‌لیست در این وضعیت قابل تغییر نیست.');
      }
      const item = await tx.executionChecklistItem.findFirst({
        where: { id: itemId, assignmentId: assignment.id },
      });
      if (!item) throw new NotFoundException('آیتم چک‌لیست یافت نشد.');

      const updated = await tx.executionChecklistItem.update({
        where: { id: item.id },
        data: {
          isCompleted: completed,
          completedAt: completed ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          actorRole: UserRole.executor,
          action: 'order.execution_checklist_updated',
          entityType: 'order',
          entityId: orderId,
          after: { checklistItemId: item.id, completed },
        },
      });
      return updated;
    });
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { userId },
      include: { team: true, skills: { include: { skill: true } } },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    return profile;
  }

  async getOwnPerformance(userId: string) {
    const profile = await this.getOwnProfile(userId);
    const snapshots = await this.prisma.staffPerformanceSnapshot.findMany({
      where: { executorProfileId: profile.id },
      orderBy: { periodEnd: 'desc' },
      take: 6,
    });
    return {
      qcPassRate: profile.qcPassRate,
      onTimeDeliveryRate: profile.onTimeDeliveryRate,
      customerRatingAvg: profile.customerRatingAvg,
      complaintCount: profile.complaintCount,
      complimentCount: profile.complimentCount,
      history: snapshots,
    };
  }

  async getDashboard(userId: string) {
    const profile = await this.getOwnProfile(userId);
    const [activeOrders, dueSoon, needsRework, recentReports] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            assignments: {
              some: { executorProfileId: profile.id, unassignedAt: null },
            },
            status: { in: [OrderStatus.assigned, OrderStatus.in_progress] },
          },
        }),
        this.prisma.order.findMany({
          where: {
            assignments: {
              some: { executorProfileId: profile.id, unassignedAt: null },
            },
            status: { in: [OrderStatus.assigned, OrderStatus.in_progress] },
          },
          orderBy: { createdAt: 'asc' },
          take: 5,
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            urgency: true,
          },
        }),
        this.prisma.order.count({
          where: {
            assignments: {
              some: { executorProfileId: profile.id, unassignedAt: null },
            },
            status: OrderStatus.qc_rejected,
          },
        }),
        this.prisma.orderReport.findMany({
          where: { authorUserId: userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    return { profile, activeOrders, dueSoon, needsRework, recentReports };
  }
}
