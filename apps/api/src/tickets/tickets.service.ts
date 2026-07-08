import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageVisibility, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import { addBusinessHours, slaTargetHoursForPriority } from '../common/utils/business-hours';
import { AddTicketMessageDto, CreateTicketDto } from './dto/ticket.dto';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(customerId: string, dto: CreateTicketDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order || order.customerId !== customerId) {
        throw new ForbiddenException('این سفارش متعلق به شما نیست.');
      }
    }

    const priority = dto.priority ?? 'normal';
    const slaDueAt = addBusinessHours(new Date(), slaTargetHoursForPriority(priority));

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
        messages: { where: { visibility: MessageVisibility.customer_visible }, orderBy: { createdAt: 'asc' } },
        order: { select: { code: true, title: true } },
      },
    });
    if (!ticket || ticket.customerId !== customerId) {
      throw new NotFoundException('تیکت یافت نشد.');
    }
    return ticket;
  }

  async addCustomerMessage(customerId: string, ticketId: string, dto: AddTicketMessageDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.customerId !== customerId) {
      throw new NotFoundException('تیکت یافت نشد.');
    }
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: customerId,
        body: dto.body,
        attachmentFileId: dto.attachmentFileId,
        visibility: MessageVisibility.customer_visible,
      },
    });
    if (ticket.status === TicketStatus.resolved || ticket.status === TicketStatus.waiting_internal) {
      await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.waiting_internal } });
    }
    return message;
  }

  // ---------------------------------------------------------------------
  // Support
  // ---------------------------------------------------------------------

  listQueue(params: {
    status?: TicketStatus;
    priority?: string;
    category?: string;
    assignedToUserId?: string;
  }) {
    return this.prisma.ticket.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.priority ? { priority: params.priority as any } : {}),
        ...(params.category ? { category: params.category as any } : {}),
        ...(params.assignedToUserId ? { assignedToUserId: params.assignedToUserId } : {}),
      },
      include: { customer: { select: { fullName: true, phone: true } }, order: { select: { code: true } } },
      orderBy: [{ priority: 'desc' }, { slaDueAt: 'asc' }],
    });
  }

  async findOneForSupport(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        escalations: true,
        order: { select: { code: true, title: true, publicHandlers: true } },
        customer: { select: { fullName: true, phone: true } },
      },
    });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد.');
    return ticket;
  }

  async assign(id: string, assignedToUserId: string) {
    await this.ensureExists(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { assignedToUserId, status: TicketStatus.assigned },
    });
  }

  async reply(supportUserId: string, ticketId: string, dto: AddTicketMessageDto) {
    const ticket = await this.ensureExists(ticketId);
    const visibility = dto.visibility === 'internal_only' ? MessageVisibility.internal_only : MessageVisibility.customer_visible;

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: supportUserId,
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

  async escalate(ticketId: string, escalatedByUserId: string, reason: string) {
    await this.ensureExists(ticketId);
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.escalated } });
    await this.prisma.ticketSlaEvent.create({ data: { ticketId, eventType: 'escalated' } });
    return this.prisma.ticketEscalation.create({ data: { ticketId, escalatedByUserId, reason } });
  }

  async resolve(ticketId: string) {
    await this.ensureExists(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.resolved, resolvedAt: new Date() },
    });
  }

  async close(ticketId: string) {
    await this.ensureExists(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.closed, closedAt: new Date() },
    });
  }

  async supportPerformance() {
    const [totalReplied, resolved, slaBreaches] = await Promise.all([
      this.prisma.ticketMessage.count({ where: { visibility: MessageVisibility.customer_visible } }),
      this.prisma.ticket.count({ where: { status: { in: [TicketStatus.resolved, TicketStatus.closed] } } }),
      this.prisma.ticketSlaEvent.count({ where: { eventType: 'breach' } }),
    ]);
    return { totalReplied, resolved, slaBreaches };
  }

  private async ensureExists(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('تیکت یافت نشد.');
    return ticket;
  }

  /** برای job پس‌زمینه `escalate_overdue_tickets` (سند v4 §۲۳). */
  async flagOverdueTickets() {
    const overdue = await this.prisma.ticket.findMany({
      where: {
        slaDueAt: { lt: new Date() },
        status: { notIn: [TicketStatus.resolved, TicketStatus.closed, TicketStatus.escalated] },
      },
    });

    for (const ticket of overdue) {
      await this.prisma.ticketSlaEvent.create({ data: { ticketId: ticket.id, eventType: 'breach' } });
      await this.prisma.ticket.update({ where: { id: ticket.id }, data: { priority: 'urgent' } });
    }

    return overdue.length;
  }
}
