import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { inverseCustomerContinuation } from '../../../scripts/orbit-z3-customer-continuation-approval.mjs';

const root = new URL('../../../', import.meta.url);
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const path = 'apps/web/src/app/(customer)/orders/new/page.tsx';
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const historical = path => execFileSync('git', ['show', `14180b2:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true }).replaceAll('\r\n', '\n');
const source = read(path), previous = historical(path);
// Only the superseded submit/no-commercial assertions consume the exact prior
// accepted form. The six unchanged handlers and all field/draft checks below
// still inspect current source. New registration has separate runtime proof.
const previousAcceptedSource = inverseCustomerContinuation(path, Buffer.from(source)).toString('utf8');
const parse = text => ts.createSourceFile('form.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const current = parse(source), old = parse(previous);
function nodes(tree, predicate) {
  const output = [];
  function visit(node) { if (predicate(node)) output.push(node); ts.forEachChild(node, visit); }
  visit(tree); return output;
}
const fn = (tree, name) => nodes(tree, node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0];
const compact = text => text.replace(/\s+/g, ' ').trim();

for (const name of ['fieldConfig', 'answersFromSnapshot', 'DynamicField', 'payload', 'persistDraft', 'validateForReview', 'submitOrder']) {
  test(`complete prior implementation retained: ${name}`, () => {
    assert(fn(current, name), name);
    const asserted = name === 'submitOrder' ? parse(previousAcceptedSource) : current;
    assert.equal(fn(asserted, name).getText(asserted), fn(old, name).getText(old));
  });
}

test('catalog/draft bootstrap and the entire autosave effect and dependencies are unchanged', () => {
  const effects = tree => nodes(tree, n => ts.isCallExpression(n) && n.expression.getText(tree) === 'useEffect').map(n => n.getText(tree));
  assert.equal(effects(old).length, 2);
  assert.deepEqual(effects(current), effects(old));
});

test('all previous state variables remain; no draft, input or file state is removed', () => {
  const state = tree => nodes(tree, n => ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(tree) === 'useState').map(n => compact(n.name.getText(tree)));
  for (const name of state(old)) assert(state(current).includes(name), name);
});

test('every original field/control and its original props remain in the current form', () => {
  const controls = tree => nodes(tree, n => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ['input', 'textarea', 'select', 'DynamicField', 'SecureFileUpload'].includes(n.tagName.getText(tree)));
  const props = node => node.attributes.properties.map(p => compact(p.getText().replace(/\s/g, '')));
  for (const node of controls(old)) {
    assert(controls(current).some(candidate => candidate.tagName.getText(current) === node.tagName.getText(old) && props(node).every(prop => props(candidate).includes(prop))), node.getText(old));
  }
});

test('the original review validation, persistence and error handling statements are retained', () => {
  const statements = tree => nodes(tree, n => ts.isExpressionStatement(n) || ts.isVariableDeclaration(n) || ts.isReturnStatement(n)).map(n => compact(n.getText()));
  const after = statements(fn(current, 'onReview'));
  for (const statement of statements(fn(old, 'onReview'))) assert(after.includes(statement), statement);
  assert.match(fn(current, 'onReview').getText(), /advanceRef\.current \|\| uploading/);
});

test('three ordered accessible steps, native validation and separate persisted transitions', () => {
  const steps = nodes(current, n => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'ol')[0];
  assert.equal(nodes(steps, n => ts.isJsxOpeningElement(n) && n.tagName.getText() === 'li').length, 3);
  assert.match(source, /aria-live="polite" aria-atomic="true"/);
  assert.match(source, /onSubmit=\{requirements \? onReview : onContinue\}/);
  assert.match(fn(current, 'onContinue').getText(), /await persistDraft\(\);\s+setRequirements\(true\)/);
  assert.match(source, /fieldset hidden=\{requirements\} disabled=\{requirements \|\| advancing\}/);
  assert.match(source, /fieldset hidden=\{!requirements\} disabled=\{!requirements \|\| advancing\}/);
  assert.doesNotMatch(source, /noValidate|formNoValidate|setRequirements\(false\).*setFormResponses\(\{\}\)/);
});

test('estimate remains non-binding in edit and review; no commercial/payment command added prematurely', () => {
  assert.equal((source.match(/<PriceEstimate /g) ?? []).length, 2);
  assert.match(source, /برآورد بالا مجوز پرداخت نیست/);
  assert.doesNotMatch(previousAcceptedSource, /apiFetch[^\n]*(?:commercial|payments|wallet)/);
  for (const value of ['low', 'normal', 'high', 'urgent']) assert.match(source, new RegExp(`option value="${value}"`));
});

test('shared uploader preserves all old code except four optional notification insertions', () => {
  const file = 'apps/web/src/components/secure-file.tsx';
  let restored = read(file);
  for (const insertion of ['  onUploadingChange,\n', '  onUploadingChange?: (uploading: boolean) => void;\n', '    onUploadingChange?.(true);\n', '      onUploadingChange?.(false);\n']) {
    assert.equal(restored.split(insertion).length, 2, insertion);
    restored = restored.replace(insertion, '');
  }
  assert.equal(restored, historical(file));
  assert.match(source, /onUploadingChange=\{setUploading\}/);
  assert.match(source, /saveState === "saving" \|\| advancing \|\| uploading/);
});
