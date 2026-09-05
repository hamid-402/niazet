import { JOB_NAMES } from './job.types';
import { createJobRunKey } from './job-runner.service';
import { outboxRetryDelayMs } from './outbox-worker.service';

describe('phase 3 background infrastructure', () => {
  it('registers every required worker exactly once', () => {
    expect(new Set(JOB_NAMES).size).toBe(12);
    expect(JOB_NAMES).toEqual(
      expect.arrayContaining([
        'payment_verify_recheck',
        'release_eligible_escrows',
        'escalate_overdue_tickets',
        'recalculate_staff_performance',
        'detect_staff_risks',
        'recalculate_executor_scores',
        'send_outbox_notifications',
        'file_antivirus_scan',
        'expire_signed_urls',
        'cleanup_expired_records',
        'cleanup_storage_files',
        'generate_periodic_reports',
      ]),
    );
  });

  it('uses a stable database run key inside an interval bucket', () => {
    const first = createJobRunKey(
      'send_outbox_notifications',
      new Date(120_001),
      60_000,
    );
    const second = createJobRunKey(
      'send_outbox_notifications',
      new Date(179_999),
      60_000,
    );
    expect(first).toBe(second);
  });

  it('backs off exponentially and caps retries at one hour', () => {
    expect(outboxRetryDelayMs(1)).toBe(2_000);
    expect(outboxRetryDelayMs(20)).toBe(3_600_000);
  });
});
