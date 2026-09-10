// اسکریپت دستی برای تست دستی مسیر ورود/ثبت سفارش در مرورگر واقعی (فقط برای دیباگ محلی).
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'Passw0rd!123';

async function loginAs(page, { phone, waitUrlPattern, logLabel, clearStorage = true }) {
  if (clearStorage) await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[dir="ltr"]', phone);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(waitUrlPattern, { timeout: 10000 });
  console.log(logLabel, page.url());
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('== open home ==');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  console.log('title:', await page.title());

  console.log('== open services ==');
  await page.goto(`${BASE}/services`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=خدمات');

  console.log('== login as customer ==');
  await loginAs(page, { phone: '09120000009', waitUrlPattern: '**/dashboard', logLabel: 'logged in, url:', clearStorage: false });

  console.log('== open orders/new ==');
  await page.goto(`${BASE}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=ثبت درخواست جدید');

  console.log('== open wallet ==');
  await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=کیف پول و فاکتورها');

  console.log('== open tickets ==');
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=تیکت‌های من');

  console.log('== login as ops admin ==');
  await loginAs(page, { phone: '09120000002', waitUrlPattern: '**/admin', logLabel: 'admin logged in, url:' });

  await page.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=مدیریت سفارش‌ها');

  await page.goto(`${BASE}/admin/staff`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=کارمندان و مجریان');

  await page.goto(`${BASE}/admin/qc`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=کنترل کیفیت');

  console.log('== login as finance admin ==');
  await loginAs(page, { phone: '09120000003', waitUrlPattern: '**/admin/finance', logLabel: 'finance admin logged in, url:' });

  await page.goto(`${BASE}/admin/finance/ledger`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Ledger');

  console.log('== login as executor ==');
  await loginAs(page, { phone: '09120000005', waitUrlPattern: '**/executor', logLabel: 'executor logged in, url:' });

  await page.goto(`${BASE}/executor/orders`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=سفارش‌های ارجاع‌شده');

  console.log('== login as support ==');
  await loginAs(page, { phone: '09120000004', waitUrlPattern: '**/support/tickets', logLabel: 'support logged in, url:' });

  await browser.close();

  if (errors.length) {
    console.log('=== CONSOLE/PAGE ERRORS ===');
    for (const e of errors) console.log(e);
    process.exitCode = 1;
  } else {
    console.log('=== NO CONSOLE ERRORS ===');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
