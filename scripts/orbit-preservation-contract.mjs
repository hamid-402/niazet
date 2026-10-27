import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { matchesInvoiceApproval, verifyInvoiceDomain } from './orbit-invoice-approval.mjs';
import { matchesPricingApproval, verifyPricingApproval } from './orbit-pricing-approval.mjs';
import { matchesReconciliationApproval, verifyReconciliationApproval } from './orbit-reconciliation-approval.mjs';
import { matchesParserApproval, verifyParserApproval } from './orbit-parser-approval.mjs';
import { matchesSecurityApproval, verifySecurityApproval } from './orbit-security-approval.mjs';
import { matchesZ1DomainApproval, verifyZ1DomainApproval } from './orbit-z1-domain-approval.mjs';
import { verifyWalletUiApproval, walletUiOriginalRef } from './orbit-wallet-ui-approval.mjs';
import { matchesZ1ContractApproval, verifyZ1ContractApproval } from './orbit-z1-contract-approval.mjs';
import { matchesZ1DataApproval, verifyZ1DataApproval } from './orbit-z1-data-approval.mjs';
import { matchesZ2EngineApproval, verifyZ2EngineApproval, verifyZ2GuardWiring, z2EngineOriginalRef } from './orbit-z2-engine-approval.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Fixed pre-redesign checkpoint. Never silently rebase this gate to HEAD.
const baseline = '2c701d7';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const split = (value) => value.split('\0').filter(Boolean);
const protectedPath = (path) => path.startsWith('apps/api/') || [
  'apps/web/src/lib/api.ts', 'apps/web/src/lib/server-api.ts',
  'apps/web/src/lib/auth-context.tsx', 'apps/web/src/lib/role-paths.ts',
  'apps/web/src/lib/types.ts', 'apps/web/src/lib/themes.ts',
].includes(path);

function violations(files, present, changed, approved = () => false) {
  return [
    ...files.filter((path) => !present(path)).map((path) => `Baseline file missing: ${path}`),
    ...changed.filter(path => protectedPath(path) && !approved(path)).map((path) => `Protected domain/auth contract changed: ${path}`),
  ];
}

// Negative tests exercise detection without deleting or modifying project files.
assert.deepEqual(violations(['page.tsx'], () => true, ['apps/web/src/app/page.tsx']), []);
assert.equal(violations(['page.tsx'], () => false, []).length, 1);
assert.equal(violations([], () => true, ['apps/api/prisma/schema.prisma']).length, 1);
assert.equal(violations([], () => true, ['apps/web/src/lib/auth-context.tsx']).length, 1);
assert.equal(violations([], () => true, ['apps/api/src/pricing/unapproved.ts']).length, 1);

try {
  const files = split(git('ls-tree', '-r', '--name-only', '-z', baseline));
  assert.ok(files.length > 0, 'Missing baseline history. CI checkout needs fetch-depth: 0.');
  // Include newly created files, not only tracked diff. Untracked API code is
  // subject to the same exact pins; leaving it unstaged cannot bypass the gate.
  const changed = [...new Set([
    ...split(git('diff', '--name-only', '--no-renames', '-z', baseline, '--')),
    ...split(git('ls-files', '--others', '--exclude-standard', '-z')),
  ])];
  const tracked = new Set(split(git('ls-files', '-z')));
  const read = path => readFileSync(new URL(path, new URL('../', import.meta.url)));
  verifyParserApproval(read);
  verifySecurityApproval(read);
  verifyZ1DomainApproval(path => git('show', `${baseline}:${path}`), read);
  verifyWalletUiApproval(path => git('show', `${walletUiOriginalRef}:${path}`), read);
  verifyZ1ContractApproval((ref, path) => git('show', `${ref}:${path}`), read);
  verifyZ1DataApproval(path => git('show', `${baseline}:${path}`), read);
  verifyZ2EngineApproval(read);
  verifyZ2GuardWiring(git('show', `${z2EngineOriginalRef}:scripts/orbit-preservation-contract.mjs`), read('scripts/orbit-preservation-contract.mjs'));
  verifyInvoiceDomain(path => git('show', `${baseline}:${path}`), path => read(path).toString('utf8'));
  verifyPricingApproval(path => git('show', `${baseline}:${path}`), read);
  verifyReconciliationApproval(path => git('show', `${baseline}:${path}`), read);
const failures = violations(files, (path) => tracked.has(path) && existsSync(new URL(path, new URL('../', import.meta.url))), changed, path => existsSync(new URL(path, new URL('../', import.meta.url))) && (matchesInvoiceApproval(path, read(path)) || matchesPricingApproval(path, read(path)) || matchesReconciliationApproval(path, read(path)) || matchesParserApproval(path, read(path)) || matchesSecurityApproval(path, read(path)) || matchesZ1DomainApproval(path, read(path)) || matchesZ1ContractApproval(path, read(path)) || matchesZ1DataApproval(path, read(path)) || matchesZ2EngineApproval(path, read(path))));
  const routes = files.filter((path) => path.startsWith('apps/web/src/app/') && path.endsWith('/page.tsx'));
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log('Z2-B1: five exact additive engine files accepted; no order/payment/DB activation.');
  console.log(`Orbit preservation passed: ${files.length} baseline files, ${routes.length} page routes retained; only exact owner-approved invoice/pricing/diagnosis/parser/security/Z1 domain packets accepted; original baseline and earlier checks retained; 5 guard self-tests passed (including untracked API). Main DB migration/live activation is NOT accepted by this structural gate.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
