import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const allowedLicenses = new Set([
  '(MIT OR CC0-1.0)',
  '0BSD',
  'Apache-2.0',
  'Apache-2.0 AND LGPL-3.0-or-later',
  'Apache-2.0 AND LGPL-3.0-or-later AND MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'UNLICENSED',
  'Unlicense',
]);
const exceptions = JSON.parse(
  readFileSync(resolve(root, 'docs/dependency-license-exceptions.json'), 'utf8'),
);
const reports = [];
const sboms = new Map();

function packageName(path) {
  return path.slice(path.lastIndexOf('node_modules/') + 13);
}

function cyclonedxComponent(name, dependency, path, license) {
  const scopeSeparator = name.startsWith('@') ? name.indexOf('/') : -1;
  const group = scopeSeparator > 0 ? name.slice(0, scopeSeparator) : undefined;
  const componentName = scopeSeparator > 0 ? name.slice(scopeSeparator + 1) : name;
  const purlPath = group
    ? `${encodeURIComponent(group)}/${encodeURIComponent(componentName)}`
    : encodeURIComponent(componentName);
  const purl = `pkg:npm/${purlPath}@${encodeURIComponent(dependency.version)}`;
  return {
    type: 'library',
    ...(group ? { group } : {}),
    name: componentName,
    version: dependency.version,
    'bom-ref': `${purl}?package_path=${encodeURIComponent(path)}`,
    purl,
    licenses: [{ expression: license }],
  };
}

for (const app of ['api', 'web']) {
  const lockPath = resolve(root, `apps/${app}/package-lock.json`);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  assert.ok(lock.lockfileVersion >= 3, `${app} must use npm lockfile v3 or newer.`);
  const licenses = new Map();
  const components = [];
  let packages = 0;
  for (const [path, dependency] of Object.entries(lock.packages)) {
    if (!path || !path.includes('node_modules/')) continue;
    packages += 1;
    const name = packageName(path);
    const identity = `${name}@${dependency.version}`;
    if (dependency.resolved?.startsWith('http')) {
      assert.match(dependency.integrity ?? '', /^sha(256|384|512)-/, `${identity} lacks integrity.`);
    }
    const license = dependency.license ?? exceptions[identity];
    assert.ok(license, `${identity} has no reviewed license metadata.`);
    assert.ok(allowedLicenses.has(license), `${identity} uses an unapproved license: ${license}`);
    licenses.set(license, (licenses.get(license) ?? 0) + 1);
    components.push(cyclonedxComponent(name, dependency, path, license));
  }
  reports.push({
    app,
    packages,
    licenses: Object.fromEntries([...licenses.entries()].sort(([a], [b]) => a.localeCompare(b))),
  });
  sboms.set(app, {
    $schema: 'https://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: { components: [{ type: 'application', name: 'niazat-phase8-supply-chain' }] },
      component: {
        type: 'application',
        name: `niazat-${app}`,
        version: lock.version ?? '0.0.0',
      },
    },
    components,
  });
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);
const forbiddenEnvironmentFiles = tracked.filter((path) =>
  /(^|\/)\.env(?:\.(?:local|production|backup))?$/.test(path),
);
assert.deepEqual(forbiddenEnvironmentFiles, [], 'A runtime environment file is tracked by Git.');
const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
];
for (const relative of tracked) {
  if (relative.endsWith('package-lock.json')) continue;
  const file = resolve(root, relative);
  if (statSync(file).size > 1_000_000) continue;
  const content = readFileSync(file, 'utf8');
  assert.ok(!secretPatterns.some((pattern) => pattern.test(content)), `Possible secret in tracked file: ${relative}`);
}

const outputFlag = process.argv.indexOf('--output');
if (outputFlag >= 0) {
  const outputDir = resolve(root, process.argv[outputFlag + 1] ?? '');
  const outputRelative = relative(root, outputDir);
  assert.ok(
    outputRelative && !outputRelative.startsWith('..'),
    'Report output must stay inside the repository and cannot be the repository root.',
  );
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    resolve(outputDir, 'license-inventory.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)}\n`,
  );
  for (const [app, sbom] of sboms) {
    writeFileSync(resolve(outputDir, `${app}.cdx.json`), `${JSON.stringify(sbom, null, 2)}\n`);
  }
}
console.log(`Phase 8 supply-chain policy passed for ${reports.reduce((sum, report) => sum + report.packages, 0)} locked packages.`);
