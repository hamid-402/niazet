import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditSensitivity,
  CapabilityType,
  ExecutorStatus,
  ExecutorType,
  OrderStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import {
  AttendanceQueryDto,
  CreateSkillDto,
  CreateStaffDto,
  CreateTeamDto,
  UpdateStaffAccessDto,
  UpdateStaffProfileDto,
  UpdateStaffSkillsDto,
  UpsertAttendanceDto,
} from './dto/executor.dto';
import { SAFE_USER_SELECT } from '../common/selects/safe-user.select';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  calculateRiskScore,
  isAssignmentOnTime,
  rollingPeriod,
  round2,
} from './performance-metrics';
import { detectStaffRisks, type StaffRiskSeverity } from './staff-risk';

const RISK_LABELS = {
  over_capacity: 'ظرفیت تکمیل شده',
  burnout_risk: 'فشار کاری پایدار',
  sla_risk: 'ریسک سررسید SLA',
  quality_regression: 'افت معنادار کیفیت',
} as const;

const SEVERITY_RANK: Record<StaffRiskSeverity, number> = {
  warning: 1,
  high: 2,
  critical: 3,
};

@Injectable()
export class ExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ---------------------------------------------------------------------
  // Admin: staff & team management
  // ---------------------------------------------------------------------

  async createTeam(
    dto: CreateTeamDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const duplicate = await this.prisma.team.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('نام یا کد تیم قبلاً ثبت شده است.');
    }
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.team_created',
          entityType: 'team',
          entityId: team.id,
          after: { name: team.name, code: team.code },
          ipAddress,
        },
      });
      return team;
    });
  }

  listTeams() {
    return this.prisma.team.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createSkill(
    dto: CreateSkillDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const duplicate = await this.prisma.skill.findUnique({
      where: { name: dto.name },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('این مهارت قبلاً ثبت شده است.');
    }
    return this.prisma.$transaction(async (tx) => {
      const skill = await tx.skill.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.skill_created',
          entityType: 'skill',
          entityId: skill.id,
          after: { name: skill.name, category: skill.category },
          ipAddress,
        },
      });
      return skill;
    });
  }

  listSkills() {
    return this.prisma.skill.findMany({
      include: { _count: { select: { executorSkills: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createStaff(
    dto: CreateStaffDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'کاربری با این شماره موبایل قبلاً ثبت شده است.',
      );
    }
    await this.assertTeamExists(dto.teamId);

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

    const executorType = dto.executorType ?? ExecutorType.internal_staff;
    const profile = await this.prisma.$transaction(async (tx) => {
      const created = await tx.executorProfile.create({
        data: {
          userId: user.id,
          executorType,
          verificationStatus:
            executorType === ExecutorType.internal_staff
              ? 'approved'
              : 'pending',
          publicHandlerCode: generateReferenceCode('OPS'),
          displayAlias: dto.displayAlias,
          teamId: dto.teamId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.created',
          entityType: 'executor_profile',
          entityId: created.id,
          after: { userId: user.id, executorType, teamId: dto.teamId },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return created;
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
        riskAlerts: {
          where: { status: { not: 'cleared' } },
          orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }],
        },
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
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            status: true,
            capabilities: true,
          },
        },
        team: true,
        skills: { include: { skill: true } },
        assignments: {
          include: {
            order: { select: { code: true, title: true, status: true } },
          },
        },
        capacitySnapshots: { orderBy: { snapshotDate: 'desc' }, take: 31 },
        attendanceRecords: {
          orderBy: { workDate: 'desc' },
          take: 31,
          include: { recordedBy: { select: { fullName: true } } },
        },
        performanceSnapshots: { orderBy: { periodEnd: 'desc' }, take: 12 },
        riskAlerts: {
          where: { status: { not: 'cleared' } },
          orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }],
          include: { acknowledgedBy: { select: { fullName: true } } },
        },
        onboarding: true,
      },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    const [feedback, history] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { targetType: 'executor', targetInternalId: id },
        select: {
          id: true,
          code: true,
          rating: true,
          satisfactionPercent: true,
          feedbackType: true,
          comment: true,
          status: true,
          resolutionNote: true,
          resolvedAt: true,
          createdAt: true,
          order: { select: { id: true, code: true, title: true } },
          customer: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'executor_profile', entityId: id },
        select: {
          id: true,
          action: true,
          before: true,
          after: true,
          sensitivity: true,
          actorRole: true,
          createdAt: true,
          actor: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { ...profile, feedback, history };
  }

  async setStatus(
    id: string,
    status: ExecutorStatus,
    note: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.executorProfile.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('پروفایل مجری یافت نشد.');
      const result = await tx.executorProfile.update({
        where: { id },
        data: { status },
      });
      if (status === ExecutorStatus.blocked) {
        await tx.session.updateMany({
          where: { userId: before.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.status_changed',
          entityType: 'executor_profile',
          entityId: id,
          before: { status: before.status },
          after: { status, note, sessionsRevoked: status === 'blocked' },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return result;
    });
  }

  async setCapacity(
    id: string,
    capacityPercent: number,
    note: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.executorProfile.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('پروفایل مجری یافت نشد.');
      const autoManaged = ['active', 'over_capacity'].includes(before.status);
      const status = autoManaged
        ? capacityPercent >= 100
          ? ExecutorStatus.over_capacity
          : ExecutorStatus.active
        : before.status;
      const activeOrders = await tx.orderAssignment.count({
        where: {
          executorProfileId: id,
          unassignedAt: null,
          order: {
            status: { notIn: [OrderStatus.closed, OrderStatus.cancelled] },
          },
        },
      });
      const result = await tx.executorProfile.update({
        where: { id },
        data: { capacityPercent, status },
      });
      await tx.staffCapacitySnapshot.create({
        data: {
          executorProfileId: id,
          snapshotDate: new Date(),
          capacityPercent,
          activeOrders,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.capacity_changed',
          entityType: 'executor_profile',
          entityId: id,
          before: {
            capacityPercent: before.capacityPercent,
            status: before.status,
          },
          after: { capacityPercent, status, activeOrders, note },
          ipAddress,
        },
      });
      return result;
    });
    await this.refreshRiskAlerts(id, new Date());
    return result;
  }

  async updateProfile(
    id: string,
    dto: UpdateStaffProfileDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { note, ...changes } = dto;
    const hasChange = Object.values(changes).some(
      (value) => value !== undefined,
    );
    if (!hasChange) {
      throw new BadRequestException('تغییری برای ثبت ارسال نشده است.');
    }
    if (changes.teamId) await this.assertTeamExists(changes.teamId);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.executorProfile.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('پروفایل مجری یافت نشد.');
      const result = await tx.executorProfile.update({
        where: { id },
        data: changes,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.profile_changed',
          entityType: 'executor_profile',
          entityId: id,
          before: {
            displayAlias: before.displayAlias,
            teamId: before.teamId,
            executorType: before.executorType,
            verificationStatus: before.verificationStatus,
          },
          after: { ...changes, note },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return result;
    });
  }

  async updateSkills(
    id: string,
    dto: UpdateStaffSkillsDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id },
      include: { skills: true },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    const ids = dto.skills.map((item) => item.skillId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('هر مهارت فقط یک‌بار قابل انتخاب است.');
    }
    const existingSkills = ids.length
      ? await this.prisma.skill.count({ where: { id: { in: ids } } })
      : 0;
    if (existingSkills !== ids.length) {
      throw new BadRequestException('یک یا چند مهارت معتبر نیست.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.executorSkill.deleteMany({
        where: { executorProfileId: id },
      });
      if (dto.skills.length) {
        await tx.executorSkill.createMany({
          data: dto.skills.map((item) => ({
            executorProfileId: id,
            skillId: item.skillId,
            level: item.level,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.skills_changed',
          entityType: 'executor_profile',
          entityId: id,
          before: {
            skills: profile.skills.map((item) => ({
              skillId: item.skillId,
              level: item.level,
            })),
          },
          after: {
            skills: dto.skills.map((item) => ({
              skillId: item.skillId,
              level: item.level,
            })),
            note: dto.note,
          },
          ipAddress,
        },
      });
      return tx.executorProfile.findUniqueOrThrow({
        where: { id },
        include: { skills: { include: { skill: true } } },
      });
    });
  }

  async listAttendance(id: string, query: AttendanceQueryDto) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    const to = query.to
      ? this.parseWorkDate(query.to)
      : this.parseWorkDate(new Date().toISOString());
    const from = query.from
      ? this.parseWorkDate(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      from > to ||
      to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'بازه حضور باید معتبر و حداکثر ۳۶۶ روز باشد.',
      );
    }
    return this.prisma.staffAttendanceRecord.findMany({
      where: {
        executorProfileId: id,
        workDate: { gte: from, lte: to },
      },
      include: { recordedBy: { select: { fullName: true } } },
      orderBy: { workDate: 'desc' },
    });
  }

  async upsertAttendance(
    id: string,
    dto: UpsertAttendanceDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    const workDate = this.parseWorkDate(dto.workDate);
    const workDateIso = workDate.toISOString().slice(0, 10);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.staffAttendanceRecord.findUnique({
        where: {
          executorProfileId_workDate: {
            executorProfileId: id,
            workDate,
          },
        },
      });
      const result = await tx.staffAttendanceRecord.upsert({
        where: {
          executorProfileId_workDate: {
            executorProfileId: id,
            workDate,
          },
        },
        create: {
          executorProfileId: id,
          workDate,
          status: dto.status,
          note: dto.note,
          recordedByUserId: actor.id,
        },
        update: {
          status: dto.status,
          note: dto.note,
          recordedByUserId: actor.id,
        },
        include: { recordedBy: { select: { fullName: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.attendance_recorded',
          entityType: 'executor_profile',
          entityId: id,
          before: before
            ? {
                workDate: before.workDate.toISOString().slice(0, 10),
                status: before.status,
                note: before.note,
              }
            : undefined,
          after: {
            workDate: workDateIso,
            status: dto.status,
            note: dto.note,
            reason: dto.reason,
          },
          ipAddress,
        },
      });
      return result;
    });
  }

  async updateAccess(
    id: string,
    dto: UpdateStaffAccessDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id },
      include: { user: { include: { capabilities: true } } },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');
    const hadCustomerCapability = profile.user.capabilities.some(
      (item) => item.capability === CapabilityType.customer,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: profile.userId },
        data: { status: dto.userStatus },
      });
      if (dto.customerCapability) {
        await tx.userCapability.upsert({
          where: {
            userId_capability: {
              userId: profile.userId,
              capability: CapabilityType.customer,
            },
          },
          create: {
            userId: profile.userId,
            capability: CapabilityType.customer,
          },
          update: {},
        });
      } else {
        await tx.userCapability.deleteMany({
          where: {
            userId: profile.userId,
            capability: CapabilityType.customer,
          },
        });
      }
      await tx.session.updateMany({
        where: { userId: profile.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.access_changed',
          entityType: 'executor_profile',
          entityId: id,
          before: {
            userStatus: profile.user.status,
            customerCapability: hadCustomerCapability,
          },
          after: {
            userStatus: dto.userStatus,
            customerCapability: dto.customerCapability,
            note: dto.note,
            sessionsRevoked: true,
          },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: profile.userId },
        select: {
          id: true,
          fullName: true,
          phone: true,
          status: true,
          capabilities: true,
        },
      });
    });
  }

  private async assertTeamExists(teamId?: string | null) {
    if (!teamId) return;
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) throw new BadRequestException('تیم انتخاب‌شده معتبر نیست.');
  }

  private parseWorkDate(value: string) {
    const datePart = value.slice(0, 10);
    const parsed = new Date(`${datePart}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(datePart) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== datePart
    ) {
      throw new BadRequestException('تاریخ حضور معتبر نیست.');
    }
    return parsed;
  }

  async recalculatePerformance(executorProfileId: string, now = new Date()) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id: executorProfileId },
    });
    if (!profile) throw new NotFoundException('پروفایل مجری یافت نشد.');

    const { periodStart, periodEnd } = rollingPeriod(now);

    const assignments = await this.prisma.orderAssignment.findMany({
      where: {
        executorProfileId,
        OR: [
          {
            unassignedAt: null,
            order: {
              status: { notIn: [OrderStatus.closed, OrderStatus.cancelled] },
            },
          },
          { order: { closedAt: { gte: periodStart, lte: now } } },
        ],
      },
      include: {
        order: {
          include: {
            serviceLine: { select: { slaHours: true } },
            milestones: { select: { dueAt: true, deliveredAt: true } },
          },
        },
      },
    });

    const completed = assignments.filter(
      (assignment) => assignment.order.status === OrderStatus.closed,
    );
    const active = assignments.filter(
      (assignment) =>
        assignment.unassignedAt === null &&
        assignment.order.status !== OrderStatus.closed &&
        assignment.order.status !== OrderStatus.cancelled,
    );
    const deadlineResults = completed
      .map((assignment) => isAssignmentOnTime(assignment))
      .filter((value): value is boolean => value !== null);
    const onTimeCount = deadlineResults.filter(Boolean).length;

    const qcReviews = await this.prisma.qcReview.findMany({
      where: {
        order: { assignments: { some: { executorProfileId } } },
        result: { not: null },
        reviewedAt: { gte: periodStart, lte: now },
      },
      orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const firstQcByOrder = new Map<string, (typeof qcReviews)[number]>();
    for (const review of qcReviews) {
      if (!firstQcByOrder.has(review.orderId)) {
        firstQcByOrder.set(review.orderId, review);
      }
    }
    const firstQcReviews = [...firstQcByOrder.values()];
    const qcPassed = firstQcReviews.filter(
      (review) => review.result === 'passed',
    ).length;

    const feedback = await this.prisma.feedback.findMany({
      where: {
        targetType: 'executor',
        targetInternalId: executorProfileId,
        createdAt: { gte: periodStart, lte: now },
      },
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

    const onTimeRate = deadlineResults.length
      ? round2((onTimeCount / deadlineResults.length) * 100)
      : 0;
    const qcPassRate = firstQcReviews.length
      ? round2((qcPassed / firstQcReviews.length) * 100)
      : 0;
    const roundedRating = round2(avgRating);
    const riskScore = calculateRiskScore({
      onTimeRate,
      onTimeSamples: deadlineResults.length,
      qcPassRate,
      qcSamples: firstQcReviews.length,
      avgRating: roundedRating,
      ratingSamples: ratings.length,
      complaints,
      compliments,
    });

    const snapshot = await this.prisma.$transaction(async (tx) => {
      await tx.executorProfile.update({
        where: { id: executorProfileId },
        data: {
          qcPassRate,
          onTimeDeliveryRate: onTimeRate,
          customerRatingAvg: roundedRating,
          complaintCount: complaints,
          complimentCount: compliments,
          riskScore,
        },
      });

      return tx.staffPerformanceSnapshot.upsert({
        where: {
          executorProfileId_periodEnd: { executorProfileId, periodEnd },
        },
        update: {
          periodStart,
          completedOrders: completed.length,
          activeOrders: active.length,
          onTimeRate,
          qcPassRate,
          avgCustomerRating: roundedRating,
          complaintCount: complaints,
          complimentCount: compliments,
          riskScore,
        },
        create: {
          executorProfileId,
          periodStart,
          periodEnd,
          completedOrders: completed.length,
          activeOrders: active.length,
          onTimeRate,
          qcPassRate,
          avgCustomerRating: roundedRating,
          complaintCount: complaints,
          complimentCount: compliments,
          riskScore,
        },
      });
    });
    await this.refreshRiskAlerts(executorProfileId, now);
    return snapshot;
  }

  async acknowledgeRiskAlert(
    executorProfileId: string,
    alertId: string,
    note: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const alert = await tx.staffRiskAlert.findFirst({
        where: { id: alertId, executorProfileId },
      });
      if (!alert) throw new NotFoundException('هشدار عملکرد یافت نشد.');
      if (alert.status === 'cleared') {
        throw new BadRequestException(
          'این هشدار قبلاً به‌صورت خودکار رفع شده است.',
        );
      }
      if (alert.status === 'acknowledged') return alert;
      const updated = await tx.staffRiskAlert.update({
        where: { id: alert.id },
        data: {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedByUserId: actor.id,
          acknowledgementNote: note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'staff.risk_alert_acknowledged',
          entityType: 'executor_profile',
          entityId: executorProfileId,
          before: { alertId, status: alert.status },
          after: {
            alertId,
            status: updated.status,
            riskType: alert.riskType,
            note,
          },
          sensitivity: AuditSensitivity.sensitive,
          ipAddress,
        },
      });
      return updated;
    });
  }

  async refreshRiskAlerts(executorProfileId: string, now: Date) {
    const [profile, activeAssignments, snapshots] = await Promise.all([
      this.prisma.executorProfile.findUnique({
        where: { id: executorProfileId },
        select: { id: true, displayAlias: true, capacityPercent: true },
      }),
      this.prisma.orderAssignment.findMany({
        where: {
          executorProfileId,
          unassignedAt: null,
          order: {
            status: { notIn: [OrderStatus.closed, OrderStatus.cancelled] },
          },
        },
        include: {
          order: {
            include: {
              serviceLine: { select: { slaHours: true } },
              milestones: { select: { dueAt: true, deliveredAt: true } },
            },
          },
        },
      }),
      this.prisma.staffPerformanceSnapshot.findMany({
        where: { executorProfileId },
        orderBy: { periodEnd: 'desc' },
        take: 2,
        select: { qcPassRate: true, riskScore: true },
      }),
    ]);
    if (!profile) return [];

    const signals = detectStaffRisks({
      capacityPercent: profile.capacityPercent,
      activeAssignments,
      currentSnapshot: snapshots[0]
        ? {
            qcPassRate: Number(snapshots[0].qcPassRate),
            riskScore: Number(snapshots[0].riskScore),
          }
        : null,
      previousSnapshot: snapshots[1]
        ? {
            qcPassRate: Number(snapshots[1].qcPassRate),
            riskScore: Number(snapshots[1].riskScore),
          }
        : null,
      now,
    });

    return this.prisma.$transaction(async (tx) => {
      const [existingAlerts, opsAdmins] = await Promise.all([
        tx.staffRiskAlert.findMany({ where: { executorProfileId } }),
        tx.user.findMany({
          where: {
            role: UserRole.admin,
            status: 'active',
            adminScope: { in: ['ops_admin', 'super_admin'] },
          },
          select: { id: true },
        }),
      ]);

      for (const signal of signals) {
        const existing = existingAlerts.find(
          (alert) => alert.riskType === signal.riskType,
        );
        if (!signal.active) {
          if (existing && existing.status !== 'cleared') {
            await tx.staffRiskAlert.update({
              where: { id: existing.id },
              data: { status: 'cleared', clearedAt: now },
            });
            await tx.auditLog.create({
              data: {
                action: 'staff.risk_alert_cleared',
                entityType: 'executor_profile',
                entityId: executorProfileId,
                before: { alertId: existing.id, status: existing.status },
                after: {
                  alertId: existing.id,
                  riskType: signal.riskType,
                  status: 'cleared',
                },
              },
            });
          }
          continue;
        }

        const severityEscalated = Boolean(
          existing &&
          SEVERITY_RANK[signal.severity] > SEVERITY_RANK[existing.severity],
        );
        const newlyActivated = !existing || existing.status === 'cleared';
        const shouldNotify = newlyActivated || severityEscalated;
        const alert = existing
          ? await tx.staffRiskAlert.update({
              where: { id: existing.id },
              data: {
                severity: signal.severity,
                status:
                  newlyActivated || severityEscalated ? 'active' : undefined,
                evidence: signal.evidence,
                detectedAt: newlyActivated ? now : undefined,
                lastDetectedAt: now,
                clearedAt: null,
                acknowledgedAt: severityEscalated ? null : undefined,
                acknowledgedByUserId: severityEscalated ? null : undefined,
                acknowledgementNote: severityEscalated ? null : undefined,
              },
            })
          : await tx.staffRiskAlert.create({
              data: {
                executorProfileId,
                riskType: signal.riskType,
                severity: signal.severity,
                evidence: signal.evidence,
                detectedAt: now,
                lastDetectedAt: now,
              },
            });

        if (shouldNotify) {
          await tx.auditLog.create({
            data: {
              action: severityEscalated
                ? 'staff.risk_alert_escalated'
                : 'staff.risk_alert_activated',
              entityType: 'executor_profile',
              entityId: executorProfileId,
              before: existing
                ? {
                    alertId: existing.id,
                    status: existing.status,
                    severity: existing.severity,
                  }
                : undefined,
              after: {
                alertId: alert.id,
                riskType: signal.riskType,
                severity: signal.severity,
                evidence: signal.evidence,
              },
              sensitivity:
                signal.severity === 'critical'
                  ? AuditSensitivity.critical
                  : AuditSensitivity.sensitive,
            },
          });
          if (opsAdmins.length > 0) {
            await tx.notificationLog.createMany({
              data: opsAdmins.map((admin) => ({
                userId: admin.id,
                channel: 'in_app',
                eventType: `staff.risk.${signal.riskType}`,
                title: `هشدار ${RISK_LABELS[signal.riskType]}`,
                body: `${profile.displayAlias}: شواهد جدید در پروفایل عملیاتی ثبت شد.`,
                sentAt: now,
              })),
            });
          }
        }
      }

      return tx.staffRiskAlert.findMany({
        where: { executorProfileId, status: { not: 'cleared' } },
        orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }],
      });
    });
  }

  async recalculatePerformanceForAdmin(
    executorProfileId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const snapshot = await this.recalculatePerformance(executorProfileId);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'staff.performance_recalculated',
        entityType: 'executor_profile',
        entityId: executorProfileId,
        after: { snapshotId: snapshot.id, periodEnd: snapshot.periodEnd },
        ipAddress,
      },
    });
    return snapshot;
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
