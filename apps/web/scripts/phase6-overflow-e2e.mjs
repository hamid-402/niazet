import { chromium } from 'playwright';

const BASE = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Passw0rd!123';
const viewports = [
  { name: 'mobile', width: 320, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop-large', width: 1920, height: 1080 },
];
const journeys = [
  { name: 'public', routes: ['/', '/services', '/status'] },
  { name: 'customer', phone: '09120000009', home: '/dashboard', routes: ['/dashboard', '/orders', '/wallet', '/tickets'] },
  { name: 'ops', phone: '09120000002', home: '/admin', routes: ['/admin', '/admin/orders', '/admin/staff', '/admin/reports/operations'] },
  { name: 'finance', phone: '09120000003', home: '/admin/finance', routes: ['/admin/finance', '/admin/finance/ledger', '/admin/reports/finance'] },
  { name: 'executor', phone: '09120000005', home: '/executor', routes: ['/executor', '/executor/orders', '/executor/performance'] },
  { name: 'support', phone: '09120000004', home: '/support/tickets', routes: ['/support', '/support/tickets', '/support/performance'] },
];

async function login(page, journey) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[dir="ltr"]').first().fill(journey.phone);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${journey.home}`, { timeout: 15_000 });
}

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const fixedOutside = [...document.querySelectorAll('*')]
      .filter((element) => ['fixed', 'sticky'].includes(getComputedStyle(element).position))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1))
      .map(({ element, rect }) => ({ tag: element.tagName, className: element.className, left: rect.left, right: rect.right }));
    return { scrollWidth: root.scrollWidth, clientWidth: viewportWidth, fixedOutside };
  });
  if (result.scrollWidth > result.clientWidth + 1 || result.fixedOutside.length) {
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(result)}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const journey of journeys) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      if (journey.phone) await login(page, journey);
      for (const route of journey.routes) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await assertNoOverflow(page, `${viewport.name}/${journey.name}${route}`);
      }
      await context.close();
    }
  }
  console.log('Phase 6 overflow E2E passed for four viewports and all public/role journeys.');
} finally {
  await browser.close();
}
