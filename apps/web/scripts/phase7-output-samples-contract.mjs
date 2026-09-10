import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const samples = read('src/components/service-output-samples.tsx');
const home = read('src/app/page.tsx');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const samplesBlock = samples.match(/const OUTPUT_SAMPLES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
check((samplesBlock.match(/title:/g) ?? []).length === 4, 'Output gallery must contain four focused samples.');
check((samplesBlock.match(/format:/g) ?? []).length === 4, 'Every output sample needs a file format.');
check((samplesBlock.match(/privacy:/g) ?? []).length === 4, 'Every output sample needs a privacy treatment.');
check(samples.includes('مشتری واقعی، نتیجه واقعی یا ادعای عملکرد نیستند'), 'Gallery must explicitly reject fabricated customer or performance claims.');
check(samples.includes('فقط داده نمایشی و بدون اطلاعات هویتی'), 'Gallery must label its privacy-safe demo data.');
check((samples.match(/حریم خصوصی:/g) ?? []).length >= 1, 'Sample cards need a visible privacy label.');
check(/<section aria-labelledby="output-samples-title"/.test(samples), 'Output samples need a named section landmark.');
check(/<ul[\s\S]*<li/.test(samples), 'Output samples need list semantics.');
check(!/<(?:Image|img)\b/.test(samples), 'Output previews must stay lightweight and must not leak raster screenshots.');
check(home.includes('<ServiceOutputSamples />'), 'Homepage must render privacy-safe output samples.');

if (failures.length) {
  console.error(`Phase 7 output-samples contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 output-samples contract passed: four clearly synthetic, privacy-safe structural previews verified.');
