import { readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BACKUP_NAME = /^niazat-\d{8}T\d{6}Z-[0-9a-f]{8}\.niazat\.dump\.enc$/;

export async function enforceRetention(options = {}) {
  const backupDir = resolve(options.backupDir ?? process.env.BACKUP_DIR ?? '');
  if (!options.backupDir && !process.env.BACKUP_DIR) {
    throw new Error('BACKUP_DIR is required for retention.');
  }
  if (backupDir === parse(backupDir).root) {
    throw new Error('Filesystem root cannot be used as BACKUP_DIR.');
  }
  const retentionDays = Number(
    options.retentionDays ?? process.env.BACKUP_RETENTION_DAYS ?? 30,
  );
  const minimumBackups = Number(
    options.minimumBackups ?? process.env.BACKUP_MINIMUM_COUNT ?? 7,
  );
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer.');
  }
  if (!Number.isInteger(minimumBackups) || minimumBackups < 0) {
    throw new Error('BACKUP_MINIMUM_COUNT must be a non-negative integer.');
  }
  const apply = options.apply ?? process.env.BACKUP_RETENTION_APPLY === 'true';
  const files = (await readdir(backupDir))
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => resolve(backupDir, name));
  const entries = await Promise.all(
    files.map(async (file) => ({
      file,
      modifiedAt: (await stat(file)).mtimeMs,
    })),
  );
  entries.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
  const candidates = entries
    .slice(minimumBackups)
    .filter((entry) => entry.modifiedAt < cutoff);
  if (apply) {
    for (const entry of candidates) {
      if (dirname(resolve(entry.file)) === backupDir) {
        await rm(entry.file);
        await rm(`${entry.file}.sha256`, { force: true });
      } else {
        throw new Error(
          `Retention target escaped BACKUP_DIR: ${basename(entry.file)}`,
        );
      }
    }
  }
  return {
    apply,
    retentionDays,
    minimumBackups,
    retained: entries.length - (apply ? candidates.length : 0),
    candidates: candidates.map((entry) => basename(entry.file)),
    deleted: apply ? candidates.map((entry) => basename(entry.file)) : [],
  };
}

const invoked = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (invoked) {
  enforceRetention()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `Retention failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
      );
      process.exitCode = 1;
    });
}
