import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveReportRange } from './reporting-metrics';
import { forecastOrders, cohortRetention } from './bi-metrics';
import type { ReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class BiService {
  constructor(private readonly prisma: PrismaService) {}
  async report(query: ReportQueryDto) {
    const range = resolveReportRange(query.from, query.to);
    const asOf = new Date(Math.min(range.end.getTime(), Date.now()));
    const [funnel, weekly, cohorts] = await this.prisma.$transaction(
      async (tx) => {
        const funnel = await tx.$queryRaw<
          Array<{
            created: number;
            submitted: number;
            quoted: number;
            paid: number;
            delivered: number;
            closed: number;
          }>
        >`
        SELECT count(*)::int AS created,
        count(*) FILTER (WHERE submitted_at < ${asOf})::int AS submitted,
        count(*) FILTER (WHERE quoted_at < ${asOf})::int AS quoted,
        count(*) FILTER (WHERE paid_at < ${asOf})::int AS paid,
        count(*) FILTER (WHERE delivered_at < ${asOf})::int AS delivered,
        count(*) FILTER (WHERE closed_at < ${asOf})::int AS closed
        FROM orders WHERE created_at >= ${range.start} AND created_at < ${asOf}`;
        const weekly = await tx.$queryRaw<
          Array<{ week: string; orders: number; complete: boolean }>
        >`
        WITH bounds AS (SELECT date_trunc('week', ${range.start}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS first_week,
          date_trunc('week', ${asOf}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS last_week),
        weeks AS (SELECT generate_series(first_week, last_week, interval '1 week') AS week FROM bounds)
        SELECT to_char(w.week, 'YYYY-MM-DD') AS week, count(o.id)::int AS orders,
          (w.week >= (${range.start}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AND w.week + interval '1 week' <= (${asOf}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')) AS complete
        FROM weeks w LEFT JOIN orders o ON (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') >= w.week
          AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') < w.week + interval '1 week'
          AND o.created_at >= ${range.start} AND o.created_at < ${asOf}
        GROUP BY w.week ORDER BY w.week`;
        const cohorts = await tx.$queryRaw<
          Array<{
            month: string;
            customers: number;
            r30: number;
            r60: number;
            r90: number;
            complete30: boolean;
            complete60: boolean;
            complete90: boolean;
          }>
        >`
        WITH first_paid AS (SELECT customer_id, min(paid_at) AS first_at FROM orders WHERE paid_at < ${asOf} GROUP BY customer_id),
        cohort AS (SELECT customer_id, first_at, date_trunc('month', first_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS month
          FROM first_paid WHERE first_at >= ${range.start} AND first_at < ${asOf}),
        retained AS (SELECT c.*, EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.paid_at >= c.first_at + interval '30 days' AND o.paid_at < c.first_at + interval '60 days' AND o.paid_at < ${asOf}) AS r30,
          EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.paid_at >= c.first_at + interval '60 days' AND o.paid_at < c.first_at + interval '90 days' AND o.paid_at < ${asOf}) AS r60,
          EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.customer_id AND o.paid_at >= c.first_at + interval '90 days' AND o.paid_at < c.first_at + interval '120 days' AND o.paid_at < ${asOf}) AS r90 FROM cohort c)
        SELECT to_char(month, 'YYYY-MM') AS month, count(*)::int AS customers,
          count(*) FILTER (WHERE r30)::int AS r30, count(*) FILTER (WHERE r60)::int AS r60, count(*) FILTER (WHERE r90)::int AS r90,
          max(first_at) + interval '60 days' <= ${asOf} AS "complete30",
          max(first_at) + interval '90 days' <= ${asOf} AS "complete60",
          max(first_at) + interval '120 days' <= ${asOf} AS "complete90"
        FROM retained GROUP BY month ORDER BY month`;
        return [funnel[0], weekly, cohorts] as const;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
    const stages = Object.entries(funnel).map(([stage, count]) => ({
      stage,
      count,
      conversionFromCreated: funnel.created
        ? Math.round((count / funnel.created) * 10000) / 100
        : null,
    }));
    return {
      period: range.period,
      asOf: asOf.toISOString(),
      funnel: stages,
      weekly,
      forecast: {
        ...forecastOrders(
          weekly.filter((row) => row.complete).map((row) => row.orders),
        ),
        method: 'mean_last_8_complete_weeks',
        horizonDays: 7,
        interval: 'descriptive_plus_minus_2_sample_standard_deviations',
      },
      cohorts: cohorts.map((row) => ({
        month: row.month,
        customers: row.customers >= 5 ? row.customers : null,
        suppressed: row.customers < 5,
        day30: cohortRetention(row.customers, row.r30, row.complete30),
        day60: cohortRetention(row.customers, row.r60, row.complete60),
        day90: cohortRetention(row.customers, row.r90, row.complete90),
      })),
      definitions: {
        cohort: 'first_paid_order',
        retention: 'repeat_paid_order_in_30_day_window',
        minimumCohortSize: 5,
        currency: null,
      },
    };
  }
}
