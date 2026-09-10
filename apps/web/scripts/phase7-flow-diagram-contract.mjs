import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const flow = read('src/components/managed-service-flow.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const stepsBlock = flow.match(/const FLOW_STEPS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check((stepsBlock.match(/title:/g) ?? []).length === 6, 'Managed flow must contain six concise stages.');
for (const label of ['ثبت درخواست', 'بررسی', 'پرداخت امن', 'اجرا', 'کنترل کیفیت', 'تحویل']) {
  check(stepsBlock.includes(`title: '${label}'`), `Managed flow is missing stage: ${label}.`);
}
check(/<section aria-labelledby="managed-flow-title"/.test(flow), 'Flow needs a named section landmark.');
check(/<ol[\s\S]*<li/.test(flow), 'Flow stages need ordered-list semantics.');
check(/<svg aria-hidden="true" focusable="false"/.test(flow), 'Decorative connector SVG must be hidden from assistive technology.');
check(!/<(?:Image|img)\b/.test(flow), 'Small flow must remain CSS/inline-SVG based with no raster image.');
check(home.includes('<ManagedServiceFlow />'), 'Homepage must render the managed-service flow after the hero.');

if (failures.length) {
  console.error(`Phase 7 flow-diagram contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 flow-diagram contract passed: six semantic RTL stages with a decorative responsive SVG connector.');
