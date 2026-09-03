import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const api = read('apps/api/Dockerfile');
const web = read('apps/web/Dockerfile');
const start = read('apps/api/scripts/production-start.mjs');
const compose = read('docker-compose.production.yml');
const nextConfig = read('apps/web/next.config.ts');
const envExample = read('.env.production.example');

const stages = (dockerfile) => (dockerfile.match(/^FROM /gm) ?? []).length;
assert.ok(stages(api) >= 3, 'API image must use dependency, build and runtime stages.');
assert.ok(stages(web) >= 3, 'Web image must use dependency, build and runtime stages.');
for (const [name, dockerfile] of [['API', api], ['Web', web]]) {
  assert.match(dockerfile, /USER node/, `${name} runtime must be non-root.`);
  assert.match(dockerfile, /HEALTHCHECK/, `${name} image must define a healthcheck.`);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./, `${name} must use explicit COPY boundaries.`);
}
assert.match(api, /npm ci/, 'API dependencies must be installed reproducibly.');
assert.match(api, /prisma[^\n]+generate/, 'API build must generate Prisma Client.');
assert.match(api, /npm prune --omit=dev/, 'API runtime dependencies must omit dev dependencies.');
assert.match(api, /storage\/uploads storage\/quarantine/, 'API writable storage paths must exist.');
assert.match(start, /migrate', 'deploy'/, 'API startup must deploy migrations.');
assert.ok(
  start.indexOf("migrate', 'deploy'") < start.indexOf("['dist/main.js']"),
  'Migration deployment must run before the API process.',
);
assert.match(nextConfig, /output: "standalone"/, 'Next must produce a standalone server.');
assert.match(web, /\.next\/standalone/, 'Web runtime must copy standalone output only.');
assert.match(web, /COPY packages\/contracts/, 'Web build must include the shared API contract.');
assert.match(web, /apps\/web\/server\.js/, 'Web runtime must start the monorepo standalone entrypoint.');
for (const safeguard of ['read_only: true', 'cap_drop:', 'no-new-privileges:true', 'condition: service_healthy']) {
  assert.ok(compose.includes(safeguard), `Compose safeguard missing: ${safeguard}`);
}
assert.match(compose, /niazat_storage:\/app\/storage/, 'Persistent API storage volume is required.');
assert.match(compose, /context: \.\s*\n\s*dockerfile: apps\/web\/Dockerfile/, 'Web must build from the repository context.');
assert.match(compose, /env_file:\s*\n\s*- \.env\.production/, 'Runtime secrets must come from an ignored env file.');
assert.doesNotMatch(compose, /(PASSWORD|SECRET|TOKEN):\s*[^$\s]/i, 'Compose must not embed credentials.');
assert.ok(envExample.includes('REPLACE_'), 'Production env example must use placeholders.');
assert.ok(envExample.includes('FILE_SCAN_DRIVER=clamav'), 'Production must use the antivirus adapter.');

console.log('Phase 8 Docker production contract passed.');
