import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const prismaCli = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const schema = join(process.cwd(), 'prisma', 'schema.prisma');

console.log('[startup] Deploying pending Prisma migrations...');
const migration = spawnSync(
  process.execPath,
  [prismaCli, 'migrate', 'deploy', '--schema', schema],
  { stdio: 'inherit', env: process.env },
);

if (migration.error) {
  console.error('[startup] Could not execute Prisma migrations.', migration.error);
  process.exit(1);
}
if (migration.status !== 0) {
  console.error(`[startup] Prisma migration failed with exit code ${migration.status}.`);
  process.exit(migration.status ?? 1);
}

console.log('[startup] Migrations are current. Starting API...');
const api = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (!api.killed) api.kill(signal);
  });
}

api.on('error', (error) => {
  console.error('[startup] API process failed to start.', error);
  process.exit(1);
});
api.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[startup] API stopped by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
