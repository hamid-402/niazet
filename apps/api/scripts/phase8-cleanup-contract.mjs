import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const service = read('src/jobs/data-cleanup.service.ts');
const jobs = read('src/jobs/job.types.ts');
const fileCleanup = read('src/files/file-cleanup.service.ts');
const migration = read(
  'prisma/migrations/20260903080000_phase8_cleanup_retention/migration.sql',
);
const integration = read('scripts/phase8-cleanup-integration.ts');
const operations = read('../../docs/RETENTION_CLEANUP.md');

for (const job of ['cleanup_expired_records', 'cleanup_storage_files']) {
  assert.ok(jobs.includes(job), `Recurring job is missing: ${job}`);
}
for (const model of [
  'session',
  'otpCode',
  'idempotencyKey',
  'outboxEvent',
  'signedUrlGrant',
  'backgroundJobRun',
]) {
  assert.ok(
    service.includes(`tx.${model}`),
    `Cleanup model is missing: ${model}`,
  );
}
assert.match(
  service,
  /pg_try_advisory_xact_lock/,
  'Cleanup must use a cross-process lock.',
);
assert.match(
  service,
  /take: policy\.batchSize/g,
  'Cleanup must delete bounded batches.',
);
assert.match(
  service,
  /status: OutboxStatus\.sent/,
  'Cleanup may delete delivered outbox events.',
);
assert.match(
  service,
  /status: OutboxStatus\.dead_letter/,
  'Cleanup may retain then delete dead letters.',
);
assert.doesNotMatch(
  service,
  /status: OutboxStatus\.(pending|failed|processing)/,
  'Cleanup must never select actionable outbox events.',
);
assert.match(
  service,
  /action: 'data\.cleanup'/,
  'Cleanup result must be audited.',
);
assert.doesNotMatch(
  fileCleanup,
  /setInterval|setTimeout/,
  'Storage cleanup must use the shared job runner.',
);
for (const index of [
  'sessions_expires_at_idx',
  'otp_codes_expires_at_idx',
  'outbox_events_status_sent_at_idx',
  'background_job_runs_completed_at_idx',
]) {
  assert.ok(migration.includes(index), `Cleanup index is missing: ${index}`);
}
assert.match(
  integration,
  /CLEANUP_TEST_CONFIRM/,
  'Integration cleanup needs an explicit safety gate.',
);
assert.match(
  integration,
  /preserved/,
  'Integration cleanup must verify retained records.',
);
for (const safeguard of [
  'batch',
  'pending',
  'dead_letter',
  'Audit',
  'super_admin',
]) {
  assert.ok(
    operations.includes(safeguard),
    `Cleanup operations guide is missing ${safeguard}.`,
  );
}

console.log('Phase 8 bounded retention cleanup contract passed.');
