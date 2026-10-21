import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  copyFile,
  mkdtemp,
  open,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createBackup } from './backup-create.mjs';
import { restoreBackup } from './backup-restore.mjs';
import { enforceRetention } from './backup-retention.mjs';
import {
  encryptionKey,
  postgresEnvironment,
  sha256File,
  verifyBackupFile,
} from './backup-format.mjs';

if (process.env.NODE_ENV !== 'test')
  throw new Error('Backup restore integration only runs in NODE_ENV=test.');
if (process.env.BACKUP_TEST_CONFIRM !== 'niazat_backup_restore_test') {
  throw new Error('BACKUP_TEST_CONFIRM safety acknowledgement is missing.');
}
const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.RESTORE_DATABASE_URL;
const adminUrl = process.env.BACKUP_TEST_ADMIN_URL;
if (!sourceUrl || !targetUrl || !adminUrl)
  throw new Error('Test database URLs are required.');
const target = new URL(targetUrl);
const targetDatabase = decodeURIComponent(target.pathname.slice(1));
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Restore integration target must be loopback.');
}
if (!/^[a-z0-9_]+_restore_test$/.test(targetDatabase)) {
  throw new Error('Restore integration database must end in _restore_test.');
}
if (sourceUrl === targetUrl)
  throw new Error('Source and restore databases must differ.');

function run(command, args, databaseUrl, input) {
  const child = spawn(command, args, {
    env: postgresEnvironment(databaseUrl),
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  });
  if (input) child.stdin.end(input);
  else child.stdin.end();
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => (output += chunk));
  return new Promise((resolveRun, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolveRun(output.trim())
        : reject(new Error(`${command} failed with exit ${code}.`)),
    );
  });
}

const probeToken = randomBytes(16).toString('hex');
const backupDir = await mkdtemp(join(tmpdir(), 'niazat-backup-test-'));
try {
  await run('dropdb', ['--if-exists', '--force', targetDatabase], adminUrl);
  await run('createdb', [targetDatabase], adminUrl);
  await run(
    'psql',
    ['--set', 'ON_ERROR_STOP=1'],
    sourceUrl,
    `CREATE TABLE IF NOT EXISTS backup_restore_probe (token text PRIMARY KEY); TRUNCATE backup_restore_probe; INSERT INTO backup_restore_probe(token) VALUES ('${probeToken}');`,
  );
  const key = encryptionKey();
  const backup = await createBackup({
    databaseUrl: sourceUrl,
    backupDir,
    key,
    keyId: process.env.BACKUP_KEY_ID,
  });
  await verifyBackupFile(backup.file, key);
  await restoreBackup({
    file: backup.file,
    databaseUrl: targetUrl,
    confirmDatabase: targetDatabase,
    key,
  });
  const restoredToken = await run(
    'psql',
    [
      '--tuples-only',
      '--no-align',
      '--command',
      'SELECT token FROM backup_restore_probe LIMIT 1',
    ],
    targetUrl,
  );
  assert.equal(
    restoredToken,
    probeToken,
    'Restored probe data does not match source.',
  );
  const countSql =
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'";
  const sourceTables = await run(
    'psql',
    ['--tuples-only', '--no-align', '--command', countSql],
    sourceUrl,
  );
  const targetTables = await run(
    'psql',
    ['--tuples-only', '--no-align', '--command', countSql],
    targetUrl,
  );
  assert.equal(
    targetTables,
    sourceTables,
    'Restored table count does not match source.',
  );

  const tampered = join(
    backupDir,
    `niazat-20000101T000000Z-deadbeef.niazat.dump.enc`,
  );
  await copyFile(backup.file, tampered);
  await writeFile(
    `${tampered}.sha256`,
    `${backup.checksum}  ${basename(tampered)}\n`,
    'utf8',
  );
  const handle = await open(tampered, 'r+');
  try {
    const position = Math.max(32, Math.floor((await stat(tampered)).size / 2));
    const byte = Buffer.alloc(1);
    await handle.read(byte, 0, 1, position);
    byte[0] ^= 0xff;
    await handle.write(byte, 0, 1, position);
  } finally {
    await handle.close();
  }
  await assert.rejects(
    verifyBackupFile(tampered, key),
    /checksum verification failed/,
  );
  const attackerChecksum = await sha256File(tampered);
  await writeFile(
    `${tampered}.sha256`,
    `${attackerChecksum}  ${basename(tampered)}\n`,
    'utf8',
  );
  await assert.rejects(verifyBackupFile(tampered, key), /authenticate|auth/i);
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1_000);
  await utimes(tampered, old, old);
  const dryRun = await enforceRetention({
    backupDir,
    retentionDays: 30,
    minimumBackups: 1,
    apply: false,
  });
  assert.ok(
    dryRun.candidates.includes(basename(tampered)),
    'Dry-run retention missed the old backup.',
  );
  const applied = await enforceRetention({
    backupDir,
    retentionDays: 30,
    minimumBackups: 1,
    apply: true,
  });
  assert.ok(
    applied.deleted.includes(basename(tampered)),
    'Applied retention did not delete the old backup.',
  );
  process.stdout.write(
    `Phase 8 encrypted backup lifecycle passed: authenticated archive, transactional restore, ${targetTables} tables, tamper rejection and retention.\n`,
  );
} finally {
  await run(
    'dropdb',
    ['--if-exists', '--force', targetDatabase],
    adminUrl,
  ).catch(() => undefined);
  await rm(backupDir, { recursive: true, force: true });
}
