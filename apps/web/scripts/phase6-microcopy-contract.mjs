import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const terms = read('src/lib/product-copy.ts');
const ui = read('src/components/ui.tsx');
const timeline = read('src/components/order-timeline.tsx');
const guard = read('src/components/require-role.tsx');
const sources = [
  'src/app/(admin)/layout.tsx',
  'src/app/(admin)/admin/finance/page.tsx',
  'src/app/(admin)/admin/finance/ledger/page.tsx',
  'src/app/(admin)/admin/finance/escrow/page.tsx',
  'src/app/(admin)/admin/audit/page.tsx',
  'src/app/(admin)/admin/ai-controls/page.tsx',
  'src/app/(executor)/executor/page.tsx',
  'src/app/account/security/page.tsx',
  'src/app/(admin)/admin/users/page.tsx',
  'src/app/register/page.tsx',
].map((path) => [path, read(path)]);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const key of ['qualityControl', 'escrow', 'ledger', 'audit', 'artificialIntelligence', 'grossOrderValue']) {
  check(new RegExp(`\\b${key}:`).test(terms), `Product terminology is missing ${key}.`);
}
const forbidden = [
  "label: 'Escrow'",
  "label: 'Ledger'",
  "label: 'کنترل‌های AI'",
  "label: 'گزارش Audit'",
  'GMV این ماه',
  '>Ledger</SectionTitle>',
  '>Escrow</SectionTitle>',
  'Refresh Token در Cookie امن',
  'همه Sessionهای فعال',
  'Kill switch بر همه قابلیت‌های AI',
  'نیازمند اصلاح (QC)',
  'نرخ قبولی QC',
  'با OTP وارد شوید',
];
for (const [path, source] of sources) {
  for (const phrase of forbidden) check(!source.includes(phrase), `${path} exposes unexplained technical copy: ${phrase}`);
}
check(ui.includes('دوباره تلاش کنید') && guard.includes('بازگشت به میز کار'), 'Shared states must give the user a clear next action.');
for (const state of ['pending_triage', 'pending_payment', 'revision_requested', 'disputed']) {
  check(new RegExp(`${state}:\\s*["']`).test(timeline), `Order state ${state} needs action-oriented customer guidance.`);
}
check(/توقف اضطراری/.test(read('src/app/(admin)/admin/ai-controls/page.tsx')), 'AI emergency behavior must be described in plain Persian.');
check(/دسترسی همه دستگاه‌های فعال/.test(read('src/app/(admin)/admin/users/page.tsx')), 'Account blocking copy must state its immediate effect.');

if (failures.length) {
  console.error(`Phase 6 microcopy contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 6 microcopy contract passed: product terminology is plain, sensitive effects are explicit and next actions remain actionable.');
