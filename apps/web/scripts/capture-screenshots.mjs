import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const OUT = '/workspace/screenshots';
mkdirSync(OUT, { recursive: true });

async function login(page, phone) {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[dir="ltr"]', phone);
  await page.fill('input[type="password"]', 'Passw0rd!123');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), null, {
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle');
}

async function shot(page, url, filename, waitSelector) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  if (waitSelector) await page.waitForSelector(waitSelector, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${filename}`, fullPage: true });
  console.log('saved', filename);
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await shot(page, '/', '01-home.png', 'text=خدمات تخصصی');
  await shot(page, '/services', '02-services.png', 'text=خدمات');

  await login(page, '09120000009');
  await shot(page, '/dashboard', '03-customer-dashboard.png', 'text=میز کار');
  await shot(page, '/orders/new', '04-customer-new-order.png', 'text=ثبت درخواست جدید');
  await shot(page, '/orders', '05-customer-orders.png', 'text=سفارش‌های من');
  await shot(page, '/wallet', '06-customer-wallet.png', 'text=کیف پول');

  await login(page, '09120000002');
  await shot(page, '/admin', '07-admin-ops-dashboard.png', 'text=داشبورد عملیات');
  await shot(page, '/admin/orders', '08-admin-orders.png', 'text=مدیریت سفارش‌ها');
  await shot(page, '/admin/staff', '09-admin-staff.png', 'text=کارمندان و مجریان');
  await shot(page, '/admin/qc', '10-admin-qc.png', 'text=کنترل کیفیت');

  await login(page, '09120000003');
  await shot(page, '/admin/finance', '11-admin-finance-dashboard.png', 'text=داشبورد مالی');
  await shot(page, '/admin/finance/ledger', '12-admin-finance-ledger.png', 'text=Ledger');

  await login(page, '09120000005');
  await shot(page, '/executor', '13-executor-dashboard.png', 'text=کارهای من');
  await shot(page, '/executor/orders', '14-executor-orders.png', 'text=سفارش‌های ارجاع‌شده');

  await login(page, '09120000004');
  await shot(page, '/support/tickets', '15-support-tickets.png', 'text=صف تیکت‌ها');

  await browser.close();
  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
