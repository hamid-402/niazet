import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/workspace/screenshots';

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/sanity-login.png` });

  await page.goto(`${BASE}/services`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/sanity-services.png` });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[dir="ltr"]', '09120000009');
  await page.fill('input[type="password"]', 'Passw0rd!123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/sanity-customer-dashboard.png`, fullPage: true });

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
