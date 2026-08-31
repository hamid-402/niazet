import { Injectable } from '@nestjs/common';
import {
  FeedbackType,
  LedgerReferenceType,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportQueryDto } from './dto/report-query.dto';
import {
  average,
  buildDailySeries,
  median,
  percentage,
  resolveReportRange,
} from './reporting-metrics';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.assigned,
  OrderStatus.in_progress,
  OrderStatus.submitted_for_qc,
  OrderStatus.qc_in_review,
  OrderStatus.qc_rejected,
  OrderStatus.ready_for_customer_review,
  OrderStatus.delivered,
  OrderStatus.revision_requested,
];

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async operations(query: ReportQueryDto) {
    const range = resolveReportRange(query.from, query.to);
    const dateWhere = { gte: range.start, lt: range.end };
    const [orders, reviews, feedback, tickets, slaEvents, staff] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { createdAt: dateWhere },
          select: {
            id: true,
            status: true,
            createdAt: true,
            submittedAt: true,
            quotedAt: true,
            paidAt: true,
            assignedAt: true,
            deliveredAt: true,
            closedAt: true,
            serviceLine: { select: { id: true, title: true } },
          },
        }),
        this.prisma.qcReview.findMany({
          where: { createdAt: dateWhere, result: { not: null } },
          select: {
            orderId: true,
            result: true,
            reviewedAt: true,
            createdAt: true,
          },
          orderBy: [{ reviewedAt: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.feedback.findMany({
          where: { createdAt: dateWhere },
          select: {
            rating: true,
            satisfactionPercent: true,
            feedbackType: true,
          },
        }),
        this.prisma.ticket.findMany({
          where: { createdAt: dateWhere },
          select: { id: true },
        }),
        this.prisma.ticketSlaEvent.findMany({
          where: {
            eventType: 'breach',
            ticket: { createdAt: dateWhere },
          },
          select: { ticketId: true },
        }),
        this.prisma.executorProfile.findMany({
          select: {
            id: true,
            displayAlias: true,
            publicHandlerCode: true,
            status: true,
            capacityPercent: true,
            qcPassRate: true,
            onTimeDeliveryRate: true,
            customerRatingAvg: true,
            complaintCount: true,
            complimentCount: true,
            team: { select: { id: true, name: true } },
            assignments: {
              where: { unassignedAt: null },
              select: { order: { select: { status: true } } },
            },
            riskAlerts: {
              where: { status: { not: 'cleared' } },
              select: { id: true },
            },
          },
          orderBy: { displayAlias: 'asc' },
        }),
      ]);

    const byStatus = orders.reduce<Record<string, number>>((result, order) => {
      result[order.status] = (result[order.status] ?? 0) + 1;
      return result;
    }, {});
    const serviceMap = new Map<
      string,
      {
        serviceId: string;
        title: string;
        orders: number;
        paid: number;
        closed: number;
      }
    >();
    for (const order of orders) {
      const current = serviceMap.get(order.serviceLine.id) ?? {
        serviceId: order.serviceLine.id,
        title: order.serviceLine.title,
        orders: 0,
        paid: 0,
        closed: 0,
      };
      current.orders += 1;
      if (order.paidAt) current.paid += 1;
      if (order.closedAt) current.closed += 1;
      serviceMap.set(order.serviceLine.id, current);
    }

    const firstReviews = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      if (!firstReviews.has(review.orderId))
        firstReviews.set(review.orderId, review);
    }
    const firstReviewRows = [...firstReviews.values()];
    const resultCount = (value: string, source = reviews) =>
      source.filter((review) => review.result === value).length;
    const breachedTicketCount = new Set(
      slaEvents.map((event) => event.ticketId),
    ).size;
    const deliveryHours = orders
      .filter(
        (order) =>
          order.assignedAt &&
          order.deliveredAt &&
          order.deliveredAt >= order.assignedAt,
      )
      .map(
        (order) =>
          (order.deliveredAt!.getTime() - order.assignedAt!.getTime()) /
          3_600_000,
      );
    const activeCount = (assignments: (typeof staff)[number]['assignments']) =>
      assignments.filter((assignment) =>
        ACTIVE_ORDER_STATUSES.includes(assignment.order.status),
      ).length;

    const staffRows = staff.map((profile) => ({
      profileId: profile.id,
      displayAlias: profile.displayAlias,
      publicHandlerCode: profile.publicHandlerCode,
      team: profile.team,
      status: profile.status,
      capacityPercent: profile.capacityPercent,
      activeOrders: activeCount(profile.assignments),
      onTimeRate: Number(profile.onTimeDeliveryRate),
      qcPassRate: Number(profile.qcPassRate),
      customerRating: Number(profile.customerRatingAvg),
      complaintCount: profile.complaintCount,
      complimentCount: profile.complimentCount,
      openRiskAlerts: profile.riskAlerts.length,
    }));
    const teamMap = new Map<string, typeof staffRows>();
    for (const row of staffRows) {
      const key = row.team?.id ?? 'unassigned';
      teamMap.set(key, [...(teamMap.get(key) ?? []), row]);
    }

    const funnel = {
      created: orders.length,
      submitted: orders.filter((order) => order.submittedAt).length,
      quoted: orders.filter((order) => order.quotedAt).length,
      paid: orders.filter((order) => order.paidAt).length,
      assigned: orders.filter((order) => order.assignedAt).length,
      closed: orders.filter((order) => order.closedAt).length,
    };
    return {
      period: range.period,
      orders: { total: orders.length, byStatus },
      funnel: {
        ...funnel,
        submittedToPaidRate: percentage(funnel.paid, funnel.submitted),
        paidToClosedRate: percentage(funnel.closed, funnel.paid),
        createdToClosedRate: percentage(funnel.closed, funnel.created),
      },
      serviceSales: [...serviceMap.values()]
        .map((service) => ({
          ...service,
          paidRate: percentage(service.paid, service.orders),
        }))
        .sort((a, b) => b.orders - a.orders),
      quality: {
        reviews: reviews.length,
        passed: resultCount('passed'),
        needsRework: resultCount('needs_rework'),
        rejected: resultCount('rejected'),
        passRate: percentage(resultCount('passed'), reviews.length),
        firstPassRate: percentage(
          resultCount('passed', firstReviewRows),
          firstReviewRows.length,
        ),
      },
      sla: {
        tickets: tickets.length,
        breachedTickets: breachedTicketCount,
        breachRate: percentage(breachedTicketCount, tickets.length),
      },
      satisfaction: {
        responses: feedback.length,
        averageRating: average(
          feedback.flatMap((item) =>
            item.rating == null ? [] : [item.rating],
          ),
        ),
        averagePercent: average(
          feedback.flatMap((item) =>
            item.satisfactionPercent == null ? [] : [item.satisfactionPercent],
          ),
        ),
        complaints: feedback.filter(
          (item) => item.feedbackType === FeedbackType.complaint,
        ).length,
        compliments: feedback.filter(
          (item) => item.feedbackType === FeedbackType.compliment,
        ).length,
      },
      delivery: {
        samples: deliveryHours.length,
        averageHours: average(deliveryHours),
        medianHours: median(deliveryHours),
      },
      teams: [...teamMap.entries()].map(([teamId, members]) => ({
        teamId,
        name: members[0]?.team?.name ?? 'بدون تیم',
        members: members.length,
        activeOrders: members.reduce((sum, item) => sum + item.activeOrders, 0),
        averageCapacity: average(members.map((item) => item.capacityPercent)),
        onTimeRate: average(members.map((item) => item.onTimeRate)),
        qcPassRate: average(members.map((item) => item.qcPassRate)),
        customerRating: average(members.map((item) => item.customerRating)),
      })),
      staff: staffRows,
    };
  }

  async finance(query: ReportQueryDto) {
    const range = resolveReportRange(query.from, query.to);
    const dateWhere = { gte: range.start, lt: range.end };
    const [
      payments,
      failedPayments,
      commissions,
      refunds,
      periodEscrows,
      allEscrows,
      paidOrders,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.succeeded, verifiedAt: dateWhere },
        select: { amount: true, verifiedAt: true },
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.failed, createdAt: dateWhere },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          referenceType: LedgerReferenceType.commission,
          createdAt: dateWhere,
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.refund.findMany({
        where: { createdAt: dateWhere },
        select: { amount: true, status: true, createdAt: true },
      }),
      this.prisma.escrowHold.findMany({
        where: { heldAt: dateWhere },
        select: {
          amount: true,
          releasedAmount: true,
          refundedAmount: true,
          status: true,
        },
      }),
      this.prisma.escrowHold.findMany({
        select: {
          amount: true,
          releasedAmount: true,
          refundedAmount: true,
          status: true,
        },
      }),
      this.prisma.order.count({ where: { paidAt: dateWhere } }),
    ]);

    const sum = (values: number[]) =>
      values.reduce((total, value) => total + value, 0);
    const gmv = sum(payments.map((item) => item.amount));
    const revenue = sum(commissions.map((item) => item.amount));
    const processedRefunds = refunds.filter(
      (item) => item.status === 'processed',
    );
    const statusCounts = <T extends { status: string }>(items: T[]) =>
      items.reduce<Record<string, number>>((result, item) => {
        result[item.status] = (result[item.status] ?? 0) + 1;
        return result;
      }, {});
    const daily = buildDailySeries(range.start, range.end, [
      ...payments.flatMap((item) =>
        item.verifiedAt ? [{ date: item.verifiedAt, gmv: item.amount }] : [],
      ),
      ...commissions.map((item) => ({
        date: item.createdAt,
        revenue: item.amount,
      })),
      ...processedRefunds.map((item) => ({
        date: item.createdAt,
        refunds: item.amount,
      })),
    ]);

    return {
      period: range.period,
      sales: {
        gmv,
        succeededPayments: payments.length,
        paidOrders,
        failedPayments,
        averagePayment: payments.length ? Math.round(gmv / payments.length) : 0,
      },
      income: { revenue, commission: revenue },
      escrow: {
        periodInflow: sum(periodEscrows.map((item) => item.amount)),
        periodCount: periodEscrows.length,
        currentHeld: sum(
          allEscrows.map(
            (item) => item.amount - item.releasedAmount - item.refundedAmount,
          ),
        ),
        totalCount: allEscrows.length,
        byStatus: statusCounts(allEscrows),
      },
      refunds: {
        requestedAmount: sum(refunds.map((item) => item.amount)),
        processedAmount: sum(processedRefunds.map((item) => item.amount)),
        count: refunds.length,
        byStatus: statusCounts(refunds),
      },
      daily,
    };
  }
}
