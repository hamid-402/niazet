import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
export async function verifySuggestions({ databaseUrl, origin, token, orderId, executorProfileId, ok, expectStatus }) {
  assert.match(new URL(databaseUrl).pathname, /^\/niazat_e2e_[a-z0-9_]+$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const before = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const assignments = await db.orderAssignment.count();
    const ledger = await db.ledgerEntry.count();
    const path = `/admin/orders/${orderId}/suggestions`;
    const report = await ok(origin, path, { token: token.ops });
    assert.equal(report.requiresHumanReview, true);
    assert.equal(report.method, 'rules_v1');
    assert.ok(report.candidates.some(row => row.id === executorProfileId), 'Eligible internal executor should be suggested.');
    assert.equal(report.candidates.some(row => 'phone' in row || 'user' in row || 'email' in row), false, 'Suggestions should minimize personal data.');
    const unvetted = await db.executorProfile.findMany({ where: { executorType: 'vetted_external', verificationStatus: { not: 'approved' } }, select: { id: true } });
    assert.equal(report.candidates.some(row => unvetted.some(candidate => candidate.id === row.id)), false);
    for (const role of ['customer', 'executor', 'support', 'finance']) await expectStatus(origin, `suggestions deny ${role}`, path, token[role], 403);
    await ok(origin, path, { token: token.superAdmin });
    await expectStatus(origin, 'suggestions deny anonymous', path, undefined, 401);
    const profile = await db.executorProfile.findUniqueOrThrow({ where: { id: executorProfileId } });
    await db.executorProfile.update({ where: { id: executorProfileId }, data: { capacityPercent: 100 } });
    try { assert.equal((await ok(origin, path, { token: token.ops })).candidates.some(row => row.id === executorProfileId), false); }
    finally { await db.executorProfile.update({ where: { id: executorProfileId }, data: { capacityPercent: profile.capacityPercent } }); }
    assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: orderId } }), before, 'Suggestions must not mutate the order, quote or version.');
    assert.equal(await db.orderAssignment.count(), assignments);
    assert.equal(await db.ledgerEntry.count(), ledger);
    assert.ok(await db.auditLog.count({ where: { action: 'order.suggestions_read', entityId: orderId } }) >= 3);
    console.log('Human-reviewed matching/pricing passed: eligible-only candidates, capacity, role boundaries, audit and no financial/order mutation.');
  } finally { await db.$disconnect(); }
}
