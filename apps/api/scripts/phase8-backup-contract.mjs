import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const create = read('scripts/backup-create.mjs');
const restore = read('scripts/backup-restore.mjs');
const format = read('scripts/backup-format.mjs');
const retention = read('scripts/backup-retention.mjs');
const runbook = read('../../docs/DISASTER_RECOVERY.md');

assert.match(
  create,
  /aes-256-gcm/,
  'Backup must use authenticated AES-256-GCM encryption.',
);
assert.match(
  create,
  /--format=custom/,
  'Backup must use PostgreSQL custom format.',
);
assert.match(
  create,
  /postgresEnvironment\(databaseUrl\)/,
  'Database credentials must stay in the child environment.',
);
assert.doesNotMatch(
  create,
  /spawn\([\s\S]*?\[[^\]]*\bdatabaseUrl\b/,
  'Backup database credentials must stay out of command arguments.',
);
assert.doesNotMatch(
  restore,
  /spawn\([\s\S]*?\[[^\]]*\bdatabaseUrl\b/,
  'Restore database credentials must stay out of command arguments.',
);
assert.match(create, /\.partial/, 'Backup creation must be atomic.');
assert.match(
  format,
  /timingSafeEqual/,
  'Checksum comparison must be timing-safe.',
);
assert.match(
  create,
  /setAAD\(authenticatedHeader\)/,
  'Backup metadata must be authenticated.',
);
assert.match(
  format,
  /setAAD\(metadata\.authenticatedHeader\)/,
  'Restore must authenticate metadata.',
);
assert.match(
  format,
  /setAuthTag/,
  'Restore must authenticate encrypted content.',
);
assert.ok(
  restore.indexOf('const verified = await verifyBackupFile') <
    restore.indexOf('const restore = spawn'),
  'Restore must verify the complete backup before invoking pg_restore.',
);
assert.match(restore, /--single-transaction/, 'Restore must be transactional.');
assert.match(
  restore,
  /'--dbname',\s*database/,
  'pg_restore must receive the non-secret target database name.',
);
assert.match(
  restore,
  /RESTORE_CONFIRM_DATABASE/,
  'Restore requires exact target confirmation.',
);
assert.match(
  retention,
  /BACKUP_RETENTION_APPLY === 'true'/,
  'Retention must default to dry-run.',
);
assert.match(
  retention,
  /BACKUP_NAME\.test/,
  'Retention must only target recognized backup names.',
);
for (const section of ['RPO', 'RTO', 'بازیابی', 'Failback', 'آزمون دوره‌ای']) {
  assert.ok(
    runbook.includes(section),
    `Disaster recovery runbook is missing ${section}.`,
  );
}

console.log('Phase 8 encrypted backup and disaster recovery contract passed.');
