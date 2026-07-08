// تست تعاملی ایجاد سفارش از طریق UI و تریاژ/قیمت‌گذاری توسط ادمین (فقط برای دیباگ محلی).
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  console.log('== customer login ==');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[dir="ltr"]', '09120000009');
  await page.fill('input[type="password"]', 'Passw0rd!123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  console.log('== create new order via UI ==');
  await page.goto(`${BASE}/orders/new`, { waitUntil: 'networkidle' });
  await page.selectOption('select >> nth=0', { label: 'طراحی و توسعه سایت' });
  await page.fill('input[placeholder="مثلاً: طراحی سایت فروشگاهی"]', 'تست UI سفارش');
  await page.fill('textarea', 'این یک درخواست تستی از طریق مرورگر واقعی است برای بررسی صحت UI.');
  await page.click('button:has-text("ارسال برای بررسی")');
  await page.waitForFunction(() => !window.location.pathname.endsWith('/new'), null, { timeout: 15000 });
  const orderUrl = page.url();
  console.log('order created at', orderUrl);
  await page.waitForSelector('text=در صف بررسی');

  console.log('== admin login and triage ==');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[dir="ltr"]', '09120000002');
  await page.fill('input[type="password"]', 'Passw0rd!123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');

  const orderId = orderUrl.split('/').pop();
  await page.goto(`${BASE}/admin/orders/${orderId}`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("ارسال به قیمت‌گذاری")');
  await page.waitForSelector('text=در انتظار قیمت‌گذاری');
  console.log('triaged to pending_quote OK');

  await page.fill('input[type="number"]', '3000000');
  await page.click('button:has-text("ثبت قیمت")');
  await page.waitForSelector('text=قیمت‌گذاری‌شده');
  console.log('quoted OK');

  await browser.close();

  if (errors.length) {
    console.log('=== PAGE ERRORS ===', errors);
    process.exitCode = 1;
  } else {
    console.log('=== FULL UI FLOW OK, NO PAGE ERRORS ===');
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
