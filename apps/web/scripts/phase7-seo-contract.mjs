import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const layout = read('src/app/layout.tsx');
const sitemap = read('src/app/sitemap.ts');
const robots = read('src/app/robots.ts');
const schema = read('src/components/public-structured-data.tsx');
const services = read('src/app/services/page.tsx');
const detail = read('src/app/services/[slug]/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const field of ['metadataBase', 'template:', 'alternates:', 'openGraph:', 'twitter:', 'robots:']) {
  check(layout.includes(field), `Root metadata is missing: ${field}.`);
}
check(sitemap.includes("absoluteUrl('/services')") && sitemap.includes("publicApiFetch<ServiceLine[]>('/services')"), 'Sitemap needs static catalog and dynamic active service URLs.');
check(!/(admin|dashboard|orders|tickets|wallet)/.test(sitemap), 'Sitemap must exclude authenticated workspaces.');
for (const path of ['/api/', '/admin/', '/orders/', '/support/', '/account/']) {
  check(robots.includes(`'${path}'`), `Robots must disallow protected path: ${path}.`);
}
check(robots.includes("absoluteUrl('/sitemap.xml')"), 'Robots must advertise the canonical sitemap.');
for (const type of ['Organization', 'WebSite', 'Service']) {
  check(schema.includes(`'@type': '${type}'`), `Structured data is missing ${type}.`);
}
check(schema.includes('application/ld+json') && schema.includes("replaceAll('<', '\\\\u003c')"), 'JSON-LD must be rendered and escaped safely.');
check(services.includes('export const metadata: Metadata'), 'Catalog page needs dedicated metadata.');
check(detail.includes('export async function generateMetadata') && detail.includes('canonical:'), 'Service detail needs dynamic metadata and canonical URLs.');
for (const path of ['src/app/status/layout.tsx', 'src/app/login/layout.tsx', 'src/app/register/layout.tsx', 'src/app/forgot-password/layout.tsx']) {
  check(read(path).includes('export const metadata'), `${path} needs route metadata.`);
}
for (const path of ['src/app/not-found.tsx', 'src/app/error.tsx', 'src/app/global-error.tsx']) {
  const content = read(path);
  check(content.includes('تلاش') || content.includes('بازگشت'), `${path} needs a recovery action.`);
  check(!content.includes('error.message'), `${path} must not expose internal error details.`);
}
check(read('.env.local.example').includes('NEXT_PUBLIC_SITE_URL='), 'Example env must document the canonical site URL.');

if (failures.length) {
  console.error(`Phase 7 SEO contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 SEO contract passed: metadata, canonical URLs, sitemap, robots, JSON-LD and safe public error recovery verified.');
