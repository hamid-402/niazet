import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const transition = read('src/components/route-transition.tsx');
const layout = read('src/app/layout.tsx');
const globalCss = read('src/app/globals.css');
const manifest = read('package.json');
const lockfile = read('package-lock.json');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(transition.startsWith("'use client';"), 'Route transition must run as a client boundary.');
check(transition.includes('usePathname') && transition.includes('key={pathname}'), 'Motion must be keyed to route changes.');
check(transition.includes('isPublicRoute(pathname)') && transition.includes('PUBLIC_ROUTE_PREFIXES'), 'Motion profile must distinguish public and workspace routes.');
check(transition.includes("publicRoute ? 'route-transition--public' : 'route-transition--workspace'"), 'Public and workspace routes need distinct restrained profiles.');
check(globalCss.includes('translateY(6px)') && globalCss.includes('opacity: 0.985'), 'Public motion must stay subtle and workspace motion quieter.');
check(globalCss.includes('route-enter-public var(--duration-base)') && globalCss.includes('route-enter-workspace var(--duration-fast)'), 'Motion duration must reuse the bounded design tokens.');
check(!/(infinite|animation-iteration-count:\s*[2-9])/.test(globalCss), 'Route motion must avoid decorative or continuous animation.');
check(layout.includes('<AuthProvider><RouteTransition>{children}</RouteTransition></AuthProvider>'), 'Root layout must preserve auth state outside route transitions.');
check(/@media \(prefers-reduced-motion: reduce\)/.test(globalCss), 'Global CSS fallback must continue to disable non-essential motion.');
check(/\.route-transition \{[\s\S]*?animation: none !important;[\s\S]*?transform: none !important;/.test(globalCss), 'Reduced-motion mode must explicitly neutralize route animation.');
check(!manifest.includes('framer-motion') && !lockfile.includes('node_modules/framer-motion'), 'Limited route motion must not add a heavy animation dependency.');

if (failures.length) {
  console.error(`Phase 7 route-motion contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 route-motion contract passed: restrained route-aware entry motion, stable first paint and reduced-motion support verified.');
