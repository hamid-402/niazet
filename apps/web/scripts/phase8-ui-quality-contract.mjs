import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scenarios, snapshotPolicy, themes, validateVisualMatrix, viewports } from './phase8-visual-regression-matrix.mjs';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const inheritedContracts = [
  'phase6-design-system-contract.mjs',
  'phase6-mobile-navigation-contract.mjs',
  'phase6-responsive-table-contract.mjs',
  'phase6-overflow-contract.mjs',
  'phase6-keyboard-contract.mjs',
  'phase6-icon-label-contract.mjs',
  'phase6-structure-contract.mjs',
  'phase6-contrast-motion-contract.mjs',
  'phase6-rtl-format-contract.mjs',
  'phase6-states-contract.mjs',
  'phase6-list-controls-contract.mjs',
  'phase6-auth-redirect-contract.mjs',
  'phase6-microcopy-contract.mjs',
];

for (const contract of inheritedContracts) {
  const result = spawnSync(process.execPath, [`scripts/${contract}`], {
    cwd: rootPath,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${contract} failed:\n${result.stdout}\n${result.stderr}`);
}

const layout = read('src/app/layout.tsx');
const css = read('src/app/globals.css');
const drawer = read('src/components/mobile-drawer.tsx');
const publicNav = read('src/components/public-nav.tsx');
const appShell = read('src/components/app-shell.tsx');
const themeSwitcher = read('src/components/theme-switcher.tsx');
const notifications = read('src/components/notification-center.tsx');

for (const token of ['lang="fa"', 'dir="rtl"', 'href="#main-content"', 'className="skip-link"']) {
  assert.ok(layout.includes(token), `Root accessibility contract misses ${token}.`);
}
for (const token of [':focus-visible', '.skip-link:focus-visible', '@media (prefers-reduced-motion: reduce)', 'overflow-x: clip']) {
  assert.ok(css.includes(token), `Global UI safety contract misses ${token}.`);
}
for (const token of ['id: string', 'id={id}', 'aria-labelledby={`${id}-title`}', "event.key === 'Escape'", "event.key !== 'Tab'", 'restoreFocusRef.current?.focus()']) {
  assert.ok(drawer.includes(token), `Mobile drawer contract misses ${token}.`);
}
assert.ok(publicNav.includes('aria-controls="public-mobile-drawer"') && publicNav.includes('aria-expanded={mobileOpen}'), 'Public mobile trigger is not linked to its drawer.');
assert.ok(appShell.includes('aria-controls="workspace-mobile-drawer"') && appShell.includes('aria-expanded={mobileOpen}'), 'Workspace mobile trigger is not linked to its drawer.');

for (const token of ['useId()', 'role="listbox"', 'role="option"', 'aria-controls={listboxId}', "event.key === 'ArrowDown'", "event.key === 'ArrowUp'", "event.key === 'Home'", "event.key === 'End'", "event.key === 'Escape'", 'closeAndRestore()', 'triggerRef.current?.focus()']) {
  assert.ok(themeSwitcher.includes(token), `Theme listbox keyboard contract misses ${token}.`);
}
for (const token of ['useId()', 'aria-controls={panelId}', 'aria-haspopup="dialog"', 'role="dialog"', 'event.key !== "Escape"', 'triggerRef.current?.focus()']) {
  assert.ok(notifications.includes(token), `Notification disclosure keyboard contract misses ${token}.`);
}

const snapshotCount = validateVisualMatrix();
assert.equal(themes.length, 2);
assert.deepEqual(viewports.map((item) => item.width), [320, 768, 1280, 1920]);
assert.equal(snapshotCount, 144);
assert.equal(snapshotPolicy.disableAnimations, true);
assert.ok(snapshotPolicy.maxDiffPixelRatio <= 0.005);
for (const role of ['guest', 'customer', 'ops', 'finance', 'executor', 'support']) {
  assert.ok(scenarios.some((item) => item.role === role), `Visual role matrix misses ${role}.`);
}

console.log(`Phase 8 static UI quality contract passed: ${inheritedContracts.length} inherited suites, linked/focus-safe disclosures, RTL semantics, four responsive widths and a ${snapshotCount}-snapshot two-theme visual matrix.`);

