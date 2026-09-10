import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const catalog = read('src/components/service-catalog.tsx');
const listPage = read('src/app/services/page.tsx');
const detailPage = read('src/app/services/[slug]/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(catalog.startsWith("'use client';"), 'Catalog controls need a client component.');
check(/<form role="search"/.test(catalog) && /type="search"/.test(catalog), 'Catalog needs a semantic search form.');
check(catalog.includes('setCategory') && catalog.includes('setPricingModel'), 'Catalog needs category and pricing filters.');
check(catalog.includes('normalizeSearch') && catalog.includes('useDeferredValue'), 'Catalog search needs resilient normalized matching.');
check(/role="status" aria-live="polite"/.test(catalog), 'Filtered result count needs an accessible live status.');
for (const label of ['پکیج', 'زمان هدف', 'خروجی', 'معیار پذیرش']) {
  check(catalog.includes(label), `Catalog cards must expose ${label}.`);
}
check(catalog.includes('service.packages') && catalog.includes('service.deliverables') && catalog.includes('service.slaHours') && catalog.includes('service.acceptanceCriteria'), 'Catalog must consume package, output, SLA and acceptance data.');
check(listPage.includes('<ServiceCatalog services={services} />'), 'Services page must render the searchable catalog.');
for (const heading of ['پکیج‌ها', 'معیار پذیرش', 'خروجی قابل تحویل', 'سوالات این خدمت']) {
  check(detailPage.includes(heading), `Service detail is missing section: ${heading}.`);
}
check(detailPage.includes('pkg.slaHours') && detailPage.includes('pkg.deliverables'), 'Package cards need package-specific SLA and output.');
check((detailPage.match(/<details/g) ?? []).length >= 4, 'Service detail needs at least four contextual FAQ items.');
check(detailPage.includes('formatNumber(service.slaHours)'), 'Service SLA must use localized number formatting.');

if (failures.length) {
  console.error(`Phase 7 service-catalog contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 service-catalog contract passed: search, filters, packages, deliverables, SLA, acceptance and contextual FAQ verified.');
