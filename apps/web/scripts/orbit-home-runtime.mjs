import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';

export async function verifyOrbitHome(browser, origin) {
  const context = await browser.newContext({ locale: 'fa-IR', viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  try {
    // Guest-only fixture; no authentication requests or production mutations.
    await context.route('**/api/backend/auth/refresh', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    const hero = page.locator('[data-orbit-motion]');
    await page.waitForFunction(() => document.querySelector('[data-orbit-motion]')?.dataset.orbitMotion === 'on');
    const skip = page.locator('.skip-link');
    assert.ok((await skip.boundingBox()).y < 0, 'Skip link must not cover the brand when unfocused.');
    await page.keyboard.press('Tab');
    assert.equal(await skip.evaluate((element) => document.activeElement === element), true, 'Skip link must remain the first keyboard stop.');
    await page.waitForFunction(() => document.querySelector('.skip-link').getBoundingClientRect().top >= 0);
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.hash === '#main-content');
    const stages = hero.getByRole('list', { name: 'نگاهی به مسیر اجرای نیازت' }).getByRole('button');
    assert.equal(await stages.count(), 4);
    assert.equal(await hero.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await hero.locator('a[href="/services"]').count(), 2);
    assert.equal(await page.locator('.service-collection a').count(), 8, 'All service categories must remain.');
    assert.equal(await page.getByRole('list', { name: 'دلایل اعتماد به نیازت' }).getByRole('listitem').count(), 3);
    const toggle = hero.getByRole('button', { name: 'توقف حرکت‌های مدار', exact: true });
    const play = () => hero.getByRole('button', { name: 'پخش مسیر', exact: true });
    await play().click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-controls="orbit-journey-detail"]')[3]?.getAttribute('aria-pressed') === 'true');
    await play().waitFor(); // The single preview cycle must finish, not loop forever.
    await stages.nth(1).focus();
    await page.keyboard.press('Enter');
    assert.equal(await stages.nth(1).getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('#orbit-journey-detail').innerText()).includes('حساب امانی'));
    assert.equal(await stages.nth(1).evaluate((element) => document.activeElement === element), true);
    await play().click();
    await toggle.click();
    assert.equal(await hero.getAttribute('data-orbit-motion'), 'off');
    const paused = await stages.evaluateAll((buttons) => buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true'));
    await page.waitForTimeout(1400);
    assert.equal(await stages.nth(paused).getAttribute('aria-pressed'), 'true', 'Pause must cancel active timers.');
    await page.reload();
    await hero.waitFor();
    assert.equal(await hero.getAttribute('data-orbit-motion'), 'off', 'Paused preference must persist.');
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('[data-orbit-motion]')?.dataset.orbitMotion === 'on');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('[data-orbit-motion]')?.dataset.orbitMotion === 'off');
    assert.equal(await play().isDisabled(), true);
    assert.equal(await hero.getByRole('button', { name: 'حرکت محدود سیستم' }).isDisabled(), true);
    await stages.nth(3).click();
    assert.equal(await stages.nth(3).getAttribute('aria-pressed'), 'true', 'Manual exploration must work with reduced motion.');
    const axe = await new AxeBuilder({ page }).include('[data-orbit-motion]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(({ id }) => id), []);
    assert.deepEqual(errors, [], 'Orbit must not produce runtime/hydration errors.');

    const staticPage = await noScript.newPage();
    await staticPage.bringToFront();
    await staticPage.goto(origin);
    await staticPage.evaluate(() => document.fonts.ready);
    // Poll from the test process: an early RAF-based stability wait stalls in
    // this no-JS Chromium context. Keep the real animation and normal click.
    let entranceFinished = false;
    for (let check = 0; check < 20; check++) {
      entranceFinished = await staticPage.evaluate(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
      if (entranceFinished) break;
      await staticPage.waitForTimeout(100);
    }
    assert.equal(entranceFinished, true, 'The no-JS route entrance must finish within two seconds.');
    assert.equal(await staticPage.locator('h1').isVisible(), true, 'Primary content must survive without JS.');
    assert.equal(await staticPage.locator('.service-collection a').count(), 8);
    assert.equal(await staticPage.getByRole('list', { name: 'دلایل اعتماد به نیازت' }).getByRole('listitem').count(), 3);
    await staticPage.getByRole('link', { name: 'شروع ثبت درخواست', exact: true }).first().click();
    assert.equal(new URL(staticPage.url()).pathname, '/services', 'CTA must be a real link, not a demo action.');
    console.log('Orbit interactions passed: real links, category/trust parity, playback/stop, keyboard, persistent pause, live reduced-motion, Axe, no-JS content and navigation.');
  } finally {
    await context.close();
    await noScript.close();
  }
}
