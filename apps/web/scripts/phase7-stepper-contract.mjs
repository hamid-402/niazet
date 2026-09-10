import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const stepper = read('src/components/service-process-stepper.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const stepsBlock = stepper.match(/const PROCESS_STEPS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check(stepper.startsWith("'use client';"), 'Interactive stepper must be a client component.');
check((stepsBlock.match(/title:/g) ?? []).length === 6, 'Stepper must contain exactly six stages.');
for (const label of ['انتخاب خدمت', 'بررسی درخواست', 'پرداخت امن', 'اجرای مدیریت‌شده', 'کنترل کیفیت', 'تحویل و اصلاح']) {
  check(stepsBlock.includes(`title: '${label}'`), `Stepper is missing stage: ${label}.`);
}
check(/<ol aria-label="مراحل سفارش خدمت"/.test(stepper), 'Stepper needs ordered-list semantics.');
check(/aria-current=\{isActive \? 'step' : undefined\}/.test(stepper), 'Active stage needs aria-current="step".');
check(/tabIndex=\{isActive \? 0 : -1\}/.test(stepper), 'Stepper needs roving keyboard focus.');
for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
  check(stepper.includes(`event.key === '${key}'`), `Stepper keyboard support is missing ${key}.`);
}
check(/aria-live="polite" aria-atomic="true"/.test(stepper), 'Dynamic stage detail needs a polite live region.');
check(stepper.includes('disabled={activeIndex === 0}') && stepper.includes("disabled={activeIndex === PROCESS_STEPS.length - 1}"), 'Previous/next controls need safe boundary states.');
check(home.includes('<ServiceProcessStepper />'), 'Homepage must render the interactive stepper.');
check(!/const STEPS =/.test(home), 'Legacy static steps must be removed from the homepage.');

if (failures.length) {
  console.error(`Phase 7 stepper contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 stepper contract passed: six managed-service stages, roving keyboard focus and accessible live details verified.');
