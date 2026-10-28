import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  activeSubscription,
  requireMembership,
  subscriptionIsActive,
} from './organization-policy';
import type {
  ActivateOrganizationPlanDto,
  AttachOrganizationOrderDto,
  CancelOrganizationPlanDto,
  CreateOrganizationPlanDto,
  EditOrganizationMemberDto,
  InviteOrganizationDto,
} from './organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${id} FOR UPDATE`;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    id: string,
    action: string,
    after: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        actorRole: actor.role,
        entityType: 'organization',
        entityId: id,
        action,
        after,
        sensitivity: 'sensitive',
      },
    });
  }
  private async team(
    tx: Prisma.TransactionClient,
    orgId: string,
    teamId?: string | null,
  ) {
    if (
      teamId &&
      !(await tx.organizationTeam.findFirst({
        where: { id: teamId, organizationId: orgId },
      }))
    )
      throw new BadRequestException('تیم متعلق به این سازمان نیست.');
  }
  list(userId: string) {
    return this.prisma.organizationMember.findMany({
      where: { userId, status: { in: ['active', 'invited'] } },
      select: {
        id: true,
        role: true,
        status: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  plans(includeInactive = false) {
    return this.prisma.organizationPlan.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { feeToman: 'asc' },
      take: 100,
    });
  }
  async create(name: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;
      if (
        (await tx.organizationMember.count({
          where: { userId: actor.id, role: 'owner', status: 'active' },
        })) >= 25
      )
        throw new BadRequestException(
          'سقف ایجاد سازمان برای این حساب تکمیل شده است.',
        );
      const org = await tx.organization.create({
        data: {
          name: name.trim(),
          members: {
            create: { userId: actor.id, role: 'owner', status: 'active' },
          },
        },
      });
      await this.audit(tx, actor, org.id, 'organization.created', {
        ownerId: actor.id,
      });
      return org;
    });
  }
  async detail(id: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const membership = await requireMembership(tx, id, actor.id);
        const org = await tx.organization.findUniqueOrThrow({
          where: { id },
          include: {
            teams: { orderBy: { name: 'asc' }, take: 100 },
            requestedPlan: { select: { id: true, name: true } },
            subscription: true,
          },
        });
        const members = await tx.organizationMember.findMany({
          where: {
            organizationId: id,
            status: { not: 'revoked' },
            ...(membership.role === 'member'
              ? {
                  OR: [
                    { userId: actor.id },
                    ...(membership.teamId
                      ? [{ teamId: membership.teamId }]
                      : []),
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            role: true,
            status: true,
            teamId: true,
            user: { select: { fullName: true } },
          },
          take: 1000,
          orderBy: { createdAt: 'asc' },
        });
        const sub = org.subscription;
        const usedOrders = sub
          ? await tx.order.count({
              where: {
                organizationId: id,
                organizationAttachedAt: { gte: sub.startsAt, lt: sub.endsAt },
              },
            })
          : 0;
        return {
          id: org.id,
          name: org.name,
          membership: {
            id: membership.id,
            role: membership.role,
            teamId: membership.teamId,
          },
          teams: org.teams,
          members,
          requestedPlan: org.requestedPlan,
          subscription: sub
            ? {
                planName: sub.planName,
                startsAt: sub.startsAt,
                endsAt: sub.endsAt,
                seats: sub.seats,
                ordersPerPeriod: sub.ordersPerPeriod,
                active: subscriptionIsActive(sub),
                version: sub.version,
              }
            : null,
          usedOrders,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async invite(
    id: string,
    dto: InviteOrganizationDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await requireMembership(tx, id, actor.id, ['owner']);
      const sub = await activeSubscription(tx, id);
      await this.team(tx, id, dto.teamId);
      const user = await tx.user.findFirst({
        where: {
          phone: dto.phone.trim(),
          status: 'active',
          OR: [
            { role: 'customer' },
            { capabilities: { some: { capability: 'customer' } } },
          ],
        },
        select: { id: true },
      });
      if (!user)
        throw new BadRequestException(
          'دعوت انجام نشد؛ گیرنده باید حساب فعال با دسترسی مشتری داشته باشد.',
        );
      const old = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: id, userId: user.id },
        },
      });
      if (old && old.status !== 'revoked')
        throw new ConflictException('این عضویت یا دعوت از قبل وجود دارد.');
      if (
        (await tx.organizationMember.count({
          where: { organizationId: id, status: { in: ['active', 'invited'] } },
        })) >= sub.seats
      )
        throw new BadRequestException(
          'ظرفیت اعضای پلن تکمیل است؛ دعوت‌های باز هم یک جایگاه مصرف می‌کنند.',
        );
      const member = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId: id, userId: user.id },
        },
        create: {
          organizationId: id,
          userId: user.id,
          role: dto.role,
          teamId: dto.teamId,
        },
        update: {
          role: dto.role,
          status: 'invited',
          teamId: dto.teamId ?? null,
        },
      });
      await this.notifications.notifyUser(
        user.id,
        'organization.invited',
        'دعوت به سازمان',
        'دعوت تازه‌ای دارید؛ برای پذیرش یا رد به بخش سازمان‌ها بروید.',
        tx,
      );
      await this.audit(tx, actor, id, 'organization.invited', {
        memberId: member.id,
        role: dto.role,
      });
      return { id: member.id, status: member.status };
    });
  }
  async respond(
    invitationId: string,
    accept: boolean,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.organizationMember.findFirst({
        where: { id: invitationId, userId: actor.id, status: 'invited' },
      });
      if (!invite) throw new NotFoundException('دعوت قابل اقدام پیدا نشد.');
      await this.lock(tx, invite.organizationId);
      if (accept) await activeSubscription(tx, invite.organizationId);
      const changed = await tx.organizationMember.updateMany({
        where: { id: invite.id, userId: actor.id, status: 'invited' },
        data: { status: accept ? 'active' : 'revoked' },
      });
      if (changed.count !== 1)
        throw new ConflictException('این دعوت قبلاً تعیین تکلیف شده است.');
      await this.audit(
        tx,
        actor,
        invite.organizationId,
        'organization.invitation_responded',
        { memberId: invite.id, accepted: accept },
      );
      return { status: accept ? 'active' : 'revoked' };
    });
  }
  async createTeam(id: string, name: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await requireMembership(tx, id, actor.id, ['owner', 'manager']);
      await activeSubscription(tx, id);
      if (
        (await tx.organizationTeam.count({ where: { organizationId: id } })) >=
        100
      )
        throw new BadRequestException('سقف تیم‌های این سازمان تکمیل است.');
      if (
        await tx.organizationTeam.findFirst({
          where: { organizationId: id, name: name.trim() },
        })
      )
        throw new ConflictException('نام تیم تکراری است.');
      const team = await tx.organizationTeam.create({
        data: { organizationId: id, name: name.trim() },
      });
      await this.audit(tx, actor, id, 'organization.team_created', {
        teamId: team.id,
      });
      return team;
    });
  }
  async editMember(
    id: string,
    memberId: string,
    dto: EditOrganizationMemberDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await requireMembership(tx, id, actor.id, ['owner']);
      await this.team(tx, id, dto.teamId);
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: id },
      });
      if (!member) throw new NotFoundException('عضو پیدا نشد.');
      if (member.role === 'owner')
        throw new BadRequestException(
          'ابتدا مالکیت را به عضو فعال دیگری منتقل کنید.',
        );
      if (dto.status === 'active' && member.status !== 'active')
        throw new BadRequestException(
          'فعال‌سازی عضویت فقط با پذیرش دعوت توسط خود کاربر انجام می‌شود.',
        );
      const updated = await tx.organizationMember.update({
        where: { id: memberId },
        data: {
          role: dto.role,
          status: dto.status,
          ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        },
      });
      await this.audit(tx, actor, id, 'organization.member_changed', {
        memberId,
        role: dto.role,
        status: dto.status,
        teamId: dto.teamId ?? null,
        note: dto.note,
      });
      return { id: updated.id, status: updated.status };
    });
  }
  async transfer(
    id: string,
    memberId: string,
    note: string,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const owner = await requireMembership(tx, id, actor.id, ['owner']);
      const target = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: id, status: 'active' },
      });
      if (!target || target.id === owner.id)
        throw new BadRequestException('عضو فعال دیگری را انتخاب کنید.');
      await tx.organizationMember.update({
        where: { id: owner.id },
        data: { role: 'manager' },
      });
      await tx.organizationMember.update({
        where: { id: target.id },
        data: { role: 'owner' },
      });
      await this.audit(tx, actor, id, 'organization.owner_transferred', {
        fromMemberId: owner.id,
        toMemberId: target.id,
        note,
      });
      return { transferred: true };
    });
  }
  async requestPlan(id: string, planId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      await requireMembership(tx, id, actor.id, ['owner']);
      if (
        !(await tx.organizationPlan.findFirst({
          where: { id: planId, active: true },
        }))
      )
        throw new NotFoundException('پلن فعال پیدا نشد.');
      await tx.organization.update({
        where: { id },
        data: { requestedPlanId: planId },
      });
      await this.audit(tx, actor, id, 'organization.plan_requested', {
        planId,
      });
      return { requested: true };
    });
  }
  async orders(id: string, actor: AuthenticatedUser, skip = 0, take = 20) {
    return this.prisma.$transaction(async (tx) => {
      const member = await requireMembership(tx, id, actor.id);
      const where: Prisma.OrderWhereInput = {
        organizationId: id,
        ...(member.role === 'member'
          ? {
              OR: [
                { customerId: actor.id },
                ...(member.teamId
                  ? [{ organizationTeamId: member.teamId }]
                  : []),
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        tx.order.findMany({
          where,
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            createdAt: true,
            organizationTeamId: true,
          },
          skip,
          take,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        tx.order.count({ where }),
      ]);
      return { items, total };
    });
  }
  async attach(
    id: string,
    dto: AttachOrganizationOrderDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const member = await requireMembership(tx, id, actor.id);
      const sub = await activeSubscription(tx, id);
      await this.team(tx, id, dto.teamId);
      if (member.role === 'member' && (dto.teamId ?? null) !== member.teamId)
        throw new ForbiddenException('فقط تیم خودتان قابل انتخاب است.');
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${dto.orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: dto.orderId, customerId: actor.id },
      });
      if (!order)
        throw new NotFoundException('پیش‌نویس متعلق به شما پیدا نشد.');
      if (
        order.status !== 'draft' ||
        order.organizationId ||
        order.version !== dto.version
      )
        throw new ConflictException(
          'فقط پیش‌نویس شخصیِ تازه و بدون سازمان قابل افزودن است.',
        );
      if (
        (await tx.order.count({
          where: {
            organizationId: id,
            organizationAttachedAt: { gte: sub.startsAt, lt: sub.endsAt },
          },
        })) >= sub.ordersPerPeriod
      )
        throw new BadRequestException('سهمیه سفارش این دوره تکمیل شده است.');
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          organizationId: id,
          organizationTeamId: dto.teamId ?? null,
          organizationAttachedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit(tx, actor, id, 'organization.order_attached', {
        orderId: order.id,
        teamId: dto.teamId ?? null,
        note: dto.note,
      });
      return { id: updated.id, version: updated.version };
    });
  }
  async adminList(skip = 0, take = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          requestedPlan: true,
          subscription: true,
          _count: { select: { members: true, orders: true } },
        },
      }),
      this.prisma.organization.count(),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        subscription: item.subscription
          ? {
              ...item.subscription,
              active: subscriptionIsActive(item.subscription),
            }
          : null,
      })),
      total,
    };
  }
  async createPlan(dto: CreateOrganizationPlanDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.organizationPlan.create({ data: dto });
      await this.audit(tx, actor, plan.id, 'organization.plan_created', {
        ...dto,
      });
      return plan;
    });
  }
  async setPlanActive(id: string, active: boolean, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.organizationPlan.findUnique({ where: { id } })))
        throw new NotFoundException('پلن پیدا نشد.');
      const plan = await tx.organizationPlan.update({
        where: { id },
        data: { active },
      });
      await this.audit(
        tx,
        actor,
        id,
        'organization.plan_availability_changed',
        { active },
      );
      return plan;
    });
  }
  async activate(
    id: string,
    dto: ActivateOrganizationPlanDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      if (!(await tx.organization.findUnique({ where: { id } })))
        throw new NotFoundException('سازمان پیدا نشد.');
      const before = await tx.organizationSubscription.findUnique({
        where: { organizationId: id },
      });
      if ((before?.version ?? 0) !== dto.version)
        throw new ConflictException('اشتراک هم‌زمان تغییر کرده است.');
      if (subscriptionIsActive(before))
        throw new ConflictException(
          'برای تغییر دوره فعال، ابتدا لغو مستند ثبت کنید یا تا پایان دوره صبر کنید.',
        );
      const plan = await tx.organizationPlan.findFirst({
        where: { id: dto.planId, active: true },
      });
      if (!plan) throw new NotFoundException('پلن فعال پیدا نشد.');
      if (
        (await tx.organizationMember.count({
          where: { organizationId: id, status: { in: ['active', 'invited'] } },
        })) > plan.seats
      )
        throw new BadRequestException(
          'ظرفیت پلن از تعداد اعضا و دعوت‌های باز کمتر است.',
        );
      const startsAt = new Date();
      const endsAt = new Date(
        startsAt.getTime() + plan.durationDays * 86400000,
      );
      const data = {
        planId: plan.id,
        planName: plan.name,
        seats: plan.seats,
        ordersPerPeriod: plan.ordersPerPeriod,
        feeToman: plan.feeToman,
        startsAt,
        endsAt,
        status: 'active',
        contractReference: dto.contractReference,
        version: dto.version + 1,
      };
      const sub = await tx.organizationSubscription.upsert({
        where: { organizationId: id },
        create: { organizationId: id, ...data },
        update: data,
      });
      await tx.organization.update({
        where: { id },
        data: { requestedPlanId: null },
      });
      await this.audit(tx, actor, id, 'organization.subscription_activated', {
        ...data,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        note: dto.note,
      });
      return sub;
    });
  }
  async cancel(
    id: string,
    dto: CancelOrganizationPlanDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const changed = await tx.organizationSubscription.updateMany({
        where: { organizationId: id, version: dto.version, status: 'active' },
        data: { status: 'cancelled', version: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException('اشتراک فعال تغییر کرده یا وجود ندارد.');
      await this.audit(tx, actor, id, 'organization.subscription_cancelled', {
        version: dto.version + 1,
        note: dto.note,
      });
      return { cancelled: true };
    });
  }
}
