import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ts = require('typescript');
const before = execFileSync('git', ['show', '166804b:apps/api/src/files/files.service.ts'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', windowsHide: true });
const js = ts.transpileModule(before, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, experimentalDecorators: true, emitDecoratorMetadata: true } }).outputText;
const legacyModule = { exports: {} };
const legacyRequire = createRequire(new URL('../../apps/api/dist/files/files.service.js', import.meta.url));
new Function('require', 'module', 'exports', js)(legacyRequire, legacyModule, legacyModule.exports);
const { FilesService } = legacyModule.exports;

// Characterization of an OPEN defect, NOT a passing security acceptance.
// No constructor, actual token, filesystem, DB or network is used.
test('historical Z3-QC-01 at 166804b grants a customer output URL before any QC approval', async () => {
  let grants = 0, signs = 0, audits = 0;
  const file = { id: 'isolated-output', orderId: 'isolated-order', uploadedByUserId: 'executor-fixture', fileKind: 'output', scanStatus: 'clean', storageKey: 'not-opened', order: { customerId: 'customer-fixture', status: 'qc_pending', deliveredAt: null, assignments: [], reports: [], messages: [] } };
  const service = Object.create(FilesService.prototype);
  Object.assign(service, {
    prisma: { orderFile: { findUnique: async () => file }, signedUrlGrant: { create: async () => { grants++; return {}; } } },
    jwt: { signAsync: async () => { signs++; return 'not-a-real-token'; } },
    config: { get: key => key === 'DOWNLOAD_TOKEN_SECRET' ? 'isolated-characterization-only' : undefined },
    audit: { record: async () => { audits++; } }, storage: { exists: async () => false },
  });
  const result = await service.createSignedUrl(file.id, { id: 'customer-fixture', role: 'customer' });
  assert.equal(file.order.status, 'qc_pending'); assert.equal(file.order.deliveredAt, null);
  assert.equal(typeof result.url, 'string'); assert.equal(grants, 1); assert.equal(signs, 1); assert.equal(audits, 1);
});
