import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

export async function verifyCustomerDecisions({ pages, webOrigin, databaseUrl, orderId, PrismaClient, LedgerService, artifactRoot, viewports, themes, settle, runtimeSnapshot }) {
  assert.match(new URL(databaseUrl).pathname, /^\/niazat_ui_[a-z0-9_]+$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const ledger = new LedgerService(db);
  let customer, ops, executor;
  const contexts = [];
  const report = { status: 'pending', additionalScreenshots: 0, additionalAxeScans: 0 };
  async function navigate(page, path) {
    await page.setViewportSize({ width: 1280, height: 900 });
    const parent = path.startsWith('/executor/') ? '/executor/orders' : path.startsWith('/admin/qc/') ? '/admin/qc' : path.startsWith('/admin/') ? '/admin/orders' : '/orders';
    const home = parent.startsWith('/executor') ? '/executor' : parent.startsWith('/admin') ? '/admin' : '/dashboard';
    if (new URL(page.url()).pathname === parent) {
      await page.locator(`a[href="${home}"]:visible`).first().click();
      await page.waitForURL(url => url.pathname === home);
    }
    await page.locator(`a[href="${parent}"]:visible`).first().click();
    await page.waitForURL(url => url.pathname === parent);
    await page.locator(`a[href="${path}"]:visible`).first().click();
    await page.waitForURL(url => url.pathname === path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await settle(page);
    assert.equal(new URL(page.url()).pathname, path, 'Never accept a login/redirect screenshot as an order page.');
  }
  async function act(page, path, button) {
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === `/api/backend${path}` && r.request().method() === 'POST'),
      button.click(),
    ]);
    assert.equal(response.ok(), true, `${path}: ${response.status()} ${await response.text()}`);
  }
  async function scan(page, label) {
    for (const viewport of viewports) for (const theme of themes) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.evaluate(id => { document.documentElement.dataset.theme = id; window.scrollTo({ top: 0, behavior: 'instant' }); }, theme.id);
      await settle(page);
      assert.deepEqual((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations, [], `Customer decision ${label}: accessibility.`);
      assert.ok((await runtimeSnapshot(page, label)).overflowX <= 1);
      const dialog = page.getByRole('alertdialog');
      if (await dialog.count()) {
        const box = await dialog.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height, `${label}: modal must fit the viewport.`);
      }
      await page.screenshot({ path: resolve(artifactRoot, `customer-decision-${label}-${viewport.id}-${theme.id}.png`), fullPage: true, animations: 'disabled' });
      report.additionalScreenshots += 1; report.additionalAxeScans += 1;
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  async function fund(id, customerId, amount) {
    // Financial fixture only: real Ledger projection, never a standalone wallet write.
    await db.order.update({ where: { id }, data: { finalPrice: amount, paidAt: new Date() } });
    const payment = await db.payment.create({ data: { orderId: id, customerId, amount, gateway: 'mock', status: 'succeeded', verifiedAt: new Date(), idempotencyKey: randomUUID() } });
    const hold = await db.escrowHold.create({ data: { orderId: id, paymentId: payment.id, amount } });
    await db.$transaction(async tx => {
      const clearing = await ledger.getSystemAccount('payment_gateway_clearing', tx);
      const escrow = await ledger.getSystemAccount('platform_escrow', tx);
      await ledger.postEntry({ debitAccountId: clearing.id, creditAccountId: escrow.id, amount, referenceType: 'payment', referenceId: payment.id }, tx);
    });
    return hold;
  }
  async function redeliver() {
    await navigate(executor, `/executor/orders/${orderId}`);
    await executor.getByRole('textbox', { name: 'شرح تحویل خروجی', exact: true }).fill('نسخه بازبینی‌شده مطابق نتیجه کنترل کیفیت آماده است.');
    await executor.locator('input[type="file"][aria-label="افزودن فایل خروجی"]').setInputFiles({ name: `decision-${randomUUID()}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Reviewed customer decision output.') });
    const send = executor.getByRole('button', { name: /ارسال (مجدد )?برای QC/ });
    await act(executor, `/executor/orders/${orderId}/deliver`, send);
    const review = await db.qcReview.findFirstOrThrow({ where: { orderId, result: null } });
    return review.id;
  }
  async function decideQc(reviewId, action) {
    await navigate(ops, `/admin/qc/${reviewId}`);
    await ops.getByRole('textbox', { name: 'یادداشت کنترل کیفیت', exact: true }).fill('نتیجه آزمون مرورگری پس از تطبیق فایل و معیارها');
    if (action === 'approve') for (const checkbox of await ops.getByRole('checkbox').all()) await checkbox.check();
    const name = { approve: 'تایید برای مشتری', reject: 'رد', 'request-rework': 'درخواست اصلاح' }[action];
    await act(ops, `/admin/qc/${reviewId}/${action}`, ops.getByRole('button', { name, exact: true }));
    await ops.waitForURL(url => url.pathname === '/admin/qc');
  }
  try {
    // Independent real UI logins for this late acceptance flow; do not reuse
    // the access-token lifetime or navigation state of the earlier matrix.
    const browser = pages.get('customer').context().browser();
    const fresh = {};
    for (const [role, phone, home] of [['customer', '09120000009', '/dashboard'], ['ops', '09120000002', '/admin'], ['executor', '09120000005', '/executor']]) {
      const context = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran', reducedMotion: 'reduce' });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(`${webOrigin}/login`); await settle(page);
      await page.locator('input[autocomplete="tel"]').fill(phone);
      await page.locator('input[autocomplete="current-password"]').fill('Passw0rd!123');
      await Promise.all([page.waitForURL(url => url.pathname === home), page.locator('button[type="submit"]').click()]);
      await settle(page); fresh[role] = page;
    }
    ({ customer, ops, executor } = fresh);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.status, 'delivered', 'Use the existing real executor/QC delivery fixture.');
    const amount = 250000, hold = await fund(orderId, order.customerId, amount);
    await navigate(customer, `/orders/${orderId}`);
    await scan(customer, 'delivered');
    const confirmTrigger = customer.getByRole('button', { name: 'تایید تحویل', exact: true });
    let confirmRequests = 0, disputeRequests = 0;
    customer.on('request', request => {
      if (request.method() !== 'POST') return;
      const path = new URL(request.url()).pathname;
      if (path === `/api/backend/customer/orders/${orderId}/confirm`) confirmRequests += 1;
      if (path === `/api/backend/customer/orders/${orderId}/dispute`) disputeRequests += 1;
    });
    await confirmTrigger.click();
    let dialog = customer.getByRole('alertdialog', { name: 'تأیید تحویل سفارش', exact: true });
    await dialog.getByRole('button', { name: 'انصراف', exact: true }).waitFor();
    await customer.waitForFunction(() => document.activeElement?.textContent === 'انصراف');
    await customer.keyboard.press('Shift+Tab');
    assert.equal(await dialog.getByRole('button', { name: 'تأیید نهایی تحویل', exact: true }).evaluate(element => element === document.activeElement), true);
    await customer.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button', { name: 'انصراف', exact: true }).evaluate(element => element === document.activeElement), true);
    assert.equal(await dialog.getByRole('textbox').count(), 0, 'No unsaved/unused confirmation note field.');
    await scan(customer, 'confirm-modal');
    await customer.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await confirmTrigger.evaluate(element => element === document.activeElement), true);
    assert.equal(confirmRequests, 0);
    await customer.getByRole('button', { name: 'ثبت اختلاف', exact: true }).click();
    dialog = customer.getByRole('alertdialog', { name: 'ثبت اختلاف سفارش', exact: true });
    const submitDispute = dialog.getByRole('button', { name: 'ثبت و ارسال اختلاف', exact: true });
    assert.equal(await submitDispute.isDisabled(), true);
    await dialog.getByRole('textbox', { name: 'شرح اختلاف', exact: false }).fill('   ');
    assert.equal(await submitDispute.isDisabled(), true);
    await scan(customer, 'dispute-modal');
    await dialog.getByRole('button', { name: 'انصراف', exact: true }).click();
    assert.equal(disputeRequests, 0);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'delivered');
    await customer.getByRole('button', { name: 'ثبت اختلاف', exact: true }).click();
    await customer.getByRole('alertdialog').getByRole('textbox').fill('خروجی با معیار توافق‌شده مغایرت دارد و نیازمند بررسی انسانی است.');
    await act(customer, `/customer/orders/${orderId}/dispute`, customer.getByRole('alertdialog').getByRole('button', { name: 'ثبت و ارسال اختلاف', exact: true }));
    await customer.getByRole('alertdialog').waitFor({ state: 'hidden' });
    assert.equal(disputeRequests, 1);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'disputed');
    assert.equal((await db.escrowHold.findUniqueOrThrow({ where: { id: hold.id } })).releasedAmount, 0);
    await navigate(ops, `/admin/orders/${orderId}`);
    const resolve = ops.getByRole('button', { name: 'بازگشت برای اصلاح مجدد', exact: true });
    assert.equal(await resolve.isDisabled(), true);
    await ops.getByLabel('یادداشت تصمیم (اجباری)', { exact: true }).fill('رسیدگی انسانی: بازکاری طبق موارد اعلام‌شده مشتری');
    await act(ops, `/admin/orders/${orderId}/resolve-dispute`, resolve);
    for (const action of ['request-rework', 'reject', 'approve']) await decideQc(await redeliver(), action);
    await navigate(customer, `/orders/${orderId}`);
    await customer.getByText('درخواست اصلاح', { exact: true }).click();
    await customer.getByRole('textbox', { name: 'دلیل درخواست اصلاح', exact: true }).fill('تکمیل آخرین مورد از معیارهای پذیرش توافق‌شده');
    await act(customer, `/customer/orders/${orderId}/revision`, customer.getByRole('button', { name: 'ثبت درخواست اصلاح', exact: true }));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).revisionsUsed, 1);
    await decideQc(await redeliver(), 'approve');
    await navigate(customer, `/orders/${orderId}`);
    await customer.getByRole('button', { name: 'تایید تحویل', exact: true }).click();
    const confirmPath = `/api/backend/customer/orders/${orderId}/confirm`;
    // Fail both attempts allowed by the existing API client's POST retry policy.
    const failRequest = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'خطای موقت آزمون؛ دوباره تلاش کنید.' }) });
    await customer.route(`**${confirmPath}`, failRequest, { times: 2 });
    await customer.getByRole('alertdialog').getByRole('button', { name: 'تأیید نهایی تحویل', exact: true }).click();
    await customer.getByRole('alertdialog').getByRole('alert').filter({ hasText: 'خطای موقت آزمون' }).waitFor();
    await customer.waitForFunction(() => document.querySelector('[role="alertdialog"]')?.contains(document.activeElement));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'delivered');
    const releaseBefore = await db.ledgerEntry.count({ where: { referenceType: 'escrow_release', referenceId: hold.id } });
    const retry = customer.getByRole('alertdialog').getByRole('button', { name: 'تأیید نهایی تحویل', exact: true });
    await retry.waitFor();
    let releaseRequest;
    const requestGate = new Promise(resolveGate => { releaseRequest = resolveGate; });
    const holdRequest = async route => { await requestGate; await route.continue(); };
    await customer.route(`**${confirmPath}`, holdRequest);
    const requestSeen = customer.waitForRequest(request => new URL(request.url()).pathname === confirmPath && request.method() === 'POST');
    const confirmed = customer.waitForResponse(response => new URL(response.url()).pathname === confirmPath && response.ok());
    await retry.click(); await requestSeen;
    const pending = customer.getByRole('alertdialog').getByRole('button', { name: 'در حال ثبت...', exact: true });
    assert.equal(await pending.isDisabled(), true);
    await pending.dispatchEvent('click');
    await customer.keyboard.press('Enter'); await customer.keyboard.press('Escape');
    assert.equal(await customer.getByRole('alertdialog').isVisible(), true, 'Pending decisions must not be dismissed or sent twice.');
    releaseRequest(); await confirmed;
    await customer.unroute(`**${confirmPath}`, holdRequest);
    await customer.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await customer.getByRole('button', { name: 'تایید تحویل', exact: true }).waitFor({ state: 'hidden' });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'closed');
    assert.equal((await db.escrowHold.findUniqueOrThrow({ where: { id: hold.id } })).releasedAmount, amount);
    assert.equal(await db.ledgerEntry.count({ where: { referenceType: 'escrow_release', referenceId: hold.id } }), releaseBefore + 1);
    assert.equal(confirmRequests, 3, 'Two failed retry attempts and one successful confirmation, with no duplicate submit.');
    const cancelled = await db.order.create({ data: { code: `UI-CANCEL-${randomUUID()}`, customerId: order.customerId, serviceId: order.serviceId, title: 'سفارش پذیرش لغو مالی', briefDescription: 'fixture ایزوله برای آزمون UI لغو', status: 'paid' } });
    await fund(cancelled.id, order.customerId, amount);
    const balanceBefore = (await db.wallet.findUniqueOrThrow({ where: { userId: order.customerId } })).balance;
    await navigate(ops, `/admin/orders/${cancelled.id}`);
    assert.equal(await ops.getByRole('button', { name: 'لغو سفارش', exact: true }).isDisabled(), true);
    await ops.getByLabel('دلیل لغو', { exact: true }).fill('لغو با بررسی انسانی و بازپرداخت کامل مرحله پیش از اجرا');
    await act(ops, `/admin/orders/${cancelled.id}/cancel`, ops.getByRole('button', { name: 'لغو سفارش', exact: true }));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: cancelled.id } })).status, 'cancelled');
    assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: order.customerId } })).balance, balanceBefore + amount);
    const executorUser = await db.user.findUniqueOrThrow({ where: { phone: '09120000005' } });
    for (const id of [order.customerId, executorUser.id]) assert.equal((await ledger.verifyWalletConsistency(id)).consistent, true);
    report.status = 'passed';
    report.confirmRequests = confirmRequests; report.disputeRequests = disputeRequests;
    console.log(`Customer decisions passed: modal cancel/focus, required dispute note, real Ops/QC/revision loop, failed-confirm retry, one release, financial cancellation, ${report.additionalAxeScans} extra Axe/screenshots.`);
    return report;
  } finally {
    for (const context of contexts) await context.close();
    await db.$disconnect();
  }
}
