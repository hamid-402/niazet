import { BadRequestException } from '@nestjs/common';
import { tehranDateKey, TEHRAN_TIME_ZONE } from '../common/utils/tehran-time';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const MAX_RANGE_MS = 366 * DAY_MS;

export interface ReportRange {
  start: Date;
  end: Date;
  period: {
    fromUtc: string;
    toExclusiveUtc: string;
    timeZone: typeof TEHRAN_TIME_ZONE;
    days: number;
  };
}

function parseDateOnly(value: string, end: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const wallClock = Date.UTC(year, month - 1, day);
  const check = new Date(wallClock);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException('تاریخ گزارش معتبر نیست.');
  }
  return new Date(wallClock - TEHRAN_OFFSET_MS + (end ? DAY_MS : 0));
}

function parseBoundary(value: string, end: boolean) {
  const dateOnly = parseDateOnly(value, end);
  if (dateOnly) return dateOnly;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('بازه گزارش معتبر نیست.');
  }
  return parsed;
}

export function resolveReportRange(
  from?: string,
  to?: string,
  now = new Date(),
): ReportRange {
  const end = to ? parseBoundary(to, true) : new Date(now);
  const start = from
    ? parseBoundary(from, false)
    : new Date(end.getTime() - 30 * DAY_MS);
  const duration = end.getTime() - start.getTime();
  if (duration <= 0) {
    throw new BadRequestException('ابتدای بازه باید پیش از انتهای آن باشد.');
  }
  if (duration > MAX_RANGE_MS) {
    throw new BadRequestException('بازه گزارش نمی‌تواند بیش از ۳۶۶ روز باشد.');
  }
  return {
    start,
    end,
    period: {
      fromUtc: start.toISOString(),
      toExclusiveUtc: end.toISOString(),
      timeZone: TEHRAN_TIME_ZONE,
      days: Math.ceil(duration / DAY_MS),
    },
  };
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(2))
    : 0;
}

export function average(values: number[]) {
  return values.length
    ? Number(
        (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
          2,
        ),
      )
    : 0;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

export function buildDailySeries(
  start: Date,
  end: Date,
  rows: Array<{ date: Date; gmv?: number; revenue?: number; refunds?: number }>,
) {
  const totals = new Map<
    string,
    { gmv: number; revenue: number; refunds: number }
  >();
  for (const row of rows) {
    const key = tehranDateKey(row.date);
    const value = totals.get(key) ?? { gmv: 0, revenue: 0, refunds: 0 };
    value.gmv += row.gmv ?? 0;
    value.revenue += row.revenue ?? 0;
    value.refunds += row.refunds ?? 0;
    totals.set(key, value);
  }
  const keys = new Set<string>();
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
    keys.add(tehranDateKey(new Date(cursor)));
  }
  for (const key of totals.keys()) keys.add(key);
  return [...keys].sort().map((date) => ({
    date,
    ...(totals.get(date) ?? { gmv: 0, revenue: 0, refunds: 0 }),
  }));
}
