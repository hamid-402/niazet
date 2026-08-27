import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageVisibility,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import {
  addBusinessHours,
  slaTargetHoursForPriority,
} from '../common/utils/business-hours';
import { AddTicketMessageDto, CreateTicketDto } from './dto/ticket.dto';
import { createVersionedOrderReport } from '../orders/domain/order-reports';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

const CANNED_REPLIES = [
  {
    id: 'need-more-information',
    title: 'درخواست اطلاعات تکمیلی',
    category: 'general',
    body: 'برای بررسی دقیق‌تر، لطفاً جزئیات و در صورت امکان تصویر یا فایل مرتبط را ارسال کنید.',
  },
  {
    id: 'under-review',
    title: 'در حال بررسی',
    category: 'general',
    body: 'درخواست شما در حال بررسی است و نتیجه از همین تیکت اطلاع‌رسانی خواهد شد.',
  },
  {
    id: 'payment-followup',
    title: 'پیگیری پرداخت',
    category: 'payment',
    body: 'وضعیت تراکنش در حال بررسی است. لطفاً کد پیگیری پرداخت و زمان تقریبی تراکنش را ارسال کنید.',
  },
] as const;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(customerId: string, dto: CreateTicketDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order || order.customerId !== customerId) {
        throw new ForbiddenException('این سفارش متعلق به شما نیست.');
      }
      if (dto.relatedPublicHandlerCode) {
        const handler = await this.prisma.orderPublicHandler.findFirst({
          where: {
            orderId: dto.orderId,
            publicHandlerCode: dto.relatedPublicHandlerCode,
            visibleToCustomer: true,
            activeTo: null,
          },
          select: { id: true },
        });
        if (!handler) {
          throw new ForbiddenException('کد مسئول برای این سفارش معتبر نیست.');
        }
      }
    }
    await this.assertCustomerAttachment(
      customerId,
      dto.orderId,
      dto.attachmentFileId,
    );

    const priority = dto.priority ?? 'normal';
    const holidaySetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'calendar.iran_holidays' },
    });
    const holidays = new Set(
      Array.isArray(holidaySetting?.value)
        ? holidaySetting.value.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    );
    const slaDueAt = addBusinessHours(
      new Date(),
      slaTargetHoursForPriority(priority),
      holidays,
    );

    const ticket = await this.prisma.ticket.create({
      data: {
        code: generateReferenceCode('TCK'),
        customerId,
        orderId: dto.orderId,
        category: dto.category,
        priority,
        subject: dto.subject,
        relatedPublicHandlerCode: dto.relatedPublicHandlerCode,
        slaDueAt,
        status: TicketStatus.open,
        messages: {
          create: {
            senderUserId: customerId,
            body: dto.message,
            attachmentFileId: dto.attachmentFileId,
            visibility: MessageVisibility.customer_visible,
          },
        },
      },
      include: { messages: true },
    });

    return ticket;
  }

  listForCustomer(customerId: string, status?: TicketStatus) {
    return this.prisma.ticket.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForCustomer(customerId: string, id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          where: { visibility: MessageVisibility.customer_visible },
          include: { attachment: true },
          orderBy: { createdAt: 'asc' },
        },
        order: { select: { code: true, title: true } },
      },
    });
    if (!ticket || ticket.customerId !== customerId) {
      throw new NotFoundException('تیکت یافت نشد.');
    }
    return ticket;
  }

  async addCustomerMessage(
    customerId: string,
    ticketId: string,
    dto: AddTicketMessageDto,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket || ticket.customerId !== customerId) {
      throw new NotFoundException('تیکت یافت نشد.');
    }
    await this.assertCustomerAttachment(
      customerId,
      ticket.orderId ?? undefined,
      dto.attachmentFileId,
    );
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: customerId,
        body: dto.body,
        attachmentFileId: dto.attachmentFileId,
        visibility: MessageVisibility.customer_visible,
      },
    });
    if (
      ticket.status === TicketStatus.resolved ||
      ticket.status === TicketStatus.waiting_internal
    ) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.waiting_internal },
      });
    }
    return message;
  }

  // ---------------------------------------------------------------------
  // Support
  // ---------------------------------------------------------------------

  listQueue(params: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assignedToUserId?: string;
  }) {
    return this.prisma.ticket.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.priority ? { priority: params.priority } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.assignedToUserId
          ? { assignedToUserId: params.assignedToUserId }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true } },
        order: { select: { code: true } },
      },
      orderBy: [{ priority: 'desc' }, { slaDueAt: 'asc' }],
    });
  }

  async findOneForSupport(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          include: { attachment: true },
          orderBy: { createdAt: 'asc' },
        },
        escalations: true,
        order: { select: { code: true, title: true, publicHandlers: true } },
        customer: { select: { fullName: true, phone: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد.');
    return ticket;
  }

  listCannedReplies() {
    return CANNED_REPLIES;
  }

  async assign(id: string, assignedToUserId: string, actor: AuthenticatedUser) {
    const ticket = await this.ensureExists(id);
    if (actor.role === UserRole.support && actor.id !== assignedToUserId) {
      throw new ForbiddenException(
        'پشتیبان فقط می‌تواند تیکت را برای خودش بردارد.',
      );
    }
    if (
      ticket.status === TicketStatus.resolved ||
      ticket.status === TicketStatus.closed
    ) {
      throw new BadRequestException('تیکت بسته یا حل‌شده قابل تخصیص نیست.');
    }
    const assignee = await this.prisma.user.findFirst({
      where: { id: assignedToUserId, role: UserRole.support, status: 'active' },
      select: { id: true },
    });
    if (!assignee) throw new BadRequestException('پشتیبان فعال یافت نشد.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: { assignedToUserId, status: TicketStatus.assigned },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'ticket.assigned',
          entityType: 'ticket',
          entityId: id,
          before: { assignedToUserId: ticket.assignedToUserId },
          after: { assignedToUserId },
        },
      });
      return updated;
    });
  }

  async reply(
    actor: AuthenticatedUser,
    ticketId: string,
    dto: AddTicketMessageDto,
  ) {
    const ticket = await this.ensureExists(ticketId);
    if (
      actor.role === UserRole.support &&
      ticket.assignedToUserId !== actor.id
    ) {
      throw new ForbiddenException(
        ticket.assignedToUserId
          ? 'این تیکت به پشتیبان دیگری تخصیص دارد.'
          : 'ابتدا تیکت را برای خودتان بردارید.',
      );
    }
    const visibility =
      dto.visibility === 'internal_only'
        ? MessageVisibility.internal_only
        : MessageVisibility.customer_visible;
    await this.assertSupportAttachment(
      actor.id,
      ticket.orderId ?? undefined,
      dto.attachmentFileId,
    );

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: actor.id,
        body: dto.body,
        attachmentFileId: dto.attachmentFileId,
        visibility,
      },
    });

    if (visibility === MessageVisibility.customer_visible) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.waiting_customer },
      });
      await this.notifications.notifyUser(
        ticket.customerId,
        'ticket.reply',
        'پاسخ جدید برای تیکت شما',
        `پشتیبانی به تیکت ${ticket.code} پاسخ داد.`,
      );
    }

    return message;
  }

  async escalate(ticketId: string, actor: AuthenticatedUser, reason: string) {
    const ticket = await this.ensureExists(ticketId);
    this.assertSupportCanAct(ticket, actor);
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.escalated },
    });
    await this.prisma.ticketSlaEvent.create({
      data: { ticketId, eventType: 'escalated' },
    });
    return this.prisma.ticketEscalation.create({
      data: { ticketId, escalatedByUserId: actor.id, reason },
    });
  }

  async resolve(ticketId: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new NotFoundException('تیکت یافت نشد.');
      this.assertSupportCanAct(ticket, actor);
      const resolved = await tx.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.resolved, resolvedAt: new Date() },
      });
      if (ticket.orderId) {
        await createVersionedOrderReport(tx, {
          orderId: ticket.orderId,
          authorUserId: actor.id,
          reportType: 'support',
          summary: `تیکت ${ticket.code} با موضوع «${ticket.subject}» حل شد.`,
          visibleToCustomer: true,
        });
      }
      return resolved;
    });
  }

  async close(ticketId: string, actor: AuthenticatedUser) {
    const ticket = await this.ensureExists(ticketId);
    this.assertSupportCanAct(ticket, actor);
    if (ticket.status !== TicketStatus.resolved) {
      throw new BadRequestException('فقط تیکت حل‌شده قابل بستن است.');
    }
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.closed, closedAt: new Date() },
    });
  }

  async supportDashboard(userId: string) {
    const now = new Date();
    const riskWindow = new Date(now.getTime() + 60 * 60 * 1000);
    const activeStatuses = [
      TicketStatus.open,
      TicketStatus.assigned,
      TicketStatus.waiting_internal,
      TicketStatus.waiting_customer,
      TicketStatus.escalated,
    ];
    const [unassigned, mine, slaAtRisk, breached, nextTickets] =
      await Promise.all([
        this.prisma.ticket.count({
          where: { assignedToUserId: null, status: { in: activeStatuses } },
        }),
        this.prisma.ticket.count({
          where: { assignedToUserId: userId, status: { in: activeStatuses } },
        }),
        this.prisma.ticket.count({
          where: {
            assignedToUserId: userId,
            status: { in: activeStatuses },
            slaDueAt: { gt: now, lte: riskWindow },
          },
        }),
        this.prisma.ticket.count({
          where: {
            assignedToUserId: userId,
            status: { in: activeStatuses },
            slaDueAt: { lt: now },
          },
        }),
        this.prisma.ticket.findMany({
          where: { assignedToUserId: userId, status: { in: activeStatuses } },
          include: { customer: { select: { fullName: true } } },
          orderBy: [{ slaDueAt: 'asc' }, { priority: 'desc' }],
          take: 5,
        }),
      ]);
    return { unassigned, mine, slaAtRisk, breached, nextTickets };
  }

  async supportPerformance(userId?: string) {
    const [totalReplied, resolved, slaBreaches] = await Promise.all([
      this.prisma.ticketMessage.count({
        where: {
          visibility: MessageVisibility.customer_visible,
          ...(userId ? { senderUserId: userId } : {}),
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: { in: [TicketStatus.resolved, TicketStatus.closed] },
          ...(userId ? { assignedToUserId: userId } : {}),
        },
      }),
      this.prisma.ticketSlaEvent.count({
        where: {
          eventType: 'breach',
          ...(userId ? { ticket: { assignedToUserId: userId } } : {}),
        },
      }),
    ]);
    return { totalReplied, resolved, slaBreaches };
  }

  private async ensureExists(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد.');
    return ticket;
  }

  private assertSupportCanAct(
    ticket: { assignedToUserId: string | null },
    actor: AuthenticatedUser,
  ) {
    if (
      actor.role === UserRole.support &&
      ticket.assignedToUserId !== actor.id
    ) {
      throw new ForbiddenException(
        ticket.assignedToUserId
          ? 'این تیکت به پشتیبان دیگری تخصیص دارد.'
          : 'ابتدا تیکت را برای خودتان بردارید.',
      );
    }
  }

  private async assertCustomerAttachment(
    customerId: string,
    orderId: string | undefined,
    attachmentFileId: string | undefined,
  ) {
    if (!attachmentFileId) return;
    if (!orderId) {
      throw new ForbiddenException('پیوست تیکت باید به یک سفارش مرتبط باشد.');
    }
    const attachment = await this.prisma.orderFile.findFirst({
      where: {
        id: attachmentFileId,
        orderId,
        uploadedByUserId: customerId,
        fileKind: 'ticket_attachment',
        scanStatus: 'clean',
      },
      select: { id: true },
    });
    if (!attachment) {
      throw new ForbiddenException('پیوست تیکت معتبر یا متعلق به شما نیست.');
    }
  }

  private async assertSupportAttachment(
    supportUserId: string,
    orderId: string | undefined,
    attachmentFileId: string | undefined,
  ) {
    if (!attachmentFileId) return;
    if (!orderId) {
      throw new ForbiddenException('پیوست پاسخ باید به یک سفارش مرتبط باشد.');
    }
    const attachment = await this.prisma.orderFile.findFirst({
      where: {
        id: attachmentFileId,
        orderId,
        uploadedByUserId: supportUserId,
        fileKind: 'ticket_attachment',
        scanStatus: 'clean',
      },
      select: { id: true },
    });
    if (!attachment) {
      throw new ForbiddenException('پیوست پاسخ معتبر یا متعلق به شما نیست.');
    }
  }

  /** برای job پس‌زمینه `escalate_overdue_tickets` (سند v4 §۲۳). */
  async flagOverdueTickets() {
    const overdue = await this.prisma.ticket.findMany({
      where: {
        slaDueAt: { lt: new Date() },
        status: {
          notIn: [
            TicketStatus.resolved,
            TicketStatus.closed,
            TicketStatus.escalated,
          ],
        },
      },
    });

    for (const ticket of overdue) {
      await this.prisma.ticketSlaEvent.create({
        data: { ticketId: ticket.id, eventType: 'breach' },
      });
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { priority: 'urgent' },
      });
    }

    return overdue.length;
  }
}
