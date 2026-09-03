import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import {
  decryptedStream,
  encryptionKey,
  postgresEnvironment,
  readBackupMetadata,
  verifyBackupFile,
} from './backup-format.mjs';

function targetDatabaseName(databaseUrl) {
  const name = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ''),
  );
  if (!name)
    throw new Error('RESTORE_DATABASE_URL must include a database name.');
  return name;
}

function childExit(child) {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveExit();
      else
        reject(new Error(`pg_restore failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

export async function restoreBackup(options = {}) {
  const file = resolve(options.file ?? process.env.BACKUP_FILE ?? '');
  const databaseUrl = options.databaseUrl ?? process.env.RESTORE_DATABASE_URL;
  if (!options.file && !process.env.BACKUP_FILE)
    throw new Error('BACKUP_FILE is required.');
  if (!databaseUrl) throw new Error('RESTORE_DATABASE_URL is required.');
  const database = targetDatabaseName(databaseUrl);
  const confirmation =
    options.confirmDatabase ?? process.env.RESTORE_CONFIRM_DATABASE;
  if (confirmation !== database) {
    throw new Error(
      'RESTORE_CONFIRM_DATABASE must exactly match the target database name.',
    );
  }
  const key = options.key ?? encryptionKey();
  const verified = await verifyBackupFile(file, key);
  const metadata = await readBackupMetadata(file);
  const restore = spawn(
    options.pgRestoreCommand ?? process.env.PG_RESTORE_COMMAND ?? 'pg_restore',
    [
      '--dbname',
      database,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--single-transaction',
    ],
    {
      env: postgresEnvironment(databaseUrl),
      stdio: ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    },
  );
  const { source, decipher } = decryptedStream(file, key, metadata);
  await Promise.all([
    pipeline(source, decipher, restore.stdin),
    childExit(restore),
  ]);
  return {
    restored: true,
    database,
    keyId: verified.header.keyId,
    sourceCreatedAt: verified.header.createdAt,
  };
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (invoked) {
  restoreBackup()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `Restore failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
      );
      process.exitCode = 1;
    });
}
