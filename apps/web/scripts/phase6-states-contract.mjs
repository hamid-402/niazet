import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const ui = read('src/components/ui.tsx');
const network = read('src/components/network-status.tsx');
const guard = read('src/components/require-role.tsx');
const services = read('src/app/services/page.tsx');
const css = read('src/app/globals.css');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const component of ['Skeleton', 'PageSkeleton', 'EmptyState', 'ErrorState', 'PermissionState', 'OfflineState', 'RetryState']) {
  check(ui.includes(`export function ${component}`), `${component} shared state is missing.`);
}
check(/role="status" aria-label="در حال آماده‌سازی صفحه"/.test(ui), 'Page skeleton must expose an accessible loading status.');
check(/animate-pulse/.test(ui) && /prefers-reduced-motion:\s*reduce/.test(css), 'Skeleton motion must respect the global reduced-motion rule.');
check(/window\.addEventListener\('online'/.test(network) && /window\.addEventListener\('offline'/.test(network), 'Network status must react to online/offline transitions.');
check(/role="status" aria-live="polite"/.test(network), 'Offline notice must be announced without interrupting the user.');
check(guard.includes('<PermissionState') && guard.includes('if (!authorized)'), 'Route guard must render a standard permission state and block unauthorized children.');
check(guard.includes('<PageSkeleton'), 'Route bootstrap must use the standard page skeleton.');
check(guard.includes('router.replace(roleHomePath(user))'), 'Unauthorized redirect must lead to the role-specific home.');
check(services.includes('<RetryState') && services.includes('تلاش مجدد'), 'Public service failure must provide the standard retry state.');

if (failures.length) {
  console.error(`Phase 6 states contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6 states contract passed: skeleton, empty, error, permission, offline and retry states are standardized and connected.');
