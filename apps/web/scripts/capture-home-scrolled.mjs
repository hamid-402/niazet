import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 300) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('button[aria-label="تغییر حالت روشن/تیره"]');
  await page.waitForTimeout(300);
  await scrollThrough(page);
  await page.screenshot({ path: '/workspace/screenshots/home-dark-scrolled.png', fullPage: true });
  console.log('saved home-dark-scrolled.png');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
