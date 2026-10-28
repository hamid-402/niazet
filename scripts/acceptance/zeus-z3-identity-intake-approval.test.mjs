import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { identityIntakeOriginalRef, identityIntakeApiPins, identityIntakeAdapterPins, identityIntakeHash, matchesIdentityIntake, inverseIdentityIntake, verifyIdentityIntake } from '../orbit-z3-identity-intake-approval.mjs';
import { prismaModels } from './zeus-z0-domain-contracts.mjs';

const root = new URL('../../', import.meta.url), read = p => readFileSync(new URL(p, root));
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true });
const old = p => git('show', identityIntakeOriginalRef + ':' + p);
const text = b => b.toString('utf8').replaceAll('\r\n', '\n');
const req = createRequire(new URL('../../apps/api/package.json', import.meta.url)), ts = req('typescript');
const parse = bytes => ts.createSourceFile('input.ts', text(bytes), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter({ removeComments: true });
const canonical = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
const walk = (node, predicate) => { const found = []; const visit = n => { if (predicate(n)) found.push(n); ts.forEachChild(n, visit); }; visit(node); return found; };
const methods = bytes => Object.fromEntries(walk(parse(bytes), ts.isMethodDeclaration).map(node => [node.name.getText(), node]));

test('identity/intake uses the explicit 28 API paths, five adapters and immutable c166209 checkpoint', () => {
  assert.equal(identityIntakeOriginalRef, 'c166209'); verifyIdentityIntake(read);
  assert.deepEqual(Object.keys(identityIntakeApiPins).sort(), [
    'prisma/schema.prisma', 'prisma/migrations/20261028120000_zeus_verified_identity_intake/migration.sql',
    'src/account/account.module.ts', 'src/account/account.service.ts', 'src/account/customer-intake-config.ts',
    'src/account/customer-onboarding.controller.ts', 'src/account/customer-onboarding.service.ts',
    'src/account/customer-private-data.ts', 'src/account/customer-private-data.spec.ts', 'src/account/dto/onboarding.dto.ts',
    'src/auth/auth.module.ts', 'src/auth/auth.service.ts', 'src/auth/auth-session.service.ts',
    'src/auth/dto/verified-email.dto.ts', 'src/auth/verified-email.controller.ts', 'src/auth/verified-email.service.ts',
    'src/auth/verified-email-session.ts', 'src/auth/verified-email-session.spec.ts',
    'src/auth/verified-identifier-contract.ts', 'src/auth/verified-identifier-contract.spec.ts',
    'src/orders/orders.service.ts', 'src/orders/orders.admin.controller.ts', 'src/orders/dto/order.dto.ts',
    'src/orders/order-intake-contract.ts', 'src/orders/order-intake-contract.spec.ts',
    'src/orders/domain/order-intake.ts', 'src/orders/domain/order-intake.spec.ts', 'src/orders/domain/fixed-registration-eligibility.ts',
  ].map(p => 'apps/api/' + p).sort());
  assert.deepEqual(Object.keys(identityIntakeAdapterPins).sort(), [
    'scripts/orbit-preservation-contract.mjs', 'scripts/orbit-z3-customer-continuation-approval.mjs',
    'scripts/acceptance/zeus-z1-dependency-review.mjs', 'scripts/acceptance/zeus-z3-registration-approval.test.mjs',
    'scripts/acceptance/zeus-z3-publication-ui-approval.test.mjs',
  ].sort());
});
test('every byte mutation or absent file fails; an exact historical inverse is never a current acceptance', () => {
  for (const [path, pin] of Object.entries({ ...identityIntakeApiPins, ...identityIntakeAdapterPins })) {
    const bytes = read(path), mutated = Buffer.from(bytes); mutated[0] ^= 1;
    for (const bad of [mutated, Buffer.alloc(0), Buffer.concat([bytes, Buffer.from(' ')])]) {
      assert.equal(matchesIdentityIntake(path, bad), false); assert.strictEqual(inverseIdentityIntake(path, bad), bad);
      assert.throws(() => verifyIdentityIntake(p => p === path ? bad : read(p)), /pin drift/);
    }
    assert.throws(() => verifyIdentityIntake(p => { if (p === path) throw new Error('missing'); return read(p); }), /missing/);
    assert.equal(identityIntakeHash(Buffer.from(text(bytes).replaceAll('\n', '\r\n'))), pin.after);
    if (pin.before === null) assert.strictEqual(inverseIdentityIntake(path, bytes), bytes);
    else assert.equal(text(inverseIdentityIntake(path, bytes)), text(old(path)));
  }
  for (const path of ['__proto__', 'apps/api/src/finance/ledger.service.ts', 'apps/api/src/auth/auth.controller.ts', 'apps/api/prisma/../schema.prisma', '/apps/api/src/auth/auth.service.ts']) {
    const bytes = Buffer.from('unapproved'); assert(!matchesIdentityIntake(path, bytes)); assert.strictEqual(inverseIdentityIntake(path, bytes), bytes);
  }
});
test('every API file outside the exact scope is unchanged, including all Ledger/role/guard/state/payment code', () => {
  const previous = text(git('ls-tree', '-r', '--name-only', identityIntakeOriginalRef, '--', 'apps/api/')).trim().split('\n'); assert(previous.length > 200);
  for (const path of previous) if (!Object.hasOwn(identityIntakeApiPins, path)) assert(read(path).equals(old(path)) || text(read(path)) === text(old(path)), 'Unapproved API change: ' + path);
  const current = text(git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/api/')).trim().split('\n');
  for (const path of current.filter(p => p && !previous.includes(p))) assert(matchesIdentityIntake(path, read(path)), 'Unapproved added API: ' + path);
});
test('all existing schema scalar fields, model definitions and enums are preserved; only five models and relations are added', () => {
  // Use the already-tested repository parser; no installation or unstable
  // private Prisma dependency is required. The native runner separately proves
  // actual database columns and old/new generated clients on both schemas.
  const [priorText, currentText] = [old('apps/api/prisma/schema.prisma'), read('apps/api/prisma/schema.prisma')].map(text);
  const [before, after] = [priorText, currentText].map(prismaModels);
  const enums = source => [...source.matchAll(/^enum \w+ \{\n[\s\S]*?^\}/gm)].map(match => match[0]);
  const stable = model => ({ ...model, fields: model.fields.map(({ line, ...field }) => field) });
  const added = new Set(['EmailLoginIdentity', 'EmailLoginChallenge', 'EmailLoginFamily', 'CustomerOnboardingState', 'OrderIntake']);
  assert.equal(after.length - before.length, 5); assert.deepEqual(enums(currentText), enums(priorText));
  assert.deepEqual(after.filter(model => !before.some(row => row.name === model.name)).map(model => model.name).sort(), [...added].sort());
  for (const model of before) {
    const candidate = after.find(row => row.name === model.name); assert(candidate);
    const relationAdditions = candidate.fields.filter(field => !model.fields.some(oldField => oldField.ref === field.ref));
    assert(relationAdditions.every(field => added.has(field.type.replace(/[?\[\]]/g, '')) && ['User', 'Order'].includes(model.name)));
    assert.deepEqual(stable({ ...candidate, fields: candidate.fields.filter(field => !relationAdditions.includes(field)) }), stable(model));
  }
});
test('all auth methods except the four explicitly extended session methods and login retain their AST', () => {
  for (const [file, allowed] of [['auth/auth.service.ts', ['login']], ['auth/auth-session.service.ts', ['issue', 'refresh', 'loadSessionUser', 'listActive']], ['account/account.service.ts', ['exportData']]]) {
    const path = 'apps/api/src/' + file, before = methods(old(path)), after = methods(read(path)); assert.deepEqual(Object.keys(after), Object.keys(before));
    for (const name of Object.keys(before)) if (!allowed.includes(name)) assert.equal(canonical(after[name]), canonical(before[name]), file + ':' + name);
  }
  const path = 'apps/api/src/auth/auth.service.ts', before = methods(old(path)).login, after = methods(read(path)).login;
  assert.equal(after.parameters.length, before.parameters.length + 1);
  const additions = after.body.statements.filter(statement => ts.isIfStatement(statement) && statement.expression.getText() === 'emailClaim !== undefined'); assert.equal(additions.length, 1);
  assert.deepEqual(after.body.statements.filter(s => s !== additions[0]).map(canonical), before.body.statements.map(canonical));
});
test('all unrelated order operations, money transitions and old export sections remain unchanged', () => {
  const path = 'apps/api/src/orders/orders.service.ts', before = methods(old(path)), after = methods(read(path));
  assert.deepEqual(Object.keys(after).filter(name => !Object.hasOwn(before, name)), ['intakeForOps']);
  const allowed = new Set(['createDraft', 'updateDraft', 'submit', 'findOneForCustomer', 'findOneForExecutor']);
  for (const name of Object.keys(before)) { assert(after[name], 'Missing order method: ' + name); if (!allowed.has(name)) assert.equal(canonical(after[name]), canonical(before[name]), name); }
  const account = 'apps/api/src/account/account.service.ts', prior = methods(old(account)).exportData, current = methods(read(account)).exportData;
  assert.deepEqual(current.body.statements.slice(0, -1).map(canonical), prior.body.statements.slice(0, -1).map(canonical));
  const priorReturn = prior.body.statements.at(-1).expression.properties.map(canonical), currentReturn = current.body.statements.at(-1).expression.properties;
  assert.deepEqual(currentReturn.slice(0, -1).map(canonical), priorReturn); assert(ts.isSpreadAssignment(currentReturn.at(-1)));
});
test('historical guard wiring is additive, baseline stays fixed and no old assertions are removed', () => {
  const path = 'scripts/orbit-preservation-contract.mjs'; let source = text(read(path));
  source = source.replace("import { inverseIdentityIntake, matchesIdentityIntake, verifyIdentityIntake } from './orbit-z3-identity-intake-approval.mjs';\n", '')
    .replace('  verifyIdentityIntake(rawRead);\n', '').replace('  const historicalRead = path => inverseIdentityIntake(path, rawRead(path));\n', '')
    .replace('verifyCustomerContinuation(historicalRead)', 'verifyCustomerContinuation(rawRead)').replace('inverseCustomerContinuation(path, historicalRead(path))', 'inverseCustomerContinuation(path, rawRead(path))')
    .replace('matchesIdentityIntake(path, rawRead(path)) || ', '');
  assert.equal(source, text(old(path))); assert(source.includes("const baseline = '2c701d7'"));
  for (const p of Object.keys(identityIntakeAdapterPins)) assert.equal(text(inverseIdentityIntake(p, read(p))), text(old(p)));
  for (const file of ['docs/zeus/z0-acceptance.json', 'docs/zeus/z1-phase-acceptance.json', 'docs/zeus/z2-phase-acceptance.json', 'docs/zeus/z3-composer-acceptance.json', 'docs/zeus/z3-qc-acceptance.json', 'docs/zeus/z3-publication-ui-acceptance.json', 'docs/zeus/z3-customer-continuation-acceptance.json']) assert.equal(text(read(file)), text(old(file)));
});
