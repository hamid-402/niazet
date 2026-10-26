import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inverseParserInput } from './orbit-parser-approval.mjs';

// Owner approval 2026-10-21: presentation only (M5-PDF-01). Each accepted byte
// sequence (LF-normalized for text) is pinned, not an API/finance allowlist.
export const approvedInvoiceFiles = {
  'apps/api/package.json': '09c73d8559eba358488665800627b5f21d4c171d4a4681bcb58e3cc60dfc5861',
  'apps/api/package-lock.json': '109a27e51f95c5c1f304c33318b3dd010f16e0ad9c3b5ef08fc82bc3f50530f8',
  'apps/api/nest-cli.json': '5d311b5badb25640a48fd5427617a69f6447a1514a731aaee54dee23f9e4f69d',
  'apps/api/src/finance/invoices.service.ts': 'd8cf510ef06d75c31b4b6e7f1d46da67e0ac7c0a5ab449393f9368a16d5730e6',
  'apps/api/src/finance/invoices.service.spec.ts': '0abb0dd3ea1a5d4703e73ca04f886d78f37f05f842e4ecc8388205f1e5413553',
  'apps/api/src/finance/invoice-pdf.renderer.ts': 'd5eb9e339fdf15121b5ae34e3a941ed86f746c9114693add3d5bf29c036da734',
  'apps/api/src/finance/invoice-pdf.renderer.spec.ts': '6460c9c84dc7be02f61480a376ffebf4b9e140fbcc57b48932979f5b66e1af41',
  'apps/api/src/finance/bidi-js.d.ts': '3971b794b55114c129e5c4d0bc274e0ab884d9c9d2605cafd4ae07b8b76e94f3',
  'apps/api/src/finance/assets/Vazirmatn-Regular.ttf': 'b69fd4c680b8f3f225feabcc655a2c585d97627b8f5f5c0f9985e894069f3a56',
  'apps/api/src/finance/assets/Vazirmatn-Bold.ttf': 'f635fdbea28f265de395ba83b4b1570dcf2f58d13c65469e61903b1c2d2ae723',
  'apps/api/src/finance/assets/OFL.txt': 'e6f4ce7b6c830d5a25a4f8ac777c267cd7d3c180bc2a7150ca57cbb9b280c4b7',
  'apps/api/src/finance/assets/README.md': 'dc3d5d980bf6e424c3cea0d5514bd9dd691f62c16b9f3502443c9f9186b63bb1',
};

export function matchesInvoiceApproval(path, bytes) {
  const content = path.endsWith('.ttf') ? bytes : inverseParserInput(path, bytes);
  return Boolean(approvedInvoiceFiles[path]) && createHash('sha256').update(content).digest('hex') === approvedInvoiceFiles[path];
}

export function verifyInvoiceDomain(baseline, current) {
  // Owner-approved parser inputs must reconstruct the exact invoice checkpoint;
  // all inherited invoice/manifest/dependency assertions below remain intact.
  const actualCurrent = current;
  current = path => inverseParserInput(path, actualCurrent(path));
  const servicePath = 'apps/api/src/finance/invoices.service.ts';
  const classBody = source => {
    source = source.replaceAll('\r\n', '\n');
    assert.ok(source.includes('@Injectable()\nexport class InvoicesService'));
    return source.slice(source.indexOf('@Injectable()')).replaceAll('content: await buildInvoicePdf(', 'content: buildInvoicePdf(');
  };
  assert.equal(classBody(current(servicePath)), classBody(baseline(servicePath)), 'Invoice issuance, owner/scope query, amount and number must stay identical.');
  const testPath = 'apps/api/src/finance/invoices.service.spec.ts';
  assert.equal(current(testPath).replaceAll('\r\n', '\n').replace("it('creates a valid single-page PDF payload', async () =>", "it('creates a valid single-page PDF payload', () =>").replace('const pdf = await buildInvoicePdf(', 'const pdf = buildInvoicePdf('), baseline(testPath), 'Inherited assertions must not be removed.');
  const packagePath = 'apps/api/package.json';
  const manifest = JSON.parse(current(packagePath));
  assert.equal(manifest.dependencies.pdfkit, '0.20.2'); assert.equal(manifest.dependencies['bidi-js'], '1.0.3'); assert.equal(manifest.devDependencies['@types/pdfkit'], '0.17.6');
  delete manifest.dependencies.pdfkit; delete manifest.dependencies['bidi-js']; delete manifest.devDependencies['@types/pdfkit'];
  assert.deepEqual(manifest, JSON.parse(baseline(packagePath)), 'No unrelated manifest change approved.');
  const configPath = 'apps/api/nest-cli.json', config = JSON.parse(current(configPath));
  assert.deepEqual(config.compilerOptions.assets, ['finance/assets/**']); delete config.compilerOptions.assets;
  assert.deepEqual(config, JSON.parse(baseline(configPath)));
  const oldLock = JSON.parse(baseline('apps/api/package-lock.json')), newLock = JSON.parse(current('apps/api/package-lock.json'));
  for (const [path, entry] of Object.entries(oldLock.packages)) {
    if (!path) continue;
    const previous = { ...entry }, next = { ...newLock.packages[path] };
    // Shared dev packages becoming transitive production dependencies is npm
    // metadata, not permission to alter their version/integrity/dependency data.
    if (previous.dev === true && next.dev === undefined) delete previous.dev;
    assert.deepEqual(next, previous, `Inherited dependency changed: ${path}`);
  }
}
