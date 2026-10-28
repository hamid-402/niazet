import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
function assert(condition, message) { if (!condition) throw new Error(message); }
const ui = await readFile(new URL('src/components/ui.tsx', ROOT), 'utf8');
const drawer = await readFile(new URL('src/components/mobile-drawer.tsx', ROOT), 'utf8');
const modal = await readFile(new URL('src/components/confirmation-modal.tsx', ROOT), 'utf8');
const wallet = await readFile(new URL('src/app/(customer)/wallet/page.tsx', ROOT), 'utf8');
const order = await readFile(new URL('src/app/(customer)/orders/[id]/page.tsx', ROOT), 'utf8');
const staff = await readFile(new URL('src/app/(admin)/admin/staff/[id]/page.tsx', ROOT), 'utf8');

for (const token of ['role="tablist"', 'role="tab"', 'aria-controls', 'aria-selected', 'tabIndex={active ? 0 : -1}', "event.key === 'Home'", "event.key === 'End'", "event.key === 'ArrowRight'", "event.key === 'ArrowLeft'", '.focus()']) assert(ui.includes(token), `Tab keyboard contract misses ${token}`);
for (const page of [wallet, order, staff]) {
  assert(page.includes('<TabList'), 'A product tab set is not using shared TabList.');
  assert(page.includes('role="tabpanel"') && page.includes('aria-labelledby'), 'Tab panel semantics are incomplete.');
}
for (const source of [drawer, modal]) {
  for (const behavior of ["event.key === 'Escape'", "event.key !== 'Tab'", 'restoreFocusRef.current?.focus()']) assert(source.includes(behavior), `Drawer/modal keyboard behavior misses ${behavior}`);
  assert(source.includes('aria-modal="true"'), 'Drawer/modal ARIA modality is missing.');
}
console.log('Phase 6 keyboard contract passed: tabs, drawer and confirmation modal provide ARIA linkage, roving focus, arrows/Home/End, ESC, focus trap and focus restoration.');
