import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const SRC = fileURLToPath(new URL('src/', ROOT));
function assert(condition, message) { if (!condition) throw new Error(message); }
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}

const globals = await readFile(new URL('src/app/globals.css', ROOT), 'utf8');
const ui = await readFile(new URL('src/components/ui.tsx', ROOT), 'utf8');
const shell = await readFile(new URL('src/components/app-shell.tsx', ROOT), 'utf8');
const required = [
  '--color-accent', '--color-overlay', '--text-body', '--text-heading-lg',
  '--layout-content-max', '--layout-grid-gap', '--radius-card',
  '--shadow-elevation-4', '--icon-size-md', '--control-height',
  '--breakpoint-xs', '--breakpoint-2xl', '--z-index-modal',
  '--opacity-disabled', "[data-density='compact']", '@utility page-container',
  '@utility layout-grid', '@utility control-density', '@utility icon-md',
];
for (const token of required) assert(globals.includes(token), `Design token is missing: ${token}`);
assert(ui.includes('control-density'), 'Shared controls do not consume density tokens.');
assert(shell.includes('page-container') && shell.includes('z-overlay'), 'App shell does not consume layout/z-index tokens.');

const tsxFiles = (await files(SRC)).filter((path) => path.endsWith('.tsx'));
const palettePattern = /(?:bg|text|border|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|fuchsia|pink|rose)-\d+(?:\/\d+)?/;
const forbiddenPattern = /(?:z-\[|rounded-(?:xl|lg)|shadow-(?:sm|md|lg|xl|2xl))/;
for (const path of tsxFiles) {
  const source = await readFile(path, 'utf8');
  assert(!palettePattern.test(source), `Raw palette utility remains in ${path}`);
  assert(!forbiddenPattern.test(source), `Raw radius/shadow/z-index utility remains in ${path}`);
}

console.log(`Phase 6 design-system contract passed: complete token namespaces and semantic-only component consumption across ${tsxFiles.length} TSX files.`);
