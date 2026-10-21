import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
function assert(condition, message) { if (!condition) throw new Error(message); }
const drawer = await readFile(new URL('src/components/mobile-drawer.tsx', ROOT), 'utf8');
const publicNav = await readFile(new URL('src/components/public-nav.tsx', ROOT), 'utf8');
const appShell = await readFile(new URL('src/components/app-shell.tsx', ROOT), 'utf8');

for (const behavior of ["event.key === 'Escape'", "event.key !== 'Tab'", "document.body.style.overflow = 'hidden'", 'restoreFocusRef.current?.focus()', 'aria-modal="true"']) {
  assert(drawer.includes(behavior), `Shared mobile drawer misses: ${behavior}`);
}
assert(publicNav.includes('باز کردن منوی سایت') && publicNav.includes('ناوبری عمومی موبایل'), 'Public mobile navigation trigger/content is missing.');
for (const route of ['/services', '/#how-it-works', '/#faq', '/status']) assert(publicNav.includes(route), `Public mobile route is missing: ${route}`);
assert(publicNav.includes('md:hidden') && publicNav.includes('hidden items-center gap-3 md:flex'), 'Public desktop/mobile navigation visibility is not responsive.');
assert(appShell.includes('<MobileDrawer') && appShell.includes('md:flex md:flex-col'), 'Panel sidebar does not switch to the shared mobile drawer.');
console.log('Phase 6 mobile-navigation contract passed: public navigation and every role panel use a responsive, keyboard-safe shared drawer.');
