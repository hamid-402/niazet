const HOUR_MS = 60 * 60 * 1_000;

export interface PerformanceMilestone {
  dueAt: Date | null;
  deliveredAt: Date | null;
}

export interface PerformanceOrder {
  deliveredAt: Date | null;
  packageSnapshot: unknown;
  serviceLine: { slaHours: number | null };
  milestones: PerformanceMilestone[];
}

export interface PerformanceAssignment {
  assignedAt: Date;
  order: PerformanceOrder;
}

export interface RiskInputs {
  onTimeRate: number;
  onTimeSamples: number;
  qcPassRate: number;
  qcSamples: number;
  avgRating: number;
  ratingSamples: number;
  complaints: number;
  compliments: number;
}

export async function runPerformanceBatch(
  profileIds: string[],
  now: Date,
  recalculate: (profileId: string, now: Date) => Promise<unknown>,
) {
  let processed = 0;
  let skipped = 0;
  const failedProfileIds: string[] = [];
  for (const profileId of profileIds) {
    try {
      await recalculate(profileId, now);
      processed += 1;
    } catch {
      skipped += 1;
      failedProfileIds.push(profileId);
    }
  }
  return {
    processed,
    skipped,
    details: { failedProfileIds: failedProfileIds.slice(0, 20) },
  };
}

export function utcDayBucket(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function rollingPeriod(now: Date, days = 30) {
  const periodEnd = utcDayBucket(now);
  const periodStart = new Date(periodEnd.getTime() - days * 24 * HOUR_MS);
  return { periodStart, periodEnd };
}

export function isAssignmentOnTime(
  assignment: PerformanceAssignment,
): boolean | null {
  const { order } = assignment;
  const dueMilestones = order.milestones.filter((item) => item.dueAt);
  if (dueMilestones.length > 0) {
    return dueMilestones.every((item) => {
      const deliveredAt = item.deliveredAt ?? order.deliveredAt;
      return Boolean(deliveredAt && deliveredAt <= (item.dueAt as Date));
    });
  }

  const slaHours =
    snapshotSlaHours(order.packageSnapshot) ?? order.serviceLine.slaHours;
  if (!slaHours || slaHours <= 0 || !order.deliveredAt) return null;
  const deadline = new Date(
    assignment.assignedAt.getTime() + slaHours * HOUR_MS,
  );
  return order.deliveredAt <= deadline;
}

export function assignmentDeadline(assignment: PerformanceAssignment) {
  if (assignment.order.deliveredAt) return null;
  const pendingMilestoneDeadlines = assignment.order.milestones
    .filter((item) => item.dueAt && !item.deliveredAt)
    .map((item) => item.dueAt as Date)
    .sort((first, second) => first.getTime() - second.getTime());
  if (pendingMilestoneDeadlines.length > 0) return pendingMilestoneDeadlines[0];

  const slaHours =
    snapshotSlaHours(assignment.order.packageSnapshot) ??
    assignment.order.serviceLine.slaHours;
  if (!slaHours || slaHours <= 0) return null;
  return new Date(assignment.assignedAt.getTime() + slaHours * HOUR_MS);
}

export function calculateRiskScore(input: RiskInputs) {
  const components: { value: number; weight: number }[] = [];
  if (input.onTimeSamples > 0) {
    components.push({ value: 100 - clamp(input.onTimeRate), weight: 0.35 });
  }
  if (input.qcSamples > 0) {
    components.push({ value: 100 - clamp(input.qcPassRate), weight: 0.35 });
  }
  if (input.ratingSamples > 0) {
    const normalized =
      ((5 - Math.min(5, Math.max(1, input.avgRating))) / 4) * 100;
    components.push({ value: normalized, weight: 0.2 });
  }
  if (input.complaints > 0 || input.compliments > 0) {
    components.push({
      value: clamp(input.complaints * 35 - input.compliments * 10),
      weight: 0.1,
    });
  }
  if (components.length === 0) return 0;

  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  return round2(
    components.reduce((sum, item) => sum + item.value * item.weight, 0) /
      totalWeight,
  );
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function snapshotSlaHours(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const hours = (value as Record<string, unknown>).slaHours;
  return typeof hours === 'number' && Number.isFinite(hours) ? hours : null;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}
