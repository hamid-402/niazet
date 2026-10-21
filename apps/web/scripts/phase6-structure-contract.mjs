import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const layout = read('src/app/layout.tsx');
const shell = read('src/components/app-shell.tsx');
const ui = read('src/components/ui.tsx');
const css = read('src/app/globals.css');

check(layout.includes('href="#main-content"') && layout.includes('className="skip-link"'), 'Root layout must expose a skip link to #main-content.');
check(shell.includes('<main id="main-content"'), 'Authenticated app shell must expose the main landmark target.');
check(/as: Heading = 'h1'/.test(ui) && /as\?: 'h1' \| 'h2' \| 'h3'/.test(ui), 'SectionTitle must default to an h1 and support lower levels for subsections.');
check(/<label className=/.test(ui), 'Field must provide a native label association.');
check(/error\?: string/.test(ui) && /role="alert" aria-live="polite"/.test(ui), 'Field must support an announced inline error.');
check(/role="alert"[\s\S]{0,80}aria-live="assertive"/.test(ui), 'ErrorBanner must announce submit errors.');
check(/:focus-visible\s*\{[\s\S]*?outline:/.test(css), 'A global visible focus ring is required.');
check(/\.skip-link:focus-visible\s*\{/.test(css), 'Skip link must become visible on keyboard focus.');

const appRoot = fileURLToPath(new URL('src/app/', root));
const pageFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === 'page.tsx') pageFiles.push(full);
  }
}
walk(appRoot);

for (const file of pageFiles) {
  const source = readFileSync(file, 'utf8');
  const name = relative(appRoot, file);
  for (const match of source.matchAll(/<main\b[^>]*>/g)) {
    check(match[0].includes('id="main-content"'), `${name}: every explicit main landmark must target the skip link.`);
  }
  const explicitH1 = (source.match(/<h1\b/g) ?? []).length;
  const defaultSectionTitle = [...source.matchAll(/<SectionTitle\b([^>]*)>/g)].filter((match) => !/\bas=/.test(match[1])).length;
  check(explicitH1 + defaultSectionTitle <= 1, `${name}: page must not expose more than one primary heading.`);
}

for (const required of ['src/app/page.tsx', 'src/app/login/page.tsx', 'src/app/register/page.tsx', 'src/app/forgot-password/page.tsx']) {
  check(read(required).includes('<main id="main-content"'), `${required}: public page must expose a main landmark.`);
}

if (failures.length) {
  console.error(`Phase 6 structure contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Phase 6 structure contract passed (${pageFiles.length} pages checked).`);
