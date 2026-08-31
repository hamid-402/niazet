import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const divider = read('src/components/geometric-section-divider.tsx');
const home = read('src/app/page.tsx');
const sectionSurfaces = [
  read('src/components/service-use-cases.tsx'),
  read('src/components/service-process-stepper.tsx'),
  read('src/components/public-faq-cta.tsx'),
].join('\n');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(/aria-hidden="true"/.test(divider) && /focusable="false"/.test(divider), 'Decorative geometry must be hidden from assistive technology.');
check(/viewBox="0 0 1200 48"/.test(divider) && /preserveAspectRatio="none"/.test(divider), 'Divider must scale across responsive widths.');
check(divider.includes("flip = false") && divider.includes("'-scale-x-100'"), 'Divider needs a restrained mirrored variant.');
for (const token of ['--color-accent-border', '--color-accent', '--color-brand-secondary']) {
  check(divider.includes(`var(${token})`), `Divider must use existing semantic palette token: ${token}.`);
}
check(!/#[0-9a-f]{3,8}/i.test(divider), 'Divider must not introduce raw colors outside the design tokens.');
const uses = home.match(/<GeometricSectionDivider(?:\s+flip)?\s*\/>/g) ?? [];
check(uses.length === 2, 'Homepage must use exactly two geometric dividers to keep visual rhythm restrained.');
check(sectionSurfaces.includes('bg-bg-subtle py-16') && sectionSurfaces.includes('bg-surface py-16') && sectionSurfaces.includes('bg-accent-soft py-14'), 'Homepage rhythm needs a limited set of existing section surfaces.');

if (failures.length) {
  console.error(`Phase 7 visual-rhythm contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 visual-rhythm contract passed: two responsive geometric dividers and restrained token-based surface variation verified.');
