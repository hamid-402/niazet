import {
  assignmentDeadline,
  type PerformanceAssignment,
} from './performance-metrics';

export type StaffRiskType =
  'over_capacity' | 'burnout_risk' | 'sla_risk' | 'quality_regression';
export type StaffRiskSeverity = 'warning' | 'high' | 'critical';

export interface StaffRiskSignal {
  riskType: StaffRiskType;
  severity: StaffRiskSeverity;
  active: boolean;
  evidence: Record<string, string | number | boolean | null>;
}

export interface StaffRiskSnapshot {
  qcPassRate: number;
  riskScore: number;
}

export function detectStaffRisks(input: {
  capacityPercent: number;
  activeAssignments: PerformanceAssignment[];
  currentSnapshot: StaffRiskSnapshot | null;
  previousSnapshot: StaffRiskSnapshot | null;
  now: Date;
}): StaffRiskSignal[] {
  const activeOrders = input.activeAssignments.length;
  const deadlines = input.activeAssignments
    .map((assignment) => assignmentDeadline(assignment))
    .filter((deadline): deadline is Date => deadline !== null);
  const overdueCount = deadlines.filter(
    (deadline) => deadline < input.now,
  ).length;
  const dueSoonLimit = new Date(input.now.getTime() + 24 * 60 * 60 * 1_000);
  const dueSoonCount = deadlines.filter(
    (deadline) => deadline >= input.now && deadline <= dueSoonLimit,
  ).length;
  const qcDrop =
    input.currentSnapshot && input.previousSnapshot
      ? Math.max(
          0,
          Number(input.previousSnapshot.qcPassRate) -
            Number(input.currentSnapshot.qcPassRate),
        )
      : 0;

  return [
    {
      riskType: 'over_capacity',
      severity: input.capacityPercent >= 100 ? 'high' : 'warning',
      active: input.capacityPercent >= 100,
      evidence: { capacityPercent: input.capacityPercent, activeOrders },
    },
    {
      riskType: 'burnout_risk',
      severity:
        input.capacityPercent >= 100 || activeOrders >= 5 ? 'high' : 'warning',
      active: input.capacityPercent >= 90 && activeOrders >= 3,
      evidence: { capacityPercent: input.capacityPercent, activeOrders },
    },
    {
      riskType: 'sla_risk',
      severity: overdueCount > 0 ? 'critical' : 'high',
      active: overdueCount > 0 || dueSoonCount > 0,
      evidence: { overdueCount, dueSoonCount, deadlineCount: deadlines.length },
    },
    {
      riskType: 'quality_regression',
      severity: qcDrop >= 30 ? 'critical' : 'high',
      active: qcDrop >= 15,
      evidence: {
        qcDrop,
        currentQcPassRate: input.currentSnapshot?.qcPassRate ?? null,
        previousQcPassRate: input.previousSnapshot?.qcPassRate ?? null,
        currentRiskScore: input.currentSnapshot?.riskScore ?? null,
      },
    },
  ];
}
