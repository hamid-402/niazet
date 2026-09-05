import { existsSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

function resolveContainedFile(root: string, storageKey: string) {
  const filePath = join(root, storageKey);
  const relativePath = relative(root, filePath);
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    relativePath === '..'
  ) {
    throw new Error('Storage key resolves outside its storage root.');
  }
  return filePath;
}

export function listStalePhysicalFiles(root: string, cutoff: Date) {
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .filter((entry) => {
      const stats = lstatSync(resolveContainedFile(root, entry.name));
      return stats.mtime < cutoff;
    })
    .map((entry) => entry.name);
}

export function deleteContainedFile(root: string, storageKey: string) {
  const filePath = resolveContainedFile(root, storageKey);
  if (!existsSync(filePath)) return false;

  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Refusing to delete a non-regular storage file.');
  }
  unlinkSync(filePath);
  return true;
}
