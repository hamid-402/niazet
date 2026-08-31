import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const home = readFileSync(new URL('src/app/page.tsx', root), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const trustBlock = home.match(/const TRUST_SIGNALS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
const trustCount = (trustBlock.match(/title:/g) ?? []).length;
check(trustCount === 3, `Hero must contain exactly three trust signals; found ${trustCount}.`);
check(/<h1[^>]*>[\s\S]*خدمات تخصصی/.test(home), 'Hero needs one clear value-proposition heading.');
check((home.match(/<LinkButton href="\/services"/g) ?? []).length >= 2, 'Hero needs primary and secondary service CTAs.');
check(/<ul aria-label="دلایل اعتماد به نیازت"/.test(home), 'Trust signals need semantic list markup and an accessible name.');
check(home.includes('اجرای داخلی و احراز‌شده') && home.includes('پرداخت در حساب امانی') && home.includes('کنترل کیفیت پیش از تحویل'), 'Trust signals must cover execution, payment and quality.');
check(!/<(?:Image|img)\b/.test(home) && !/backgroundImage|bg-\[url/.test(home), 'Hero must remain text-led without a large image.');
check(!/\(escrow\)|\bdispute\b/i.test(home), 'Public homepage must use clear Persian product terminology.');

if (failures.length) {
  console.error(`Phase 7 hero contract failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 7 hero contract passed: text-led value proposition, two CTAs and three semantic trust signals with no large image.');
