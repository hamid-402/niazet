import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), api = join(root, 'apps/api'), runtime = resolve(root, '_runtime/apps/api');
const require = createRequire(join(api, 'package.json')), { PrismaClient, Prisma } = require('@prisma/client');
if (process.argv.includes('--compat-client')) {
  const target = new URL(process.env.Z3_IDENTITY_DB), clientPath = resolve(process.env.Z3_IDENTITY_CLIENT);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/niazat_z3_identity_\d+_[a-f0-9]{8}$/); assert(clientPath.startsWith(runtime + sep));
  const oldTables = JSON.parse(process.env.Z3_IDENTITY_OLD_TABLES), generated = require(clientPath);
  const client = new generated.PrismaClient({ datasources: { db: { url: target.toString() } } });
  try {
    const models = generated.Prisma.dmmf.datamodel.models.filter(model => oldTables.includes(model.dbName || model.name));
    assert.equal(models.length, oldTables.length);
    for (const model of models) await client[model.name[0].toLowerCase() + model.name.slice(1)].findFirst();
    const old = await client.user.findUniqueOrThrow({ where: { id: process.env.Z3_IDENTITY_USER } });
    await client.user.update({ where: { id: old.id }, data: { fullName: old.fullName + ' compatibility probe' } });
    await client.user.update({ where: { id: old.id }, data: { fullName: old.fullName, updatedAt: old.updatedAt } });
    assert.equal((await client.order.findUniqueOrThrow({ where: { id: process.env.Z3_IDENTITY_ORDER } })).title, 'Legacy closed order');
    console.log(JSON.stringify({ modelsRead: models.length, previousDataReadWrite: true }));
  } finally { await client.$disconnect(); }
  process.exit(0);
}
assert(!process.argv.includes('--apply-local'), 'This rehearsal cannot apply to the main database');
void Prisma;
const envLine = readFileSync(join(api, '.env'), 'utf8').split(/\r?\n/).find(l => /^DATABASE_URL=/.test(l));
const source = new URL(process.env.DATABASE_URL || envLine.slice(envLine.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2'));
assert(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname));
const name = `niazat_z3_identity_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`; assert.match(name, /^niazat_z3_identity_\d+_[a-f0-9]{8}$/); assert.notEqual(source.pathname, '/' + name);
const target = new URL(source); target.pathname = '/' + name;
const maintenance = new URL(source); maintenance.pathname = '/postgres';
const control = new PrismaClient({ datasources: { db: { url: maintenance.toString() } } });
const withEmail = process.argv.includes('--with-email');
const withCustomerIntake = process.argv.includes('--with-customer-intake');
const temp = mkdtempSync(join(runtime, 'z3-identity-upgrade-')), output = join(root, withCustomerIntake ? '.artifacts/zeus/z3-customer-intake-native' : withEmail ? '.artifacts/zeus/z3-email-native' : '.artifacts/zeus/z3-identity-upgrade'); mkdirSync(output, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const redact = value => String(value).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '<database URL>');
const report = { status: 'running', scope: 'additive-migration-only-not-auth-acceptance', mainDatabaseConnected: false, liveProvidersUsed: false, phaseAccepted: false, cases: [], temporaryDatabaseRemoved: false, generatedFixtureRemoved: false };
let db, created = false, failure;
function cli(args) { const result = spawnSync(process.execPath, [join(api, 'node_modules/prisma/build/index.js'), ...args], { cwd: api, env: { ...process.env, DATABASE_URL: target.toString() }, windowsHide: true, encoding: 'utf8', timeout: 120000 }); assert.equal(result.status, 0, redact(result.stdout + result.stderr).slice(-2000)); }
async function snapshot(tables) {
  const result = {};
  for (const table of tables) { assert.match(table, /^[a-z_]+$/); const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY row_to_json(t)::text`); const columns = await db.$queryRaw`SELECT column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} ORDER BY ordinal_position`; result[table] = { rows: rows.length, hash: sha(JSON.stringify(rows)), columns }; }
  return result;
}
try {
  const schema = execFileSync('git', ['show', 'c166209:apps/api/prisma/schema.prisma'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const withOutput = (source, folder) => source.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = ' + JSON.stringify(join(temp, folder).replaceAll('\\', '/')));
  const priorSchema = withOutput(schema, 'prior-client'); assert.notEqual(priorSchema, schema);
  writeFileSync(join(temp, 'schema.prisma'), priorSchema); mkdirSync(join(temp, 'migrations'));
  const migrations = join(api, 'prisma/migrations'), all = readdirSync(migrations).filter(n => /^\d/.test(n)).sort(), old = all.filter(n => n <= '20261027180000_zeus_output_publications');
  assert.equal(old.length, 27); assert.equal(all.length, 28); assert.equal(all.at(-1), '20261028120000_zeus_verified_identity_intake');
  cpSync(join(migrations, 'migration_lock.toml'), join(temp, 'migrations/migration_lock.toml'));
  for (const entry of old) cpSync(join(migrations, entry), join(temp, 'migrations', entry), { recursive: true });
  const config = join(temp, 'prisma.config.ts'); writeFileSync(config, `import {defineConfig} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(join(temp, 'schema.prisma'))},migrations:{path:${JSON.stringify(join(temp, 'migrations'))}},datasource:{url:process.env.DATABASE_URL!}});`);
  const candidateSchema = readFileSync(join(api, 'prisma/schema.prisma'), 'utf8');
  const candidateWithOutput = withOutput(candidateSchema, 'candidate-client'); assert.notEqual(candidateWithOutput, candidateSchema);
  writeFileSync(join(temp, 'candidate.prisma'), candidateWithOutput);
  const candidateConfig = join(temp, 'candidate.config.ts'); writeFileSync(candidateConfig, `import {defineConfig} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(join(temp, 'candidate.prisma'))},datasource:{url:process.env.DATABASE_URL!}});`);
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  cli(['migrate', 'deploy', '--config', config]);
  db = new PrismaClient({ datasources: { db: { url: target.toString() } } }); assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, name);
  const owner = await db.user.create({ data: { phone: '09199000001', email: 'Legacy@Example.com', fullName: 'Legacy owner', role: 'customer', status: 'active' } });
  const other = await db.user.create({ data: { phone: '09199000002', email: 'legacy@example.com', fullName: 'Case-sensitive legacy account', role: 'customer', status: 'active' } });
  const service = await db.serviceLine.create({ data: { slug: 'identity-migration-fixture', title: 'Legacy catalog', category: 'test', description: 'Isolated only', pricingModel: 'fixed', basePrice: 100 } });
  const order = await db.order.create({ data: { code: randomUUID(), customerId: owner.id, serviceId: service.id, title: 'Legacy closed order', briefDescription: 'Legacy requirements', status: 'closed' } });
  const tables = (await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`).map(r => r.tablename);
  const before = await snapshot(tables); assert(tables.length >= 78);
  cli(['generate', '--config', config]); cli(['generate', '--config', candidateConfig]);
  function compatibilityClient(folder) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--compat-client'], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000, env: { ...process.env, Z3_IDENTITY_DB: target.toString(), Z3_IDENTITY_CLIENT: join(temp, folder), Z3_IDENTITY_OLD_TABLES: JSON.stringify(tables), Z3_IDENTITY_USER: owner.id, Z3_IDENTITY_ORDER: order.id } });
    assert.equal(result.status, 0, redact(result.stderr).slice(-2000)); const proof = JSON.parse(result.stdout.trim()); assert.equal(proof.modelsRead, tables.length); assert.equal(proof.previousDataReadWrite, true); return proof;
  }
  report.candidateClientAgainstOldDatabase = compatibilityClient('candidate-client'); assert.deepEqual(await snapshot(tables), before);
  cli(['migrate', 'deploy']); cli(['migrate', 'deploy']); assert.deepEqual(await snapshot(tables), before);
  report.previousClientAgainstNewDatabase = compatibilityClient('prior-client'); assert.deepEqual(await snapshot(tables), before);
  const oldUser = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  await db.user.update({ where: { id: owner.id }, data: { fullName: oldUser.fullName + ' probe' } });
  await db.user.update({ where: { id: owner.id }, data: { fullName: oldUser.fullName, updatedAt: oldUser.updatedAt } });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).title, 'Legacy closed order'); assert.deepEqual(await snapshot(tables), before);
  for (const table of ['email_login_identities', 'email_login_challenges', 'email_login_families', 'customer_onboarding_states', 'order_intakes']) assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${table}"`))[0].count, 0);
  report.previousTablesPreserved = tables.length; report.previousRowsAndColumnsUnchanged = true; report.previousGeneratedClientReadWrite = true; report.migrationCount = 28; report.cases.push('populated_upgrade_preserves_every_old_table_and_real_previous_generated_client_without_backfill');
  const identity = randomUUID();
  await db.$executeRaw`INSERT INTO email_login_identities(id,user_id,email_normalized,verified_at,updated_at) VALUES (${identity},${owner.id},'verified@example.com',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  await assert.rejects(() => db.$executeRaw`INSERT INTO email_login_identities(id,user_id,email_normalized,verified_at,updated_at) VALUES (${randomUUID()},${other.id},'verified@example.com',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  await assert.rejects(() => db.$executeRaw`UPDATE email_login_identities SET email_normalized='other@example.com' WHERE id=${identity}`);
  const challenge = randomUUID();
  await db.$executeRaw`INSERT INTO email_login_challenges(id,user_id,email_normalized,token_hash,expires_at) VALUES (${challenge},${owner.id},'verified@example.com',${'a'.repeat(64)},CURRENT_TIMESTAMP+INTERVAL '15 minutes')`;
  await assert.rejects(() => db.$executeRaw`UPDATE email_login_challenges SET expires_at=expires_at+INTERVAL '1 hour' WHERE id=${challenge}`);
  await db.$executeRaw`UPDATE email_login_challenges SET consumed_at=CURRENT_TIMESTAMP,verified_identity_id=${identity} WHERE id=${challenge}`;
  await assert.rejects(() => db.$executeRaw`UPDATE email_login_challenges SET consumed_at=NULL WHERE id=${challenge}`);
  report.cases.push('database_enforces_unique_verified_identity_immutable_binding_and_one_time_nonextendable_challenge');
  await assert.rejects(() => db.$executeRaw`INSERT INTO customer_onboarding_states(user_id,purpose,skipped,updated_at) VALUES (${owner.id},'executor',FALSE,CURRENT_TIMESTAMP)`);
  await db.$executeRaw`INSERT INTO customer_onboarding_states(user_id,purpose,skipped,updated_at) VALUES (${owner.id},'interested_in_collaboration',FALSE,CURRENT_TIMESTAMP)`;
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role, 'customer'); assert.equal(await db.userCapability.count({ where: { userId: owner.id } }), 0);
  report.cases.push('bounded_onboarding_does_not_grant_executor_role_or_capability');
  await assert.rejects(() => db.$executeRaw`INSERT INTO order_intakes(order_id,order_version,data,updated_at) VALUES (${order.id},0,'{"version":1}'::jsonb,CURRENT_TIMESTAMP)`);
  const draft = await db.order.create({ data: { code: randomUUID(), customerId: owner.id, serviceId: service.id, title: 'Draft intake fixture', briefDescription: 'Isolated constraint probe', status: 'draft' } });
  await assert.rejects(() => db.$executeRaw`INSERT INTO order_intakes(order_id,order_version,data,updated_at) VALUES (${draft.id},9,'{"version":1}'::jsonb,CURRENT_TIMESTAMP)`);
  await db.$executeRaw`INSERT INTO order_intakes(order_id,order_version,data,updated_at) VALUES (${draft.id},0,'{"version":1,"goal":"customer data"}'::jsonb,CURRENT_TIMESTAMP)`;
  // Direct state write only in this isolated DB-constraint fixture, NOT a
  // product command or acceptance of a state-machine/permission bypass.
  await db.order.update({ where: { id: draft.id }, data: { status: 'submitted', version: 1 } });
  await db.$executeRaw`UPDATE order_intakes SET order_version=1,sealed_at=CURRENT_TIMESTAMP WHERE order_id=${draft.id}`;
  await assert.rejects(() => db.$executeRaw`UPDATE order_intakes SET data='{"version":1,"goal":"changed"}'::jsonb WHERE order_id=${draft.id}`);
  await assert.rejects(() => db.$executeRaw`DELETE FROM order_intakes WHERE order_id=${draft.id}`);
  report.cases.push('intake_binds_draft_and_actual_order_version_then_seals_immutably_without_legacy_backfill');
  if (withEmail) { const { verifyEmailNative } = await import('./zeus-z3-email-native.mjs'); report.email = await verifyEmailNative({ db, root }); }
  if (withCustomerIntake) { const { verifyCustomerIntakeNative } = await import('./zeus-z3-customer-intake-native.mjs'); report.customerIntake = await verifyCustomerIntakeNative({ db, root }); }
  report.status = 'passed';
  report.sourceHashes = Object.fromEntries(['apps/api/prisma/schema.prisma','apps/api/prisma/migrations/20261028120000_zeus_verified_identity_intake/migration.sql','apps/api/src/auth/verified-identifier-contract.ts','apps/api/src/orders/order-intake-contract.ts'].map(p => [p,sha(readFileSync(join(root,p),'utf8').replaceAll('\r\n','\n'))]));
} catch (error) { failure = error; report.status = 'failed'; report.failure = redact(error.stack ?? error); }
finally {
  await db?.$disconnect();
  if (created) { assert.match(name, /^niazat_z3_identity_\d+_[a-f0-9]{8}$/); assert.notEqual(source.pathname, '/' + name); await control.$queryRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',name); await control.$executeRawUnsafe(`DROP DATABASE "${name}"`); report.temporaryDatabaseRemoved = true; }
  await control.$disconnect(); assert(resolve(temp).startsWith(runtime+sep)); assert.match(basename(temp), /^z3-identity-upgrade-/); rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200}); report.generatedFixtureRemoved = true;
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if (failure) throw new Error(report.failure);
console.log(JSON.stringify({status:report.status,cases:report.cases.length,oldTables:report.previousTablesPreserved,mainDatabaseConnected:false,phaseAccepted:false}));
