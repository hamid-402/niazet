export const JOB_NAMES = [
  'payment_verify_recheck',
  'release_eligible_escrows',
  'escalate_overdue_tickets',
  'recalculate_staff_performance',
  'recalculate_executor_scores',
  'send_outbox_notifications',
  'file_antivirus_scan',
  'expire_signed_urls',
  'generate_periodic_reports',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export interface JobResult {
  processed: number;
  skipped?: number;
  details?: Record<string, unknown>;
}

export interface JobDefinition {
  name: JobName;
  intervalMs: number;
  run: (now: Date) => Promise<JobResult>;
}
