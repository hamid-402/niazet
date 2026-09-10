import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Fixed pre-redesign checkpoint. Never silently rebase this gate to HEAD.
const baseline = '2c701d7';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const split = (value) => value.split('\0').filter(Boolean);
const protectedPath = (path) => path.startsWith('apps/api/') || [
  'apps/web/src/lib/api.ts', 'apps/web/src/lib/server-api.ts',
  'apps/web/src/lib/auth-context.tsx', 'apps/web/src/lib/role-paths.ts',
  'apps/web/src/lib/types.ts', 'apps/web/src/lib/themes.ts',
].includes(path);

function violations(files, present, changed) {
  return [
    ...files.filter((path) => !present(path)).map((path) => `Baseline file missing: ${path}`),
    ...changed.filter(protectedPath).map((path) => `Protected domain/auth contract changed: ${path}`),
  ];
}

// Negative tests exercise detection without deleting or modifying project files.
assert.deepEqual(violations(['page.tsx'], () => true, ['apps/web/src/app/page.tsx']), []);
assert.equal(violations(['page.tsx'], () => false, []).length, 1);
assert.equal(violations([], () => true, ['apps/api/prisma/schema.prisma']).length, 1);
assert.equal(violations([], () => true, ['apps/web/src/lib/auth-context.tsx']).length, 1);

try {
  const files = split(git('ls-tree', '-r', '--name-only', '-z', baseline));
  assert.ok(files.length > 0, 'Missing baseline history. CI checkout needs fetch-depth: 0.');
  const changed = split(git('diff', '--name-only', '--no-renames', '-z', baseline, '--'));
  const tracked = new Set(split(git('ls-files', '-z')));
  const failures = violations(files, (path) => tracked.has(path) && existsSync(new URL(path, new URL('../', import.meta.url))), changed);
  const routes = files.filter((path) => path.startsWith('apps/web/src/app/') && path.endsWith('/page.tsx'));
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`Orbit preservation passed: ${files.length} baseline files, ${routes.length} page routes retained; backend/auth contracts unchanged; 4 guard self-tests passed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
