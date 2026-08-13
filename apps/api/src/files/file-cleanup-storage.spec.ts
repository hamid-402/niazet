import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteContainedFile,
  listStalePhysicalFiles,
} from './file-cleanup-storage';

describe('file cleanup storage safety', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'niazat-file-cleanup-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists only regular files older than the cutoff', () => {
    const stalePath = join(root, 'stale');
    writeFileSync(stalePath, 'old');
    utimesSync(stalePath, new Date(0), new Date(0));
    writeFileSync(join(root, 'recent'), 'new');
    mkdirSync(join(root, 'directory'));

    expect(listStalePhysicalFiles(root, new Date(Date.now() - 60_000))).toEqual(
      ['stale'],
    );
  });

  it('deletes only a contained regular file', () => {
    writeFileSync(join(root, 'safe-key'), 'content');
    expect(deleteContainedFile(root, 'safe-key')).toBe(true);
    expect(deleteContainedFile(root, 'safe-key')).toBe(false);
    expect(() => deleteContainedFile(root, '../outside')).toThrow(
      'outside its storage root',
    );
  });

  const symbolicLinkTest = process.platform === 'win32' ? it.skip : it;

  symbolicLinkTest('refuses to follow symbolic links', () => {
    const target = join(root, 'target');
    writeFileSync(target, 'content');
    const link = join(root, 'link');
    symlinkSync(target, link, 'file');

    expect(() => deleteContainedFile(root, 'link')).toThrow(
      'non-regular storage file',
    );
  });
});
