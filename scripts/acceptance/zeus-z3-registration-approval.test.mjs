import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { registrationOriginalRef, registrationApiPins, registrationAdapterPins, registrationHash, matchesRegistrationApproval, inverseRegistrationInput, verifyRegistrationApproval } from '../orbit-z3-registration-approval.mjs';
import { inverseCustomerContinuation, verifyCustomerContinuation } from '../orbit-z3-customer-continuation-approval.mjs';

const root = new URL('../../', import.meta.url);
const rawRead = p => readFileSync(new URL(p, root));
const read = p => inverseCustomerContinuation(p, rawRead(p));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const old = p => git('show', registrationOriginalRef + ':' + p);
const text = b => b.toString('utf8').replaceAll('\r\n', '\n');
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ts = require('typescript');
const parse = source => ts.createSourceFile('input.ts', text(source), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter({ removeComments: true });
const canonical = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile()).replace(/\s+/g, ' ');
const walk = (node, predicate) => { const found = []; const visit = n => { if (predicate(n)) found.push(n); ts.forEachChild(n, visit); }; visit(node); return found; };
const methods = bytes => Object.fromEntries(walk(parse(bytes), ts.isMethodDeclaration).map(n => [n.name.getText(), n]));

test('registration has exactly the approved nine API paths and fixed checkpoint', () => {
  verifyCustomerContinuation(rawRead);
  assert.equal(registrationOriginalRef, '7e5409f');
  assert.deepEqual(Object.keys(registrationApiPins).sort(), [
    'orders/order-state-machine.ts', 'orders/domain/order-workflow.service.ts',
    'orders/domain/fixed-registration-eligibility.ts', 'orders/domain/fixed-registration-eligibility.spec.ts',
    'pricing/commercial.controller.ts', 'pricing/commercial.dto.ts', 'pricing/commercial.module.ts',
    'pricing/commercial.service.ts', 'pricing/fixed-registration.service.ts',
  ].map(p => 'apps/api/src/' + p).sort());
  assert.deepEqual(Object.keys(registrationAdapterPins).sort(), [
    'scripts/orbit-preservation-contract.mjs', 'scripts/orbit-z3-publication-ui-approval.mjs',
    'scripts/acceptance/zeus-z1-dependency-review.mjs', 'scripts/acceptance/zeus-z2-postgres.mjs',
    'scripts/acceptance/zeus-z3-registration-cases.mjs',
  ].sort());
  verifyRegistrationApproval(read);
});

test('all pins reject a one-byte mutation, missing bytes and missing files; only CRLF is normalized', () => {
  for (const [p, pin] of Object.entries({ ...registrationApiPins, ...registrationAdapterPins })) {
    const current = read(p), mutated = Buffer.from(current); mutated[0] ^= 1;
    for (const bytes of [mutated, Buffer.alloc(0)]) {
      assert.equal(matchesRegistrationApproval(p, bytes), false);
      assert.strictEqual(inverseRegistrationInput(p, bytes), bytes);
      assert.throws(() => verifyRegistrationApproval(path => path === p ? bytes : read(path)), /pin drift/);
    }
    assert.throws(() => verifyRegistrationApproval(path => { if (path === p) throw new Error('missing file'); return read(path); }), /missing file/);
    assert.equal(registrationHash(Buffer.from(text(current).replaceAll('\n', '\r\n'))), pin.after);
    if (pin.before !== null) assert.equal(text(inverseRegistrationInput(p, current)), text(old(p)));
    else assert.strictEqual(inverseRegistrationInput(p, current), current);
  }
  for (const p of ['__proto__', 'apps/api/src/finance/ledger.service.ts', 'apps/api/src/auth/auth.service.ts', 'apps/api/prisma/../schema.prisma', 'apps/api/src/pricing/unknown.ts', '/apps/api/src/pricing/fixed-registration.service.ts']) {
    const bytes = Buffer.from('unapproved'); assert.equal(matchesRegistrationApproval(p, bytes), false);
    assert.strictEqual(inverseRegistrationInput(p, bytes), bytes);
  }
});

test('every API file outside the nine approved paths is byte-identical, including all auth/role/money/schema files', () => {
  const baseline = git('ls-tree', '-r', '--name-only', registrationOriginalRef, '--', 'apps/api/').trim().split('\n');
  assert(baseline.length > 200);
  for (const p of baseline) if (!Object.hasOwn(registrationApiPins, p)) assert.equal(text(read(p)), text(old(p)), 'Unapproved API change: ' + p);
  const added = git('ls-files', '--others', '--exclude-standard', '--', 'apps/api/').trim().split('\n').filter(Boolean);
  for (const p of added) assert(matchesRegistrationApproval(p, read(p)), 'Unapproved new API path: ' + p);
  for (const p of ['apps/web/src/lib/auth-context.tsx', 'apps/web/src/lib/api.ts', 'apps/web/src/lib/role-paths.ts', 'apps/web/src/lib/types.ts']) assert.equal(text(read(p)), text(old(p)));
});

