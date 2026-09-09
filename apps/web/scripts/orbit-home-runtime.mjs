import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { verifyOrbitPublicSections } from './orbit-public-sections-runtime.mjs';

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
    const explorer = page.locator('[data-orbit-explorer]');
    const expectedCategories = ['طراحی و توسعه سایت', 'محتوا و سئو', 'تحقیق و تحلیل بازار', 'گزارش مدیریتی', 'طراحی گرافیک', 'امور اداری و پیگیری', 'دستیار کسب‌وکار', 'خدمات سفارشی'];
    assert.equal(await explorer.locator('details').count(), 8);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['simple-light', 'simple-dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        for (let index = 0; index < expectedCategories.length; index++) {
          const summary = explorer.locator('summary').nth(index);
          assert.ok((await summary.innerText()).includes(expectedCategories[index]));
          await summary.focus();
          await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
          assert.equal(await explorer.locator('details[open]').count(), 1);
          assert.equal(await explorer.locator('details').nth(index).getAttribute('open'), '');
          assert.equal(await summary.evaluate((element) => document.activeElement === element), true);
          const panel = explorer.locator('details[open] > div');
          assert.equal(await panel.getByRole('link').getAttribute('href'), '/services');
          await page.waitForFunction(() => {
            const root = document.querySelector('[data-orbit-explorer] .service-collection');
            const panel = root.querySelector('details[open] > div');
            return panel.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1;
          });
          const scan = await new AxeBuilder({ page }).include('[data-orbit-explorer]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          assert.deepEqual(scan.violations.map(({ id }) => id), [], `Explorer ${width}/${theme}/${index} accessibility`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('[data-orbit-explorer]').dataset.motion === 'on');
    await explorer.locator('summary').first().click();
    assert.notEqual(await explorer.locator('details[open] > div').evaluate((element) => getComputedStyle(element).animationName), 'none', 'Enabled explorer must use its entrance motion.');
    await toggle.click();
    assert.equal(await explorer.getAttribute('data-motion'), 'off', 'Hero pause must also stop explorer motion.');
    assert.equal(await explorer.locator('details[open] > div').evaluate((element) => getComputedStyle(element).animationName), 'none');
    await explorer.locator('summary').nth(2).click();
    assert.equal(await explorer.locator('details').nth(2).getAttribute('open'), '', 'Paused explorer must remain usable.');
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
    const staticExplorer = staticPage.locator('[data-orbit-explorer]');
    for (let index = 0; index < 8; index++) {
      const details = staticExplorer.locator('details').nth(index);
      if (!(await details.evaluate((element) => element.open))) await details.locator('summary').click();
      assert.equal(await details.getByRole('link').isVisible(), true, `No-JS category ${index} remains reachable.`);
    }
    assert.equal(await staticPage.getByRole('list', { name: 'دلایل اعتماد به نیازت' }).getByRole('listitem').count(), 3);
    await verifyOrbitPublicSections(page, staticPage);
    assert.deepEqual(errors, [], 'Public sections must not introduce runtime/hydration errors.');
    await staticPage.getByRole('link', { name: 'شروع ثبت درخواست', exact: true }).first().click();
    assert.equal(new URL(staticPage.url()).pathname, '/services', 'CTA must be a real link, not a demo action.');
    await staticPage.setViewportSize({ width: 1280, height: 900 });
    const publicNav = staticPage.getByRole('navigation', { name: 'ناوبری عمومی', exact: true });
    assert.equal(await publicNav.getByRole('link').count(), 4, 'Every original public navigation link must remain.');
    assert.equal(await publicNav.getByRole('link', { name: 'خدمات', exact: true }).getAttribute('aria-current'), 'page');
    console.log('Orbit interactions passed: hero, shared pause, 32 explorer category/theme/width states with Axe and keyboard, 8 no-JS disclosures, real links, parity, playback, reduced-motion and navigation.');
  } finally {
    await context.close();
    await noScript.close();
  }
}
