import assert from 'node:assert/strict';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const ciCommands = [
  ['scripts/acceptance/zeus-wallet-postgres.mjs'],
  ['scripts/acceptance/zeus-z1-phase-http.mjs'],
  ['scripts/acceptance/zeus-z1-data-upgrade.mjs', '--rehearse'],
];
export function ciFixture(environment) {
  assert.equal(environment.CI, 'true', 'CI-only fixture');
  assert.equal(environment.GITHUB_ACTIONS, 'true', 'GitHub Actions only');
  const database = new URL(environment.DATABASE_URL);
  assert.equal(database.protocol, 'postgresql:'); assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname, '/niazat_ci');
  const values = {
    DATABASE_URL: environment.DATABASE_URL,
    // Only the old upgrade tool reads this file. Spawned APIs force test and
    // create random isolated DBs; no --apply-local command exists here.
    NODE_ENV: 'development', BACKGROUND_JOBS_ENABLED: 'false', LIVE_PROVIDERS_ENABLED: 'false',
    PAYMENT_GATEWAY_DRIVER: 'mock', SMS_DRIVER: 'mock', EMAIL_DRIVER: 'mock',
    FILE_SCAN_DRIVER: 'mock', STORAGE_DRIVER: 'local', ZEUS_WALLET_ENABLED: 'true',
  };
  assert(Object.values(values).every(v => !String(v).includes('\n') && !String(v).includes('\r')));
  return Object.entries(values).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n';
}
export function runCi(environment = process.env) {
  const text = ciFixture(environment), path = resolve(root, 'apps/api/.env');
  assert(!existsSync(path), 'Never overwrite an existing developer/runner env');
  let created = false;
  try {
    writeFileSync(path, text, { flag: 'wx', mode: 0o600 }); created = true;
    for (const args of ciCommands) {
      const result = spawnSync(process.execPath, args, { cwd: root, env: environment, stdio: 'inherit', windowsHide: true, timeout: 180000 });
      assert.equal(result.status, 0, `Z1 CI acceptance failed: ${args[0]}`);
    }
  } finally { if (created) unlinkSync(path); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCi();
