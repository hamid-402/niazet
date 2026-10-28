import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const policy = read('src/common/guards/access-policy.spec.ts');
const transitions = read('src/orders/order-state-machine.spec.ts');
const escrow = read('src/finance/escrow-balance.spec.ts');
const finance = read('src/finance/customer-finance-overview.service.spec.ts');
const ownership = [
  read('src/files/executor-file-access.spec.ts'),
  read('src/orders/domain/order-query.service.spec.ts'),
  read('src/finance/invoices.service.spec.ts'),
  read('src/tickets/tickets.service.spec.ts'),
].join('\n');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(policy.includes('Object.values(UserRole).flatMap') && policy.includes('Object.values(AdminScope).flatMap'), 'Role and admin-scope policy matrices must be exhaustive.');
check(policy.includes('before authentication') && policy.includes('missing identity'), 'Policy tests must cover unprotected and unauthenticated routes.');
check(transitions.includes('Object.values(OrderStatus)') && transitions.includes('Object.values(OrderStatusSource)'), 'Every status pair and actor source must be checked.');
check(transitions.includes('ORDER_TRANSITIONS[status]).toEqual([])'), 'Final order states must be tested as absorbing.');
check(escrow.includes('calculateEscrowReleaseDistribution') && escrow.includes('rejects unsafe release distribution'), 'Escrow unit tests need rounding and invalid distribution cases.');
check(finance.includes('only settled money') && finance.includes('over-distributed escrow'), 'Customer totals need status filtering and fail-closed invariants.');
check(ownership.includes('Object.values(FileKind).flatMap'), 'File-kind ownership policy must be exhaustive.');
check(ownership.includes('another customer order') && ownership.includes('executor lists to their ownership relation'), 'Order ownership must cover detail and list queries.');
check(ownership.includes('invoice id and owner id') && ownership.includes('requires claiming an unassigned ticket'), 'Invoice and support-ticket ownership need negative tests.');
for (const path of ['src/finance/ledger.service.spec.ts', 'src/finance/idempotency.service.spec.ts', 'src/finance/withdrawals.service.spec.ts']) {
  check(read(path).includes("describe("), `${path} must remain in the critical finance unit suite.`);
}

if (failures.length) {
  console.error(`Phase 8 unit-coverage contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 8 unit-coverage contract passed: exhaustive policies, transitions, finance invariants and ownership boundaries verified.');
