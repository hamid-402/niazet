import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const OUT = '/workspace/screenshots';
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true });

  const lightPage = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await lightPage.goto(BASE, { waitUntil: 'networkidle' });
  await lightPage.waitForTimeout(600);
  await lightPage.screenshot({ path: `${OUT}/home-light.png`, fullPage: true });
  console.log('saved home-light.png');

  const darkPage = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await darkPage.goto(BASE, { waitUntil: 'networkidle' });
  await darkPage.click('button[aria-label="تغییر حالت روشن/تیره"]');
  await darkPage.waitForTimeout(600);
  await darkPage.screenshot({ path: `${OUT}/home-dark.png`, fullPage: true });
  console.log('saved home-dark.png');

  // یک عکس هم فقط از هیرو (بدون اسکرول کامل) برای بررسی سریع‌تر
  await lightPage.setViewportSize({ width: 1440, height: 900 });
  await lightPage.screenshot({ path: `${OUT}/home-light-hero.png` });
  await darkPage.setViewportSize({ width: 1440, height: 900 });
  await darkPage.screenshot({ path: `${OUT}/home-dark-hero.png` });

  await browser.close();
  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
