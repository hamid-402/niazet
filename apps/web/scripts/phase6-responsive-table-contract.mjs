import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const APP = fileURLToPath(new URL('src/app/', ROOT));
function assert(condition, message) { if (!condition) throw new Error(message); }
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}
const ui = await readFile(new URL('src/components/ui.tsx', ROOT), 'utf8');
const css = await readFile(new URL('src/app/globals.css', ROOT), 'utf8');
assert(ui.includes("cell.dataset.label = labels[index]"), 'ResponsiveTable does not derive accessible mobile labels from headers.');
for (const rule of ['.responsive-table tbody tr', '.responsive-table tbody td::before', 'content: attr(data-label)', 'min-width: 0 !important']) assert(css.includes(rule), `Responsive table CSS misses ${rule}`);

const pages = (await files(APP)).filter((path) => path.endsWith('.tsx'));
let tableCount = 0;
let pageCount = 0;
for (const path of pages) {
  const source = await readFile(path, 'utf8');
  assert(!source.includes('<table'), `Raw non-responsive table remains in ${path}`);
  const count = source.split('<ResponsiveTable').length - 1;
  if (count > 0) {
    pageCount += 1;
    tableCount += count;
    assert(source.includes("from '@/components/ui'") || source.includes('from "@/components/ui"'), `ResponsiveTable import missing in ${path}`);
  }
}
assert(pageCount === 14, `Expected 14 table pages, found ${pageCount}.`);
assert(tableCount === 16, `Expected 16 responsive tables, found ${tableCount}.`);
console.log('Phase 6 responsive-table contract passed: 16 tables across 14 pages become labeled mobile cards without altering cell actions.');
