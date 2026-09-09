import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';

export async function verifyOrbitPublicSections(page, staticPage) {
  const regions = ['use-cases-title', 'output-samples-title', 'assurance-title', 'process-stepper-title', 'public-faq-title', 'final-cta-title'];
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['simple-light', 'simple-dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const mark of await page.locator('[data-brand-mark]').all()) {
        const img = mark.getByRole('img');
        await img.evaluate(image => image.decode());
        assert.ok(await img.evaluate(image => image.complete && image.naturalWidth > 0));
        assert.ok(await mark.evaluate(element => element.getBoundingClientRect().width <= innerWidth));
        const rendering = await mark.evaluate(element => {
          const image = element.querySelector('img');
          const frame = image.parentElement.parentElement;
          return { filter: getComputedStyle(image).filter, background: getComputedStyle(frame).backgroundColor, border: getComputedStyle(frame).borderTopColor };
        });
        assert.ok(rendering.filter.includes(theme === 'simple-dark' ? 'brand-dark-' : 'brand-light-'), 'Brand ink must follow the active theme.');
        assert.equal(rendering.background, 'rgba(0, 0, 0, 0)', 'Brand must not have a light plate.');
        assert.equal(rendering.border, 'rgba(0, 0, 0, 0)', 'Brand must not have a visible frame.');
      }
      assert.equal(await page.locator('[aria-labelledby="use-cases-title"] > div > ul > li').count(), 5);
      assert.equal(await page.locator('[aria-labelledby="output-samples-title"] > ul > li').count(), 4);
      assert.equal(await page.locator('[aria-labelledby="assurance-title"] > div > ol > li').count(), 5);
      const process = page.locator('#how-it-works');
      const steps = process.getByRole('list', { name: 'مراحل سفارش خدمت' }).getByRole('button');
      await steps.first().focus();
      await page.keyboard.press('Home');
      assert.equal(await process.getByRole('button', { name: 'مرحله قبل', exact: true }).isDisabled(), true);
      for (let index = 0; index < 6; index++) {
        if (index) await page.keyboard.press('ArrowLeft');
        assert.equal(await steps.nth(index).getAttribute('aria-current'), 'step');
        assert.equal(await steps.nth(index).evaluate(element => element === document.activeElement), true);
        assert.ok((await process.locator('#service-process-detail').innerText()).includes(await steps.nth(index).locator('span').last().innerText()));
        const scan = await new AxeBuilder({ page }).include('#how-it-works').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(scan.violations.map(({ id }) => id), [], `Process ${width}/${theme}/${index}`);
      }
      assert.equal(await process.getByRole('button', { name: 'مرحله بعد', exact: true }).isDisabled(), true);
      await page.keyboard.press('Home');
      await process.getByRole('button', { name: 'مرحله بعد', exact: true }).click();
      assert.equal(await steps.nth(1).getAttribute('aria-current'), 'step');
      await process.getByRole('button', { name: 'مرحله قبل', exact: true }).click();
      assert.equal(await steps.first().getAttribute('aria-current'), 'step');
      const questions = page.locator('#faq details');
      assert.equal(await questions.count(), 6);
      for (let index = 0; index < 6; index++) {
        const item = questions.nth(index);
        const summary = item.locator('summary');
        if (await item.evaluate(element => element.open)) await summary.click();
        await summary.focus();
        await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
        assert.equal(await item.evaluate(element => element.open), true);
        assert.equal(await summary.evaluate(element => element === document.activeElement), true);
        assert.equal(await item.locator('p').isVisible(), true);
      }
      for (const region of regions) {
        const scan = await new AxeBuilder({ page }).include(`[aria-labelledby="${region}"]`).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(scan.violations.map(({ id }) => id), [], `Public region ${region}/${width}/${theme}`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const toggle = page.getByRole('button', { name: 'توقف حرکت‌های مدار', exact: true });
  if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
  await page.locator('[aria-labelledby="use-cases-title"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-orbit-section]')).every(element => element.dataset.motion === 'on'));
  assert.notEqual(await page.locator('[aria-labelledby="use-cases-title"] > div > ul > li').first().evaluate(element => getComputedStyle(element).animationName), 'none');
  await toggle.click();
  assert.ok(await page.locator('[data-orbit-section]').evaluateAll(elements => elements.every(element => element.dataset.motion === 'off')));
  assert.equal(await page.locator('[aria-labelledby="use-cases-title"] > div > ul > li').first().evaluate(element => getComputedStyle(element).animationName), 'none');
  await toggle.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-orbit-section]')).every(element => element.dataset.motion === 'off'));
  for (const region of regions) assert.equal(await staticPage.locator(`[aria-labelledby="${region}"]`).isVisible(), true);
  for (const details of await staticPage.locator('#faq details, [data-static-process] details').all()) {
    await details.locator('summary').click();
    assert.equal(await details.locator('p').isVisible(), true);
  }
  assert.equal(await staticPage.locator('[data-static-process] details').count(), 6);
  await staticPage.locator('[data-brand-mark] img').first().evaluate(image => image.decode());
  for (const theme of ['simple-light', 'simple-dark']) {
    await staticPage.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const filter = await staticPage.locator('[data-brand-mark] img').first().evaluate(image => getComputedStyle(image).filter);
    assert.ok(filter.includes(theme === 'simple-dark' ? 'brand-dark-' : 'brand-light-'), 'Theme-aware brand must also render without app JavaScript.');
  }
  console.log('Orbit public sections passed: approved logos, 24 process keyboard/Axe states, 24 FAQ disclosures, 24 region Axe scans, shared pause, OS reduced motion and no-JS content.');
}
