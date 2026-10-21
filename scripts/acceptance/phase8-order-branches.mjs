import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const { LedgerService } = apiRequire('./dist/finance/ledger.service.js');

export async function verifyOrderBranches({ databaseUrl, origin, token, accounts, serviceId, executorProfileId, uploadedStorageKeys, ok, call }) {
  assert.match(new URL(databaseUrl).pathname, /^\/niazat_e2e_[a-z0-9_]+$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const ledger = new LedgerService(db);
  const amount = 1000000;
  const fixtureOrderIds = [];
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), isolation: 'temporary-postgresql-with-mock-providers', status: 'running', cases: [], rejectedMutations: 0, manualSettlements: [] };
  const post = (path, role, body, key = randomUUID()) => ok(origin, path, { method: 'POST', token: token[role], headers: { 'Idempotency-Key': key }, body });
  const balance = async role => (await db.wallet.findUnique({ where: { userId: accounts[role].user.id } }))?.balance ?? 0;
  async function financialSnapshot(id) {
    return {
      order: await db.order.findUniqueOrThrow({ where: { id } }),
      holds: await db.escrowHold.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } }),
      refunds: await db.refund.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } }),
      ledgerCount: await db.ledgerEntry.count(),
      historyCount: await db.orderStatusHistory.count({ where: { orderId: id } }),
      messageCount: await db.orderMessage.count({ where: { orderId: id } }),
      reviewItems: await db.qcReviewItem.count({ where: { qcReview: { orderId: id } } }),
      customerBalance: await balance('customer'), executorBalance: await balance('executor'),
    };
  }
  async function reject(path, role, body, id, expected = 400) {
    const before = await financialSnapshot(id);
    const result = await call(origin, path, { method: 'POST', token: token[role], headers: { 'Idempotency-Key': randomUUID() }, body });
    assert.equal(result.response.status, expected, `${path}: ${JSON.stringify(result.payload)}`);
    assert.deepEqual(await financialSnapshot(id), before, `${path}: rejected mutation changed order or money.`);
    report.rejectedMutations += 1;
  }
  async function replay(path, role, body, id, key, expectedStatus) {
    const before = await financialSnapshot(id);
    const result = await post(path, role, body, key);
    assert.equal(result.status ?? result.escrow?.status, expectedStatus);
    assert.deepEqual(await financialSnapshot(id), before, `${path}: replay duplicated a transition or financial effect.`);
  }
  async function create(stage = 'draft') {
    let order = await post('/customer/orders', 'customer', {
      serviceId, title: `Branch acceptance ${randomUUID()}`, urgency: 'normal',
      briefDescription: 'Isolated acceptance of exception paths, never persistent customer data.',
      formResponses: { goal: 'Verify exceptional workflow and financial invariants.' },
      acceptanceCriteria: ['Output matches the agreed brief.', 'Output file is safely downloadable.'],
    });
    fixtureOrderIds.push(order.id);
    if (stage === 'draft') return order;
    await post(`/customer/orders/${order.id}/submit`, 'customer');
    await post(`/admin/orders/${order.id}/triage`, 'ops', { decision: 'send_to_quote', note: 'Branch acceptance triage' });
    await post(`/admin/orders/${order.id}/quote`, 'ops', { finalPrice: amount, note: 'Branch acceptance price' });
    await post(`/customer/orders/${order.id}/accept-quote`, 'customer');
    const intent = await post(`/customer/orders/${order.id}/pay`, 'customer', {});
    await post(`/customer/orders/${order.id}/payments/${intent.payment.id}/verify`, 'customer');
    order = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(order.status, 'paid');
    if (stage === 'paid') return order;
    await post(`/admin/orders/${order.id}/assign`, 'ops', { executorProfileId, assignmentRole: 'pursuit_owner', note: 'Branch acceptance assignment' });
    if (stage === 'assigned') return db.order.findUniqueOrThrow({ where: { id: order.id } });
    const accepted = await post(`/executor/orders/${order.id}/accept`, 'executor');
    for (const item of accepted.executionChecklistItems) {
      await ok(origin, `/executor/orders/${order.id}/checklist/${item.id}`, { method: 'PATCH', token: token.executor, body: { completed: true } });
    }
    order = await post(`/executor/orders/${order.id}/start`, 'executor');
    assert.equal(order.status, 'in_progress');
    return order;
  }
  async function deliver(id, fileId) {
    await post(`/executor/orders/${id}/deliver`, 'executor', { summary: 'Branch acceptance delivery', fileIds: [fileId] });
    const queue = await ok(origin, '/admin/qc/queue', { token: token.ops });
    const entry = queue.find(row => row.order.id === id);
    assert.ok(entry, 'Delivery must enter the real QC queue.');
    const review = await ok(origin, `/admin/qc/${entry.id}`, { token: token.ops });
    return { id: review.id, items: review.order.serviceLine.qcChecklistTemplates.flatMap(template => template.items).map(item => ({ checklistItemId: item.id, passed: true })) };
  }
  async function approve(id, fileId) {
    const review = await deliver(id, fileId);
    const result = await post(`/admin/qc/${review.id}/approve`, 'ops', { comment: 'All acceptance criteria checked', items: review.items });
    assert.equal(result.status, 'delivered');
  }
  async function settleRemainder(id) {
    const before = await financialSnapshot(id), hold = before.holds[0];
    const remaining = hold.amount - hold.refundedAmount - hold.releasedAmount;
    if (!remaining) return;
    const path = `/admin/finance/escrow/${id}/release`, key = randomUUID();
    const body = { amount: remaining, note: 'Explicit human finance settlement of the remainder in an isolated test' };
    await reject(path, 'ops', body, id, 403);
    await reject(path, 'finance', { ...body, amount: remaining + 1 }, id);
    const result = await post(path, 'finance', body, key);
    assert.equal(result.escrow.refundedAmount + result.escrow.releasedAmount, hold.amount);
    assert.equal(result.escrow.status, 'settled');
    const after = await financialSnapshot(id);
    assert.deepEqual(after.order, before.order, 'Finance settlement must not change the terminal order state.');
    assert.equal(after.customerBalance, before.customerBalance);
    assert.equal(after.executorBalance, before.executorBalance + result.executorAmount);
    assert.equal(result.executorAmount + result.commissionAmount, remaining);
    await replay(path, 'finance', body, id, key, 'settled');
    report.manualSettlements.push({ orderId: id, amount: remaining, status: 'settled' });
  }
  try {
    const draft = await create();
    const walletBefore = await balance('customer');
    assert.equal((await post(`/customer/orders/${draft.id}/cancel`, 'customer', { reason: 'Customer cancelled before payment' })).status, 'cancelled');
    assert.equal(await balance('customer'), walletBefore);
    assert.equal(await db.escrowHold.count({ where: { orderId: draft.id } }), 0);
    await reject(`/customer/orders/${draft.id}/submit`, 'customer', undefined, draft.id);
    report.cases.push({ name: 'customer-prepayment-cancel', finalStatus: 'cancelled', refund: 0 });

    for (const [stage, refund] of [['paid', amount], ['assigned', amount], ['in_progress', amount / 2]]) {
      const order = await create(stage);
      await reject(`/customer/orders/${order.id}/cancel`, 'customer', { reason: 'Customer cannot bypass financial review' }, order.id);
      await reject(`/admin/orders/${order.id}/cancel`, 'finance', { reason: 'Finance is not Ops' }, order.id, 403);
      const before = await balance('customer');
      const key = randomUUID(), path = `/admin/orders/${order.id}/cancel`, body = { reason: `Accepted cancellation from ${stage}` };
      assert.equal((await post(path, 'ops', body, key)).status, 'cancelled');
      assert.equal(await balance('customer'), before + refund);
      const hold = await db.escrowHold.findFirstOrThrow({ where: { orderId: order.id } });
      assert.equal(hold.refundedAmount, refund); assert.equal(hold.releasedAmount, 0);
      assert.equal(hold.status, refund === amount ? 'refunded' : 'partially_refunded');
      assert.equal(await db.refund.count({ where: { orderId: order.id } }), 1);
      await replay(path, 'ops', body, order.id, key, 'cancelled');
      await reject(path, 'ops', body, order.id);
      const history = await db.orderStatusHistory.findFirstOrThrow({ where: { orderId: order.id, toStatus: 'cancelled' } });
      assert.equal(history.financialEffectAmount, refund);
      report.cases.push({ name: `ops-cancel-${stage}`, finalStatus: 'cancelled', refund, remainingAfterCancellation: amount - refund });
      await settleRemainder(order.id);
    }

    const revised = await create('in_progress');
    await reject(`/executor/orders/${revised.id}/deliver`, 'executor', { summary: 'Unknown attachment must fail', fileIds: [randomUUID()] }, revised.id);
    const upload = new FormData();
    upload.set('orderId', revised.id); upload.set('fileKind', 'output');
    upload.set('file', new Blob(['Isolated branch acceptance output\n'], { type: 'text/plain' }), 'branch-output.txt');
    const file = await ok(origin, '/files/upload', { method: 'POST', token: token.executor, form: upload });
    uploadedStorageKeys.push(file.storageKey);
    assert.equal(file.scanStatus, 'clean');
    for (const action of ['reject', 'request-rework']) {
      const review = await deliver(revised.id, file.id);
      const allPassed = { comment: 'Cannot reject all-passed checks', items: review.items };
      await reject(`/admin/qc/${review.id}/${action}`, 'ops', allPassed, revised.id);
      const failedItems = review.items.map((item, index) => ({ ...item, passed: index !== 0 }));
      await reject(`/admin/qc/${review.id}/approve`, 'ops', { comment: 'Cannot approve failed checks', items: failedItems }, revised.id);
      assert.equal((await post(`/admin/qc/${review.id}/${action}`, 'ops', { comment: 'One criterion needs correction', items: failedItems })).status, 'in_progress');
      assert.equal((await db.qcReview.findUniqueOrThrow({ where: { id: review.id } })).result, action === 'reject' ? 'rejected' : 'needs_rework');
      await reject(`/admin/qc/${review.id}/${action}`, 'ops', { comment: 'Duplicate review', items: failedItems }, revised.id);
    }
    await approve(revised.id, file.id);
    await reject(`/customer/orders/${revised.id}/revision`, 'customer', { reason: 'Foreign criterion must fail', unmetCriteriaIds: [randomUUID()] }, revised.id);
    const criteria = await db.orderAcceptanceCriteria.findMany({ where: { orderId: revised.id } });
    assert.equal(revised.revisionsAllowed, 2);
    for (let revision = 1; revision <= revised.revisionsAllowed; revision += 1) {
      const body = { reason: `Customer correction ${revision}`, unmetCriteriaIds: [criteria[0].id] };
      assert.equal((await post(`/customer/orders/${revised.id}/revision`, 'customer', body)).status, 'in_progress');
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: revised.id } })).revisionsUsed, revision);
      assert.equal((await db.orderAcceptanceCriteria.findUniqueOrThrow({ where: { id: criteria[0].id } })).isMet, false);
      await reject(`/customer/orders/${revised.id}/revision`, 'customer', body, revised.id);
      await approve(revised.id, file.id);
    }
    await reject(`/customer/orders/${revised.id}/revision`, 'customer', { reason: 'Exceeded revision allowance' }, revised.id);
    assert.equal(await db.orderMessage.count({ where: { orderId: revised.id, messageType: 'revision_request' } }), 2);
    assert.equal(await db.orderStatusHistory.count({ where: { orderId: revised.id, toStatus: 'qc_rejected' } }), 2);
    assert.equal(await db.orderStatusHistory.count({ where: { orderId: revised.id, fromStatus: 'revision_requested', toStatus: 'in_progress', source: 'system' } }), 2);
    assert.equal((await post(`/customer/orders/${revised.id}/confirm`, 'customer')).status, 'closed');
    report.cases.push({ name: 'qc-reject-rework-and-customer-revision', qcRejections: 2, customerRevisions: 2, finalStatus: 'closed' });

    for (const resolutionType of ['rework', 'refund_full', 'refund_partial', 'release_to_executor']) {
      const order = await create('in_progress');
      const dispute = await post(`/customer/orders/${order.id}/dispute`, 'customer', { reason: 'Acceptance dispute', note: 'Needs explicit human resolution' });
      assert.equal(dispute.status, 'open');
      await reject(`/customer/orders/${order.id}/dispute`, 'customer', { reason: 'Duplicate', note: 'Must not create a second case' }, order.id);
      assert.equal(await db.dispute.count({ where: { orderId: order.id, status: 'open' } }), 1);
      await reject(`/admin/orders/${order.id}/cancel`, 'ops', { reason: 'Cannot bypass dispute resolution' }, order.id);
      const path = `/admin/orders/${order.id}/resolve-dispute`;
      const body = { resolutionType, note: 'Human-reviewed branch resolution', ...(resolutionType === 'refund_partial' ? { amount: amount / 4 } : {}) };
      await reject(path, 'customer', body, order.id, 403);
      if (resolutionType === 'refund_partial') {
        await reject(path, 'finance', { ...body, amount: amount + 1 }, order.id);
        await reject(path, 'finance', { ...body, amount: 0 }, order.id);
      }
      const before = await financialSnapshot(order.id), key = randomUUID();
      const result = await post(path, 'finance', body, key);
      const expectedStatus = { rework: 'in_progress', refund_full: 'cancelled', refund_partial: 'closed', release_to_executor: 'closed' }[resolutionType];
      assert.equal(result.status, expectedStatus);
      const after = await financialSnapshot(order.id), hold = after.holds[0];
      const refund = resolutionType === 'refund_full' ? amount : resolutionType === 'refund_partial' ? amount / 4 : 0;
      assert.equal(hold.refundedAmount, refund);
      assert.equal(after.customerBalance, before.customerBalance + refund);
      if (resolutionType === 'release_to_executor') {
        const configured = await db.systemSetting.findUnique({ where: { key: 'finance.commission_rate' } });
        const commission = Math.round(amount * (configured?.value ?? 0.2));
        assert.equal(hold.releasedAmount, amount);
        assert.equal(after.executorBalance, before.executorBalance + amount - commission);
        assert.equal(after.ledgerCount - before.ledgerCount, commission > 0 ? 2 : 1);
      } else {
        assert.equal(hold.releasedAmount, 0);
        assert.equal(after.executorBalance, before.executorBalance);
        assert.equal(after.ledgerCount - before.ledgerCount, refund ? 1 : 0);
      }
      assert.equal((await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status, 'resolved');
      assert.equal(await db.auditLog.count({ where: { entityId: order.id, action: 'order.dispute_resolved' } }), 1);
      await replay(path, 'finance', body, order.id, key, expectedStatus);
      await reject(path, 'finance', body, order.id);
      report.cases.push({ name: `dispute-${resolutionType}`, resolutionStatus: expectedStatus, refund, remainingAfterResolution: amount - hold.refundedAmount - hold.releasedAmount });
      if (resolutionType === 'rework') await post(`/admin/orders/${order.id}/cancel`, 'ops', { reason: 'End isolated rework fixture with policy refund' });
      await settleRemainder(order.id);
      report.cases.at(-1).finalStatus = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status;
    }
    const holds = await db.escrowHold.findMany({ where: { orderId: { in: fixtureOrderIds } } });
    report.unsettledHolds = holds.filter(hold => hold.amount !== hold.refundedAmount + hold.releasedAmount).length;
    assert.equal(report.unsettledHolds, 0, 'Every financial fixture must be explicitly settled or fully refunded.');
    report.terminalOrders = await db.order.count({ where: { id: { in: fixtureOrderIds }, status: { in: ['cancelled', 'closed'] } } });
    assert.equal(report.terminalOrders, fixtureOrderIds.length);
    for (const role of ['customer', 'executor']) assert.equal((await ledger.verifyWalletConsistency(accounts[role].user.id)).consistent, true, `${role} wallet diverged from Ledger.`);
    report.status = 'passed'; report.walletsConsistent = true;
    console.log(`Order branches passed: ${report.cases.length} cases, ${report.rejectedMutations} rejected mutations without order/money changes, idempotent financial replay and wallet/Ledger consistency.`);
    return report;
  } catch (error) {
    report.status = 'failed'; report.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    const directory = new URL('../../.artifacts/acceptance/', import.meta.url);
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL('order-branches.json', directory), `${JSON.stringify(report, null, 2)}\n`);
    await db.$disconnect();
  }
}
