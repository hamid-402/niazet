import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Called only with the disposable database created by the role-workflow runner.
export async function verifyBi({ databaseUrl, origin, token, serviceId, ok, expectStatus }) {
  assert.match(new URL(databaseUrl).pathname, /^\/niazat_e2e_[a-z0-9_]+$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (let index = 0; index < 6; index++) {
      const user = await db.user.create({ data: { role: 'customer', status: 'active', fullName: 'BI isolated fixture', phone: `bi-${randomUUID()}` } });
      const dates = index < 5 ? ['2024-01-10T10:00:00Z'] : ['2024-02-10T10:00:00Z'];
      if (index < 2) dates.push('2024-02-15T10:00:00Z');
      if (index === 0) dates.push('2024-03-15T10:00:00Z');
      for (const date of dates) {
        const at = new Date(date);
        await db.order.create({ data: { code: `BI-${randomUUID()}`, customerId: user.id, serviceId, title: 'BI fixture', briefDescription: 'Isolated reporting sample', createdAt: at, paidAt: at, submittedAt: at } });
      }
    }
    const path = '/admin/reports/bi?from=2024-01-01&to=2024-06-30';
    for (const role of ['ops', 'finance', 'superAdmin']) {
      const report = await ok(origin, path, { token: token[role] });
      assert.equal(report.funnel.find(row => row.stage === 'created').count, 9);
      assert.equal(report.funnel.find(row => row.stage === 'paid').count, 9);
      assert.equal(report.funnel.find(row => row.stage === 'quoted').count, 0);
      assert.deepEqual(report.cohorts[0], { month: '2024-01', customers: 5, suppressed: false, day30: 40, day60: 20, day90: 0 });
      assert.deepEqual(report.cohorts[1], { month: '2024-02', customers: null, suppressed: true, day30: null, day60: null, day90: null });
      assert.equal(report.weekly.reduce((sum, row) => sum + row.orders, 0), 9);
      assert.equal(report.forecast.available, true);
      assert.equal(report.forecast.nextWeek, 0, 'Empty complete weeks must count as zero, not disappear.');
      assert.ok(!JSON.stringify(report).includes('BI isolated fixture'), 'BI must not expose customer identity.');
    }
    const early = await ok(origin, '/admin/reports/bi?from=2024-01-01&to=2024-02-20', { token: token.ops });
    assert.equal(early.cohorts[0].day30, null, 'Partial retention windows must not be reported.');
    const oneDay = await ok(origin, '/admin/reports/bi?from=2024-01-10&to=2024-01-10', { token: token.finance });
    assert.equal(oneDay.funnel[0].count, 5);
    assert.equal(oneDay.forecast.available, false);
    await expectStatus(origin, 'BI invalid dates', '/admin/reports/bi?from=2024-06-30&to=2024-01-01', token.ops, 400);
    await expectStatus(origin, 'BI bounded range', '/admin/reports/bi?from=2023-01-01&to=2024-06-30', token.ops, 400);
    for (const role of ['customer', 'executor', 'support']) {
      await expectStatus(origin, `BI excludes ${role}`, path, token[role], 403);
    }
    await expectStatus(origin, 'BI excludes anonymous users', path, undefined, 401);
    assert.ok(await db.auditLog.count({ where: { action: 'report.bi.read' } }) >= 5, 'BI reads must be audited.');
    console.log('Phase 9 BI passed: real SQL, funnel counts, empty weeks, retention/suppression, incomplete windows, role boundaries and audit.');
  } finally {
    await db.$disconnect();
  }
}
