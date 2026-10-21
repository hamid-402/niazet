import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export async function verifyOnboarding({ databaseUrl, origin, token, orderId, executorProfileId, ok, call, expectStatus }) {
  assert.match(new URL(databaseUrl).pathname, /^\/niazat_e2e_[a-z0-9_]+$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const staff = await ok(origin, '/admin/staff', { method: 'POST', token: token.ops, body: { phone: `onboarding-${randomUUID()}`, fullName: 'Isolated applicant', displayAlias: 'مجری آزمایشی', executorType: 'vetted_external' } });
    const id = staff.profile.id;
    const path = `/admin/staff/${id}/onboarding`;
    assert.equal((await ok(origin, path, { token: token.ops })).onboarding.stage, 'registered');
    const assign = () => call(origin, `/admin/orders/${orderId}/assign`, { method: 'POST', token: token.ops, body: { executorProfileId: id } });
    assert.equal((await assign()).response.status, 400, 'Unvetted applicants cannot receive real orders.');
    for (const body of [{ verificationStatus: 'approved' }, { executorType: 'internal_staff' }]) {
      const denied = await call(origin, `/admin/staff/${id}/profile`, { method: 'PATCH', token: token.ops, body: { ...body, note: 'Attempt bypass check' } });
      assert.equal(denied.response.status, 400, 'Profile edits must not bypass vetting.');
    }
    for (const role of ['finance', 'customer', 'executor', 'support']) {
      await expectStatus(origin, `onboarding read denies ${role}`, path, token[role], 403);
      assert.equal((await call(origin, `${path}/review`, { method: 'POST', token: token[role], body: { version: 0, decision: 'approve_step', note: 'Unauthorized review' } })).response.status, 403);
    }
    const review = (version, extra = {}) => call(origin, `${path}/review`, { method: 'POST', token: token.ops, body: { version, decision: 'approve_step', note: 'Human reviewed isolated evidence', ...extra } });
    const race = await Promise.all([review(0), review(0)]);
    assert.deepEqual(race.map(row => row.response.status).sort(), [201, 409], 'Only one same-version review may commit.');
    assert.equal((await review(1)).response.status, 400, 'Identity approval must require evidence.');
    let version = 1;
    for (const next of ['skills_exam', 'interview', 'reference_check', 'contract', 'nda', 'trial_period', 'limited_access', 'initial_evaluation', 'approved']) {
      const result = await review(version, { evidenceReference: `DOC-${version}` });
      assert.equal(result.response.status, 201, JSON.stringify(result.payload));
      assert.equal(result.payload.stage, next);
      version++;
      if (next === 'limited_access') assert.equal((await assign()).response.status, 400, 'Trial/limited access cannot access real customer work.');
    }
    const dossier = await ok(origin, path, { token: token.superAdmin });
    assert.equal(dossier.verificationStatus, 'approved');
    assert.equal(dossier.onboarding.reviews.length, 10);
    const skills = await db.executorSkill.findMany({ where: { executorProfileId } });
    await db.executorSkill.createMany({ data: skills.map(row => ({ executorProfileId: id, skillId: row.skillId, level: row.level })) });
    const source = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const eligibleOrder = await db.order.create({ data: { customerId: source.customerId, serviceId: source.serviceId, code: `ONBOARD-${randomUUID()}`, title: 'Vetting assignment probe', briefDescription: 'Isolated fixture', status: 'paid', paidAt: new Date(), finalPrice: 10000 } });
    assert.equal((await ok(origin, `/admin/orders/${eligibleOrder.id}/assign`, { method: 'POST', token: token.ops, body: { executorProfileId: id } })).status, 'assigned');
    assert.equal((await review(version, { decision: 'reject' })).response.status, 409, 'Revocation requires active assignments to be resolved.');
    await db.orderAssignment.updateMany({ where: { orderId: eligibleOrder.id }, data: { unassignedAt: new Date() } });
    assert.equal((await review(version, { decision: 'reject' })).payload.stage, 'rejected');
    assert.equal((await review(++version, { decision: 'reopen' })).payload.stage, 'registered');
    assert.ok(await db.auditLog.count({ where: { entityId: id, action: 'onboarding.reviewed' } }) >= 12);
    console.log('External onboarding passed: all stages, evidence, concurrent review, role boundaries, bypass rejection, real assignment eligibility, revocation and reopening.');
  } finally { await db.$disconnect(); }
}
