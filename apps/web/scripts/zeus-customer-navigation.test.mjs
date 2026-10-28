import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root = new URL('../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const require = createRequire(new URL('../package.json', import.meta.url)), ts = require('typescript');
const p = 'apps/web/src/components/customer-navigation.ts';
const js = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
const { ORDER_SECTIONS, readOrderSection, updateCustomerQuery, fixedCheckoutChoice, CUSTOMER_DESTINATIONS } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
for (const tab of Object.keys(ORDER_SECTIONS)) test('canonical order deep link: ' + tab, () => assert.equal(readOrderSection(new URLSearchParams({ tab })), tab));
for (const query of ['', 'tab=unknown', 'tab=__proto__', 'tab=payments&tab=files', 'tab=https://invalid.example']) test('ambiguous or unknown order query fails to summary: ' + query, () => assert.equal(readOrderSection(new URLSearchParams(query)), 'summary'));
test('delivery alias resolves to files without creating a public file route', () => assert.equal(readOrderSection(new URLSearchParams('tab=delivery')), 'files'));
test('tab changes preserve gateway identity, submission receipt and unrelated parameters', () => {
  const query = updateCustomerQuery('?paymentId=payment-proof&submitted=1&tab=files&tab=summary&filter=x', 'tab', 'history');
  const params = new URLSearchParams(query);
  assert.deepEqual(params.getAll('tab'), ['history']); assert.equal(params.get('paymentId'), 'payment-proof');
  assert.equal(params.get('submitted'), '1'); assert.equal(params.get('filter'), 'x');
});
test('only explicit fixed-priority choices are accepted, never urgency guesses or payment proof', () => {
  for (const priority of ['normal', 'urgent', 'same_day']) assert.equal(fixedCheckoutChoice(new URLSearchParams({ checkout: priority })), priority);
  for (const query of ['', 'checkout=low', 'checkout=high', 'checkout=paid', 'checkout=review', 'checkout=normal&checkout=urgent', 'paymentId=normal']) assert.equal(fixedCheckoutChoice(new URLSearchParams(query)), null);
});
test('all named destinations exist and keep the real OTP, wallet and profile routes', () => {
  assert.deepEqual(CUSTOMER_DESTINATIONS, { otp: '/login/otp', delivery: '/orders', wallet: '/wallet?tab=wallet', profile: '/account/profile', tickets: '/tickets' });
  assert(read('apps/web/src/app/login/otp/page.tsx').includes('initialMode="otp"'));
});
test('extracted login keeps all four original handlers byte-for-byte and GuestOnly boundary', () => {
  const old = execFileSync('git', ['show', '7e5409f:apps/web/src/app/login/page.tsx'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const current = read('apps/web/src/components/login-screen.tsx');
  function functions(text) {
    const sf = ts.createSourceFile('login.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = {};
    const visit = n => { if (ts.isFunctionDeclaration(n) && ['switchMode', 'onPasswordSubmit', 'onRequestOtp', 'onOtpSubmit'].includes(n.name?.text)) result[n.name.text] = n.getText(sf).replaceAll('\r\n', '\n'); ts.forEachChild(n, visit); }; visit(sf); return result;
  }
  assert.equal(Object.keys(functions(old)).length, 4); assert.deepEqual(functions(current), functions(old));
  assert(current.includes('<GuestOnly>')); assert(current.includes('useState<LoginMode>(initialMode)'));
});
