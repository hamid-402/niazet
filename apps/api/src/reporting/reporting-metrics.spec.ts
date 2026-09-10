import { BadRequestException } from '@nestjs/common';
import {
  average,
  buildDailySeries,
  median,
  percentage,
  resolveReportRange,
} from './reporting-metrics';

describe('reporting metrics', () => {
  it('resolves inclusive Tehran date fields to an exclusive UTC range', () => {
    const range = resolveReportRange('2026-08-01', '2026-08-02');
    expect(range.period).toEqual({
      fromUtc: '2026-07-31T20:30:00.000Z',
      toExclusiveUtc: '2026-08-02T20:30:00.000Z',
      timeZone: 'Asia/Tehran',
      days: 2,
    });
  });

  it('rejects invalid, reversed and overlong ranges', () => {
    expect(() => resolveReportRange('2026-02-30', '2026-03-01')).toThrow(
      BadRequestException,
    );
    expect(() => resolveReportRange('2026-08-03', '2026-08-01')).toThrow(
      BadRequestException,
    );
    expect(() => resolveReportRange('2024-01-01', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });

  it('calculates safe rates and distribution values', () => {
    expect(percentage(3, 4)).toBe(75);
    expect(percentage(1, 0)).toBe(0);
    expect(average([1, 2, 6])).toBe(3);
    expect(median([9, 1, 3, 5])).toBe(4);
    expect(median([])).toBe(0);
  });

  it('aggregates and fills Tehran daily financial series', () => {
    const series = buildDailySeries(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-03T00:00:00.000Z'),
      [
        { date: new Date('2026-08-01T10:00:00.000Z'), gmv: 100 },
        { date: new Date('2026-08-01T11:00:00.000Z'), revenue: 10 },
      ],
    );
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ gmv: 100, revenue: 10, refunds: 0 });
  });
});
