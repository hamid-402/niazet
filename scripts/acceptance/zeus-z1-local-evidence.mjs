import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const evidence = JSON.parse(read('docs/zeus/z1-foundation-acceptance.json'));
assert.equal(evidence.baseline, '2c701d7');
assert.equal(evidence.phaseAccepted, false);
assert.equal(evidence.productAccepted, false);
assert.equal(evidence.acceptedCommit, null);
for (const field of ['mainDatabaseMigration', 'mainDatabaseFinancialWrites', 'liveProviders', 'accountMerge']) assert.equal(evidence.permission[field], false);
assert.equal(evidence.compatibility.mainWalletFeatureEnabled, false);
for (const [path, expected] of Object.entries(evidence.fileHashes)) assert.equal(createHash('sha256').update(read(path)).digest('hex'), expected, 'Local packet evidence drift: ' + path);
for (const name of ['apiAll', 'webAll', 'apiProduction', 'webProduction']) {
  const report = evidence.reports[name];
  assert.equal(report.processExitCode, 0); assert.equal(report.auditReportVersion, 2);
  assert.equal(report.error, undefined); assert.deepEqual(report.vulnerabilities, {});
  assert.equal(report.metadata.vulnerabilities.total, 0);
}
assert.equal(evidence.acceptance.isolatedPostgres.mainDatabaseConnected, false);
assert.equal(evidence.acceptance.isolatedPostgres.databaseRemoved, true);
assert.equal(evidence.acceptance.isolatedPostgres.passedCases, 17);
assert.equal(evidence.acceptance.isolatedPostgres.httpProductionGuardsWithRealDbSessions, true);
console.log('Z1 local packet evidence matches exact source/lock/guard/test inputs; four clean dated audits. NOT phase/product/CI/live acceptance.');
