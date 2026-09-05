import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
function assert(condition, message) { if (!condition) throw new Error(message); }
const css = await readFile(new URL('src/app/globals.css', ROOT), 'utf8');
const test = await readFile(new URL('scripts/phase6-overflow-e2e.mjs', ROOT), 'utf8');
for (const guard of ['overflow-x: clip', 'max-inline-size: 100%', 'overflow-wrap: anywhere', 'min-width: 0']) assert(css.includes(guard), `Global overflow guard is missing: ${guard}`);
for (const width of ['320', '768', '1280', '1920']) assert(test.includes(`width: ${width}`), `Viewport width ${width} is not tested.`);
for (const role of ['customer', 'ops', 'finance', 'executor', 'support']) assert(test.includes(`name: '${role}'`), `Role viewport matrix misses ${role}.`);
assert(test.includes('scrollWidth') && test.includes('clientWidth'), 'E2E does not measure horizontal document overflow.');
assert(test.includes('getBoundingClientRect'), 'E2E does not verify fixed/popover bounds.');
console.log('Phase 6 overflow contract passed: global guards plus a four-viewport, five-role runtime matrix are defined.');
