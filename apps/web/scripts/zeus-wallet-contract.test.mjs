import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const req = createRequire(new URL('../package.json', import.meta.url));
const ts = req('typescript');
const source = readFileSync(new URL('../src/components/wallet-contract.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { parseWalletAmount } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
for (const [value, expected] of [['۱۰۰٬۰۰۰', 100000], ['١٢٣', 123], ['1,001', 1001], [' ۱ ', 1], ['2000000000', 2000000000]]) test(`accepts exact bounded IRT integer ${value}`, () => assert.equal(parseWalletAmount(value), expected));
for (const value of ['', '0', '-1', '۱٫۵', '1.5', '1e5', 'Infinity', '2000000001', '9007199254740993', '+100', '1 000']) test(`rejects invalid amount ${value}`, () => assert.equal(parseWalletAmount(value), null));
test('wallet integration remains additive to existing finance/order controls', () => {
  const wallet = readFileSync(new URL('../src/app/(customer)/wallet/page.tsx', import.meta.url), 'utf8');
  const order = readFileSync(new URL('../src/app/(customer)/orders/[id]/page.tsx', import.meta.url), 'utf8');
  for (const text of ['WalletFundingPanel', 'downloadAuthenticated', 'ordersNeedingPayment', 'finance-panel-refunds', 'finance-panel-invoices', 'finance-panel-wallet']) assert(wallet.includes(text));
  for (const text of ['WalletOrderPayment', '/accept-quote', '/pay`', '/verify`', 'submitCustomerDecision', 'SecureFileUpload', 'SecureFileLink']) assert(order.includes(text), text);
});
