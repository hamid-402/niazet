import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const controls = read('src/components/list-controls.tsx');
const orders = read('src/app/(admin)/admin/orders/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const component of ['Breadcrumbs', 'ListToolbar', 'SearchField', 'FilterSelect', 'SortSelect', 'Pagination', 'ActionMenu']) {
  check(controls.includes(`export function ${component}`), `${component} shared control is missing.`);
  check(orders.includes(`<${component}`), `Admin orders must consume ${component} instead of a page-local substitute.`);
}
check(/<nav aria-label="مسیر صفحه"/.test(controls) && /aria-current="page"/.test(controls), 'Breadcrumbs need a labeled landmark and current-page semantics.');
check(/role="search"/.test(controls) && /type="search"/.test(controls), 'Search toolbar needs semantic search markup.');
check(/<nav aria-label="صفحه‌بندی"/.test(controls) && /aria-live="polite"/.test(controls), 'Pagination needs a labeled landmark and announced page state.');
check(/<details[\s\S]{0,180}<summary/.test(controls), 'Action menu must use keyboard-operable native disclosure semantics.');
check(/useDeferredValue\(search\)/.test(orders), 'Remote search must defer rapid typing updates.');
check(/filteredOrders\.slice/.test(orders) && /PAGE_SIZE/.test(orders), 'Operational list must implement deterministic pagination.');
check(/result\.sort/.test(orders) && /statusFilter/.test(orders), 'Operational list must implement shared sort and filter behavior.');

if (failures.length) {
  console.error(`Phase 6 list-controls contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6 list-controls contract passed: breadcrumb, search, filter, sort, pagination and action menu are shared and used by the operational order list.');
