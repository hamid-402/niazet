import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractDashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async customer(customerId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const groups = await tx.order.groupBy({
          by: ['status'],
          where: { customerId },
          _count: { _all: true },
        });
        const counts = Object.fromEntries(
          Object.values(OrderStatus).map((status) => [
            status,
            groups.find((g) => g.status === status)?._count._all ?? 0,
          ]),
        );
        const [wallet, held, unread, openTickets] = await Promise.all([
          tx.wallet.findUnique({
            where: { userId: customerId },
            select: { balance: true, currency: true },
          }),
          tx.escrowHold.aggregate({
            where: { order: { customerId } },
            _sum: { amount: true, releasedAmount: true, refundedAmount: true },
          }),
          tx.notificationLog.count({
            where: { userId: customerId, channel: 'in_app', readAt: null },
          }),
          tx.ticket.count({
            where: { customerId, status: { notIn: ['closed', 'resolved'] } },
          }),
        ]);
        return {
          counts,
          totalOrders: groups.reduce((n, g) => n + g._count._all, 0),
          pendingPayment: counts.pending_payment,
          awaitingQuoteAcceptance: counts.quoted,
          awaitingDeliveryConfirmation: counts.delivered,
          closedOrders: counts.closed,
          activeOrders: groups
            .filter((g) => !['closed', 'cancelled', 'draft'].includes(g.status))
            .reduce((n, g) => n + g._count._all, 0),
          wallet,
          heldAmount:
            (held._sum.amount ?? 0) -
            (held._sum.releasedAmount ?? 0) -
            (held._sum.refundedAmount ?? 0),
          unreadNotifications: unread,
          openTickets,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async global() {
    return this.prisma.$transaction(
      async (tx) => {
        const [roles, orders, tickets, payments] = await Promise.all([
          tx.user.groupBy({ by: ['role'], _count: { _all: true } }),
          tx.order.groupBy({ by: ['status'], _count: { _all: true } }),
          tx.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
          tx.payment.aggregate({
            where: { status: 'succeeded', currency: 'IRT' },
            _sum: { amount: true },
            _count: { id: true },
          }),
        ]);
        return {
          roles,
          orders,
          tickets,
          payments: {
            count: payments._count.id,
            amount: payments._sum.amount ?? 0,
            currency: 'IRT',
            meaning: 'successful customer payments, not revenue',
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async staffPerformance(id: string) {
    if (!(await this.prisma.executorProfile.count({ where: { id } })))
      throw new NotFoundException('پروفایل مجری یافت نشد.');
    const history = await this.prisma.staffPerformanceSnapshot.findMany({
      where: { executorProfileId: id },
      orderBy: { periodEnd: 'desc' },
      take: 12,
    });
    return {
      executorProfileId: id,
      latest: history[0] ?? null,
      history,
      readOnly: true,
      automaticAccessEffect: false,
    };
  }
  async supportReport(from: Date, to: Date) {
    const users = await this.prisma.user.findMany({
      where: { role: 'support' },
      select: { id: true, fullName: true },
      take: 500,
      orderBy: { id: 'asc' },
    });
    const date = { gte: from, lt: to };
    const rows = await Promise.all(
      users.map(async (user) => {
        const [assigned, resolved, replies, breachTickets] = await Promise.all([
          this.prisma.ticket.count({
            where: { assignedToUserId: user.id, createdAt: date },
          }),
          this.prisma.ticket.count({
            where: { assignedToUserId: user.id, resolvedAt: date },
          }),
          this.prisma.ticketMessage.count({
            where: {
              senderUserId: user.id,
              visibility: 'customer_visible',
              createdAt: date,
            },
          }),
          this.prisma.ticketSlaEvent.groupBy({
            by: ['ticketId'],
            where: {
              eventType: 'breach',
              occurredAt: date,
              ticket: { assignedToUserId: user.id },
            },
          }),
        ]);
        return {
          ...user,
          assigned,
          resolved,
          publicReplies: replies,
          uniqueBreachedTickets: breachTickets.length,
        };
      }),
    );
    return {
      from,
      to,
      attribution: 'current assignee, not fabricated historic assignee',
      rows,
      truncated: users.length === 500,
    };
  }
}
