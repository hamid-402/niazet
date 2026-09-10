import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const useCases = read('src/components/service-use-cases.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const casesBlock = useCases.match(/const USE_CASES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check((casesBlock.match(/audience:/g) ?? []).length === 5, 'Use-case section must contain five focused audiences.');
for (const audience of ['کسب‌وکار', 'دانشگاه و پژوهش', 'محتوا', 'طراحی', 'امور سفارشی']) {
  check(casesBlock.includes(`audience: '${audience}'`), `Use-case section is missing audience: ${audience}.`);
}
check((casesBlock.match(/need:/g) ?? []).length === 5, 'Every use case needs a concrete user need.');
check((casesBlock.match(/services:/g) ?? []).length === 5, 'Every use case needs a service combination.');
check((casesBlock.match(/deliverable:/g) ?? []).length === 5, 'Every use case needs an explicit deliverable.');
for (const term of ['نیاز واقعی', 'ترکیب خدمت', 'خروجی قابل تحویل']) {
  check(useCases.includes(term), `Use-case cards must label: ${term}.`);
}
check(useCases.includes('نه نظر یا نتیجه ساختگی مشتری'), 'Section must distinguish scenarios from fabricated testimonials.');
check(/<section aria-labelledby="use-cases-title"/.test(useCases), 'Use cases need a named section landmark.');
check(/<ul[\s\S]*<li/.test(useCases), 'Use cases need list semantics.');
check(home.includes('<ServiceUseCases />'), 'Homepage must render the use-case section.');

if (failures.length) {
  console.error(`Phase 7 use-cases contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 use-cases contract passed: five honest scenarios with needs, service combinations and explicit deliverables verified.');