test('entire state graph is unchanged; only customer pending_triage -> triaging source is added', () => {
  const p = 'apps/api/src/orders/order-state-machine.ts';
  function evaluate(bytes) {
    const output = ts.transpileModule(text(bytes), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} }; new Function('require', 'module', 'exports', output)(require, module, module.exports); return module.exports;
  }
  const before = evaluate(old(p)), after = evaluate(read(p));
  assert.deepEqual(after.ORDER_TRANSITIONS, before.ORDER_TRANSITIONS);
  const expected = structuredClone(before.ORDER_TRANSITION_SOURCES);
  expected.pending_triage.triaging.push('customer');
  assert.deepEqual(after.ORDER_TRANSITION_SOURCES, expected);
  assert.equal(after.isTransitionAllowedForSource('pending_triage', 'triaging', 'system'), false);
  for (const from of Object.keys(before.ORDER_TRANSITIONS)) for (const to of Object.keys(before.ORDER_TRANSITIONS)) for (const source of ['customer', 'admin', 'system', 'executor', 'support']) {
    if (from === 'pending_triage' && to === 'triaging' && source === 'customer') continue;
    assert.equal(after.isTransitionAllowedForSource(from, to, source), before.isTransitionAllowedForSource(from, to, source), `${from}/${to}/${source}`);
  }
});

test('workflow keeps every old method and transition statement; only the eligibility gate is inserted', () => {
  const p = 'apps/api/src/orders/domain/order-workflow.service.ts', before = methods(old(p)), after = methods(read(p));
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const name of Object.keys(before)) {
    if (name !== 'transition') { assert.equal(canonical(after[name]), canonical(before[name]), name); continue; }
    const source = text(read(p));
    const additions = walk(after[name], n => ts.isIfStatement(n) && n.expression.getText().includes('OrderStatus.pending_triage') && n.thenStatement.getText().includes('assertFixedRegistrationEligibility'));
    assert.equal(additions.length, 1);
    assert.equal(canonical(additions[0].expression), 'order.status === OrderStatus.pending_triage && toStatus === OrderStatus.triaging && source === OrderStatusSource.customer');
    assert.equal(canonical(additions[0].thenStatement), 'await assertFixedRegistrationEligibility(client, order);');
    const restored = source.slice(0, additions[0].pos) + source.slice(additions[0].end);
    assert.equal(canonical(methods(restored).transition), canonical(before.transition));
  }
});

test('commercial offer work body and all other methods are unchanged; no HTTP transaction bypass input', () => {
  const p = 'apps/api/src/pricing/commercial.service.ts', before = methods(old(p)), after = methods(read(p));
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const name of Object.keys(before)) if (name !== 'offer') assert.equal(canonical(after[name]), canonical(before[name]), name);
  const previous = walk(before.offer, n => ts.isPropertyAssignment(n) && n.name.getText() === 'work');
  const current = walk(after.offer, n => ts.isVariableDeclaration(n) && n.name.getText() === 'work');
  assert.equal(previous.length, 1); assert.equal(current.length, 1);
  assert.equal(canonical(current[0].initializer.body), canonical(previous[0].initializer.body));
  const controller = text(read('apps/api/src/pricing/commercial.controller.ts'));
  assert(!controller.includes('existingTransaction'));
  const dto = text(read('apps/api/src/pricing/commercial.dto.ts'));
  assert(!dto.includes('existingTransaction'));
});

test('old guard baseline, assertions and scoped approvals are retained; adapter changes have exact inverse', () => {
  const p = 'scripts/orbit-preservation-contract.mjs';
  let source = text(read(p));
  for (const addition of [
    "import { matchesRegistrationApproval, verifyRegistrationApproval } from './orbit-z3-registration-approval.mjs';\n",
    '  verifyRegistrationApproval(read);\n',
    ' || matchesRegistrationApproval(path, read(path))',
  ]) { assert.equal(source.split(addition).length, 2); source = source.replace(addition, ''); }
  assert.equal(source, text(old(p)));
  assert(source.includes("const baseline = '2c701d7'"));
  const assertions = bytes => walk(parse(bytes), n => ts.isCallExpression(n) && /^assert(?:\.|$)/.test(n.expression.getText())).map(canonical);
  const historicalReviewer = 'scripts/acceptance/zeus-z1-dependency-review.mjs';
  let reviewerSource = text(read(historicalReviewer));
  for (const addition of [
    "import { matchesRegistrationApproval } from '../orbit-z3-registration-approval.mjs';\n",
    ' || matchesRegistrationApproval(path, readFileSync(new URL(path, root)))',
  ]) { assert.equal(reviewerSource.split(addition).length, 2); reviewerSource = reviewerSource.replace(addition, ''); }
  assert.equal(reviewerSource, text(old(historicalReviewer)), 'Historical reviewer changed outside exact registration recognition');
  for (const path of ['scripts/acceptance/zeus-z2-postgres.mjs']) {
    const calls = assertions(read(path));
    for (const call of assertions(old(path))) { const index = calls.indexOf(call); assert(index >= 0, 'Historical assertion removed: ' + call); calls.splice(index, 1); }
  }
});

test('all historical certificates remain untouched and never certify current registration source', () => {
  for (const p of ['docs/zeus/z0-acceptance.json', 'docs/zeus/z1-phase-acceptance.json', 'docs/zeus/z2-phase-acceptance.json', 'docs/zeus/z3-composer-acceptance.json', 'docs/zeus/z3-qc-acceptance.json', 'docs/zeus/z3-publication-ui-acceptance.json']) assert.equal(text(read(p)), text(old(p)));
  const runner = text(read('scripts/acceptance/zeus-z2-postgres.mjs'));
  assert(runner.includes('historicalReceiptIsCurrentAcceptance: false'));
  assert(runner.includes("registrationMode ? '.artifacts/zeus/z3-registration' : '.artifacts/zeus/z3-historical-z2'"));
});
