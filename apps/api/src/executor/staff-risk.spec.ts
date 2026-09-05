import { detectStaffRisks } from './staff-risk';

describe('staff risk signals', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');

  function assignment(deadlineHours: number) {
    return {
      assignedAt: new Date('2026-08-28T12:00:00.000Z'),
      order: {
        deliveredAt: null,
        packageSnapshot: { slaHours: 24 + deadlineHours },
        serviceLine: { slaHours: null },
        milestones: [],
      },
    };
  }

  it('detects over-capacity, workload pressure and an overdue SLA', () => {
    const signals = detectStaffRisks({
      capacityPercent: 100,
      activeAssignments: [assignment(-2), assignment(4), assignment(48)],
      currentSnapshot: { qcPassRate: 90, riskScore: 20 },
      previousSnapshot: { qcPassRate: 90, riskScore: 15 },
      now,
    });
    expect(
      signals.find((item) => item.riskType === 'over_capacity')?.active,
    ).toBe(true);
    expect(
      signals.find((item) => item.riskType === 'burnout_risk')?.active,
    ).toBe(true);
    expect(signals.find((item) => item.riskType === 'sla_risk')).toMatchObject({
      active: true,
      severity: 'critical',
    });
  });

  it('raises quality regression only for a meaningful QC drop', () => {
    const signals = detectStaffRisks({
      capacityPercent: 50,
      activeAssignments: [],
      currentSnapshot: { qcPassRate: 60, riskScore: 40 },
      previousSnapshot: { qcPassRate: 90, riskScore: 10 },
      now,
    });
    expect(
      signals.find((item) => item.riskType === 'quality_regression'),
    ).toMatchObject({ active: true, severity: 'critical' });
  });

  it('returns inactive signals when thresholds are healthy', () => {
    expect(
      detectStaffRisks({
        capacityPercent: 50,
        activeAssignments: [assignment(72)],
        currentSnapshot: { qcPassRate: 90, riskScore: 10 },
        previousSnapshot: { qcPassRate: 95, riskScore: 5 },
        now,
      }).every((item) => !item.active),
    ).toBe(true);
  });
});
