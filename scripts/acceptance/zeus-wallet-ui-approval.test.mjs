import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { walletUiPins, walletUiOriginalRef, matchesWalletUiApproval, verifyWalletUiApproval } from '../orbit-wallet-ui-approval.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const original = p => execFileSync('git', ['show', `${walletUiOriginalRef}:${p}`], { cwd: root, windowsHide: true });
test('only six exact additive wallet UI/test files match', () => { assert.equal(Object.keys(walletUiPins).length, 6); verifyWalletUiApproval(original, read); });
test('every byte edit or missing wallet UI file fails closed', () => {
  for (const p of Object.keys(walletUiPins)) { assert.equal(matchesWalletUiApproval(p, Buffer.concat([read(p), Buffer.from(' ')])), false); assert.throws(() => verifyWalletUiApproval(original, path => path === p ? Buffer.from('missing') : read(path))); }
});
test('only LF/CRLF conversion is normalized; original checkpoint is enforced', () => {
  for (const p of Object.keys(walletUiPins)) assert(matchesWalletUiApproval(p, Buffer.from(read(p).toString().replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))));
  assert.throws(() => verifyWalletUiApproval(() => 'changed old page', read));
});
test('no auth, finance backend or other UI path becomes exempt', () => {
  for (const p of ['apps/web/src/lib/api.ts', 'apps/web/src/lib/auth-context.tsx', 'apps/api/src/finance/ledger.service.ts', 'apps/web/src/components/unapproved.tsx', '__proto__']) assert.equal(matchesWalletUiApproval(p, Buffer.from('{}')), false);
});
