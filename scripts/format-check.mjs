import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = [
  'apps/api/src',
  'apps/api/test',
  'apps/api/scripts',
  'apps/api/prisma',
  'apps/web/src',
  'apps/web/scripts',
  'docs',
  '.github',
];
const extensions = new Set(['.ts', '.tsx', '.mjs', '.js', '.json', '.css', '.sql', '.md', '.yml', '.yaml']);
const failures = [];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  }))).flat();
}

for (const root of roots) {
  let files = [];
  try { files = await walk(root); } catch { continue; }
  for (const path of files.filter((item) => extensions.has(extname(item)))) {
    const extension = extname(path);
    const source = await readFile(path, 'utf8');
    if (source.charCodeAt(0) === 0xfeff) failures.push(`${path}: UTF-8 BOM is not allowed.`);
    if (source.includes('\u0000')) failures.push(`${path}: NUL byte is not allowed.`);
    if (source && !source.endsWith('\n')) failures.push(`${path}: missing final newline.`);
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (extension !== '.md' && /[ \t]+$/.test(line)) failures.push(`${path}:${index + 1}: trailing whitespace.`);
      if (/^(<<<<<<< |>>>>>>> |=======$)/.test(line)) failures.push(`${path}:${index + 1}: unresolved merge marker.`);
    });
  }
}

for (const path of ['apps/api/package.json', 'apps/web/package.json', 'apps/api/tsconfig.json', 'apps/web/tsconfig.json']) {
  try { JSON.parse(await readFile(path, 'utf8')); } catch (error) { failures.push(`${path}: invalid JSON (${error.message}).`); }
}

if (failures.length) {
  console.error(`Format check failed (${failures.length}):`);
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Format check passed: encoding, final newlines, trailing whitespace, merge markers and JSON syntax are clean.');
