import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { finished, pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import {
  AUTH_TAG_BYTES,
  encodeHeader,
  encryptionKey,
  postgresEnvironment,
  sha256File,
} from './backup-format.mjs';

function databaseName(databaseUrl) {
  const name = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ''),
  );
  if (!name) throw new Error('DATABASE_URL must include a database name.');
  return name;
}

function childExit(child, name) {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveExit();
      else reject(new Error(`${name} failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

function writeChunk(stream, chunk) {
  return new Promise((resolveWrite, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolveWrite()));
  });
}

export async function createBackup(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const key = options.key ?? encryptionKey();
  const keyId = options.keyId ?? process.env.BACKUP_KEY_ID;
  if (!keyId || !/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
    throw new Error('BACKUP_KEY_ID must be 1-64 safe characters.');
  }
  const backupDir = resolve(
    options.backupDir ??
      process.env.BACKUP_DIR ??
      resolve(process.cwd(), 'backups'),
  );
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const filename = `niazat-${timestamp}-${randomUUID().slice(0, 8)}.niazat.dump.enc`;
  const finalPath = resolve(backupDir, filename);
  const temporaryPath = `${finalPath}.partial`;
  const iv = randomBytes(12);
  const header = {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyId,
    iv: iv.toString('base64'),
    createdAt: new Date().toISOString(),
    database: databaseName(databaseUrl),
    dumpFormat: 'postgres-custom',
    authTagBytes: AUTH_TAG_BYTES,
  };
  const output = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const authenticatedHeader = encodeHeader(header);
  cipher.setAAD(authenticatedHeader);
  const dump = spawn(
    options.pgDumpCommand ?? process.env.PG_DUMP_COMMAND ?? 'pg_dump',
    ['--format=custom', '--compress=9', '--no-owner', '--no-acl'],
    {
      env: postgresEnvironment(databaseUrl),
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
    },
  );
  try {
    await writeChunk(output, authenticatedHeader);
    await Promise.all([
      pipeline(dump.stdout, cipher, output, { end: false }),
      childExit(dump, 'pg_dump'),
    ]);
    await writeChunk(output, cipher.getAuthTag());
    output.end();
    await finished(output);
    await rename(temporaryPath, finalPath);
    const checksum = await sha256File(finalPath);
    await writeFile(
      `${finalPath}.sha256`,
      `${checksum}  ${basename(finalPath)}\n`,
      {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      },
    );
    return { file: finalPath, checksum, keyId, createdAt: header.createdAt };
  } catch (error) {
    dump.kill('SIGTERM');
    output.destroy();
    await rm(temporaryPath, { force: true });
    await rm(finalPath, { force: true });
    await rm(`${finalPath}.sha256`, { force: true });
    throw error;
  }
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (invoked) {
  createBackup()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `Backup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
      );
      process.exitCode = 1;
    });
}
