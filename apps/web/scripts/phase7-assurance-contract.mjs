import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const assurance = read('src/components/service-assurance.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const itemsBlock = assurance.match(/const ASSURANCES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check((itemsBlock.match(/title:/g) ?? []).length === 5, 'Assurance section must contain five product commitments.');
for (const topic of ['اجرای داخلی', 'حساب امانی', 'کنترل کیفیت', 'محرمانگی', 'پشتیبانی']) {
  check(itemsBlock.includes(topic), `Assurance section is missing topic: ${topic}.`);
}
check((itemsBlock.match(/evidence:/g) ?? []).length === 5, 'Every assurance needs inspectable evidence.');
check((itemsBlock.match(/boundary:/g) ?? []).length === 5, 'Every assurance needs an honest boundary.');
check(assurance.includes('اعتماد با سازوکار، نه شعار'), 'Assurance framing must favor mechanisms over vague claims.');
check(assurance.includes('نشانه قابل بررسی') && assurance.includes('مرز تعهد'), 'Cards must label evidence and boundaries.');
check(!/(صددرصد امن|کاملاً امن|ریسک صفر)/.test(assurance), 'Assurance copy must avoid absolute security claims.');
check(/<section aria-labelledby="assurance-title"/.test(assurance), 'Assurance needs a named section landmark.');
check(home.includes('<ServiceAssurance />'), 'Homepage must render product assurance.');

if (failures.length) {
  console.error(`Phase 7 assurance contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 assurance contract passed: five evidence-led commitments with honest boundaries verified.');
