import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const guest = read('src/components/guest-only.tsx');
const guard = read('src/components/require-role.tsx');
const shell = read('src/components/app-shell.tsx');
const authPages = ['src/app/login/page.tsx', 'src/app/register/page.tsx', 'src/app/forgot-password/page.tsx'];
const roleLayouts = ['src/app/(customer)/layout.tsx', 'src/app/(executor)/layout.tsx', 'src/app/(support)/layout.tsx', 'src/app/(admin)/layout.tsx'];
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(guest.includes('if (loading || user)') && guest.includes('<PageSkeleton'), 'GuestOnly must hide guest content throughout auth bootstrap and redirect.');
check(guest.includes('router.replace(roleHomePath(user))'), 'Signed-in users must be replaced onto their role-specific home.');
check(guard.includes('if (!authorized)') && guard.indexOf('if (!authorized)') < guard.indexOf('return <>{children}</>'), 'Protected content must render only after authorization succeeds.');
check(guard.includes("router.replace('/login')") && guard.includes('router.replace(roleHomePath(user))'), 'Protected redirects must distinguish guests from wrong-role users.');
check(shell.includes('router.replace("/login")'), 'Logout must replace history so Back cannot reveal a protected route.');

for (const page of authPages) {
  const source = read(page);
  check(source.includes('<GuestOnly>'), `${page} must block signed-in users before rendering guest content.`);
  check(!source.includes('router.push(roleHomePath(user))'), `${page} must not leave the auth form in browser history after success.`);
}
for (const layout of roleLayouts) {
  check(read(layout).includes('<RequireRole'), `${layout} must guard its complete role subtree.`);
}

if (failures.length) {
  console.error(`Phase 6 auth-redirect contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6 auth-redirect contract passed: four role trees and all guest auth pages prevent wrong-content flashes and use predictable history-safe redirects.');
