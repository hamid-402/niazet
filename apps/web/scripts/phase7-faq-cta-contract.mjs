import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const component = read('src/components/public-faq-cta.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const faqBlock = component.match(/const FAQS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check((faqBlock.match(/question:/g) ?? []).length === 6, 'Public FAQ must contain six decision-support questions.');
check((component.match(/<details/g) ?? []).length >= 1 && component.includes('<summary'), 'FAQ must use native details/summary disclosure semantics.');
check(component.includes('focus-visible:ring-2') && component.includes('[&::-webkit-details-marker]:hidden'), 'Custom FAQ summary needs visible keyboard focus and normalized marker behavior.');
check(/<section id="faq" aria-labelledby="public-faq-title"/.test(component), 'FAQ needs a linkable, named section landmark.');
check(component.includes('const { user, loading } = useAuth()'), 'Final CTA must consume both auth user and loading state.');
check(component.indexOf('loading ?') < component.indexOf(': user ?'), 'Loading state must resolve before authenticated/guest CTA branches.');
check(component.includes('aria-busy="true"'), 'Auth detection state needs accessible busy feedback.');
check(component.includes('href="/register"') && component.includes('href="/login"'), 'Guest CTA needs register and login paths.');
check(component.includes('href="/orders/new"') && component.includes('roleHomePath(user)'), 'Authenticated CTA needs order and role-aware workspace paths.');
check(home.includes('<PublicFaqAndFinalCta />') && !home.includes('const FAQS ='), 'Homepage must replace the legacy FAQ with the state-aware component.');

if (failures.length) {
  console.error(`Phase 7 FAQ/CTA contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 FAQ/CTA contract passed: native accessible disclosures and loading-safe role-aware final actions verified.');
