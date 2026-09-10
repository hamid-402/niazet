import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const format = read('src/lib/format.ts');
const css = read('src/app/globals.css');
const ui = read('src/components/ui.tsx');
const notification = read('src/components/notification-center.tsx');

check(format.includes("locale: 'fa-IR'"), 'Default user locale must be Persian (Iran).');
check(format.includes("calendar: 'persian'"), 'Default calendar must be explicit.');
check(format.includes("numberingSystem: 'arabext'"), 'Persian digits must be explicit.');
check(format.includes("timeZone: 'Asia/Tehran'"), 'Display timezone must be explicit.');
for (const helper of ['formatNumber', 'formatToman', 'formatDate', 'formatDateOnly', 'formatPercent', 'formatFileSize']) {
  check(format.includes(`export function ${helper}`), `${helper} must be provided by the shared formatter.`);
}
check(/export function BidiText/.test(ui) && /<bdi dir="auto"/.test(ui), 'Dynamic mixed-direction content needs a shared BidiText primitive.');
check(notification.includes('<BidiText') && notification.includes('break-anywhere'), 'Dynamic notification copy must use bidi isolation and safe wrapping.');
check(/\[dir='ltr'\][\s\S]{0,140}unicode-bidi:\s*isolate/.test(css), 'LTR fragments must be isolated from the RTL page context.');
check(/\.truncate-safe\s*\{[\s\S]{0,180}text-overflow:\s*ellipsis/.test(css), 'Safe truncation utility is required.');
check(/\.break-anywhere\s*\{[\s\S]{0,100}overflow-wrap:\s*anywhere/.test(css), 'Long mixed-direction content needs safe wrapping.');

const sourceRoot = fileURLToPath(new URL('src/', root));
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry) && !full.endsWith(join('lib', 'format.ts'))) files.push(full);
  }
}
walk(sourceRoot);
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  check(!/\.toLocale(?:String|DateString|TimeString)\s*\(/.test(source), `${relative(sourceRoot, file)} must use the shared user formatter instead of toLocale*.`);
  check(!/new Intl\.(?:NumberFormat|DateTimeFormat)\s*\(/.test(source), `${relative(sourceRoot, file)} must not create a page-local formatter.`);
}

const locale = 'fa-IR-u-ca-persian-nu-arabext';
const numberSample = new Intl.NumberFormat(locale).format(123456);
const dateSample = new Intl.DateTimeFormat(locale, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tehran',
}).format(new Date('2026-03-21T00:00:00Z'));
check(/[۰-۹]/.test(numberSample) && !/[0-9]/.test(numberSample), 'Runtime number formatting must emit Persian digits.');
check(dateSample.includes('۱۴۰۵'), 'Runtime date formatting must use the Persian calendar.');

if (failures.length) {
  console.error(`Phase 6 RTL/format contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Phase 6 RTL/format contract passed across ${files.length} source files: Persian calendar/digits, Tehran time, bidi isolation and safe truncation verified.`);
