import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const SRC = fileURLToPath(new URL('src/', ROOT));
function assert(condition, message) { if (!condition) throw new Error(message); }
async function files(path) { const entries = await readdir(path, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat(); }
const sources = await Promise.all((await files(SRC)).filter((path) => path.endsWith('.tsx')).map(async (path) => ({ path, source: await readFile(path, 'utf8') })));
for (const { path, source } of sources) {
  for (const match of source.matchAll(/<svg[\s\S]*?>/g)) assert(match[0].includes('aria-hidden="true"') || match[0].includes('role="img"'), `SVG lacks decorative/image semantics in ${path}`);
}
const theme = sources.find((item) => item.path.endsWith('theme-switcher.tsx'))?.source ?? '';
for (const token of ['aria-label={`انتخاب پوسته', 'aria-expanded={open}', 'aria-controls={listboxId}', 'aria-label="پوسته‌های قابل انتخاب"', 'aria-selected={t.id === theme}', 'useId()']) assert(theme.includes(token), `Theme switcher accessibility misses ${token}`);
const shell = sources.find((item) => item.path.endsWith('app-shell.tsx'))?.source ?? '';
const publicNav = sources.find((item) => item.path.endsWith('public-nav.tsx'))?.source ?? '';
const drawer = sources.find((item) => item.path.endsWith('mobile-drawer.tsx'))?.source ?? '';
assert(shell.includes('aria-label="باز کردن منو"'), 'Panel menu icon has no accessible name.');
assert(publicNav.includes('aria-label="باز کردن منوی سایت"'), 'Public menu icon has no accessible name.');
assert(drawer.includes('aria-label="بستن منو"'), 'Drawer close icon has no accessible name.');
console.log('Phase 6 icon-label contract passed: all SVGs are decorative/image-safe and every icon-only/theme control has an accessible name and state.');
