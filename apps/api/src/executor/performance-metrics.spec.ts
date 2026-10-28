import {
  calculateRiskScore,
  isAssignmentOnTime,
  rollingPeriod,
  runPerformanceBatch,
} from './performance-metrics';

describe('staff performance metrics', () => {
  it('uses milestone deadlines before package SLA', () => {
    expect(
      isAssignmentOnTime({
        assignedAt: new Date('2026-08-01T00:00:00.000Z'),
        order: {
          deliveredAt: new Date('2026-08-05T00:00:00.000Z'),
          packageSnapshot: { slaHours: 240 },
          serviceLine: { slaHours: 240 },
          milestones: [
            {
              dueAt: new Date('2026-08-04T00:00:00.000Z'),
              deliveredAt: new Date('2026-08-04T01:00:00.000Z'),
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('falls back to the snapshotted package SLA', () => {
    expect(
      isAssignmentOnTime({
        assignedAt: new Date('2026-08-01T00:00:00.000Z'),
        order: {
          deliveredAt: new Date('2026-08-03T01:00:00.000Z'),
          packageSnapshot: { slaHours: 48 },
          serviceLine: { slaHours: 72 },
          milestones: [],
        },
      }),
    ).toBe(false);
  });

  it('does not count an order when neither deadline nor SLA exists', () => {
    expect(
      isAssignmentOnTime({
        assignedAt: new Date('2026-08-01T00:00:00.000Z'),
        order: {
          deliveredAt: new Date('2026-08-02T00:00:00.000Z'),
          packageSnapshot: null,
          serviceLine: { slaHours: null },
          milestones: [],
        },
      }),
    ).toBeNull();
  });

  it('combines every signal into a bounded risk score', () => {
    const risk = calculateRiskScore({
      onTimeRate: 50,
      onTimeSamples: 4,
      qcPassRate: 50,
      qcSamples: 4,
      avgRating: 3,
      ratingSamples: 2,
      complaints: 2,
      compliments: 0,
    });
    expect(risk).toBeGreaterThan(50);
    expect(risk).toBeLessThanOrEqual(100);
    expect(
      calculateRiskScore({
        onTimeRate: 0,
        onTimeSamples: 0,
        qcPassRate: 0,
        qcSamples: 0,
        avgRating: 0,
        ratingSamples: 0,
        complaints: 0,
        compliments: 0,
      }),
    ).toBe(0);
  });

  it('creates a stable daily bucket for a rolling 30-day snapshot', () => {
    const first = rollingPeriod(new Date('2026-08-29T01:00:00.000Z'));
    const second = rollingPeriod(new Date('2026-08-29T23:59:59.000Z'));
    expect(first.periodEnd).toEqual(second.periodEnd);
    expect(first.periodStart.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('continues the batch when one profile calculation fails', async () => {
    const recalculate = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('bad profile'))
      .mockResolvedValueOnce(undefined);
    const result = await runPerformanceBatch(
      ['profile-1', 'profile-2', 'profile-3'],
      new Date('2026-08-29T12:00:00.000Z'),
      recalculate,
    );
    expect(result).toEqual({
      processed: 2,
      skipped: 1,
      details: { failedProfileIds: ['profile-2'] },
    });
    expect(recalculate).toHaveBeenCalledTimes(3);
  });
});
