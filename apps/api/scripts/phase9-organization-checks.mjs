import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
export async function verifyOrganizations({ databaseUrl, origin, token, serviceId, customerId, ok, call, expectStatus }) {
 assert.match(new URL(databaseUrl).pathname, /^\/niazat_e2e_[a-z0-9_]+$/);
 const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
 try {
  const ledgerBefore = await db.ledgerEntry.count();
  const baseUser = await db.user.findUniqueOrThrow({ where: { id: customerId } });
  const users = [];
  for (let i = 0; i < 2; i++) {
   const user = await db.user.create({ data: { role: 'customer', status: 'active', fullName: 'Organization isolated member', phone: `099${randomInt(10000000,99999999)}`, passwordHash: baseUser.passwordHash } });
   const session = await ok(origin, '/auth/login', { method: 'POST', body: { phone: user.phone, password: 'Passw0rd!123' } });
   users.push({ ...user, token: session.accessToken });
  }
  const [member, outsider] = users;
  const org = await ok(origin, '/customer/organizations', { method: 'POST', token: token.customer, body: { name: 'سازمان آزمایشی' } });
  const otherOrg = await ok(origin, '/customer/organizations', { method: 'POST', token: outsider.token, body: { name: 'سازمان جداگانه' } });
  const plan = await ok(origin, '/admin/organizations/plans', { method: 'POST', token: token.finance, body: { name: 'پلن تست', seats: 2, ordersPerPeriod: 1, durationDays: 30, feeToman: 0 } });
  const path = `/customer/organizations/${org.id}`;
  for (const role of ['ops', 'support', 'executor', 'customer']) await expectStatus(origin, `enterprise billing denies ${role}`, '/admin/organizations', token[role], 403);
  const activate = (id, version = 0) => ok(origin, `/admin/organizations/${id}/subscription`, { method: 'POST', token: token.finance, body: { planId: plan.id, version, contractReference: 'TEST-CONTRACT', note: 'Free isolated contract approval' } });
  await ok(origin, `${path}/plan-request`, { method: 'POST', token: token.customer, body: { planId: plan.id } });
  assert.equal((await ok(origin, path, { token: token.customer })).subscription, null, 'Plan request must not activate billing.');
  await activate(org.id); await activate(otherOrg.id);
  assert.equal((await call(origin, `/admin/organizations/${org.id}/subscription`, { method: 'POST', token: token.finance, body: { planId: plan.id, version: 0, contractReference: 'TEST-CONTRACT', note: 'Stale activation check' } })).response.status, 409);
  const team = await ok(origin, `${path}/teams`, { method: 'POST', token: token.customer, body: { name: 'تیم مشترک' } });
  const privateTeam = await ok(origin, `${path}/teams`, { method: 'POST', token: token.customer, body: { name: 'تیم خصوصی دیگر' } });
  const otherTeam = await ok(origin, `/customer/organizations/${otherOrg.id}/teams`, { method: 'POST', token: outsider.token, body: { name: 'تیم سازمان دیگر' } });
  assert.equal((await call(origin, `${path}/invitations`, { method: 'POST', token: token.customer, body: { phone: member.phone, role: 'member', teamId: otherTeam.id } })).response.status, 400);
  const invite = await ok(origin, `${path}/invitations`, { method: 'POST', token: token.customer, body: { phone: member.phone, role: 'member', teamId: team.id } });
  await expectStatus(origin, 'invited user cannot read organization before consent', path, member.token, 403);
  assert.equal((await call(origin, `${path}/invitations`, { method: 'POST', token: token.customer, body: { phone: outsider.phone, role: 'member' } })).response.status, 400, 'Pending invitations reserve seats.');
  assert.equal((await call(origin, `/customer/organizations/invitations/${invite.id}/respond`, { method: 'POST', token: outsider.token, body: { accept: true } })).response.status, 404);
  await ok(origin, `/customer/organizations/invitations/${invite.id}/respond`, { method: 'POST', token: member.token, body: { accept: true } });
  assert.equal((await ok(origin, path, { token: member.token })).membership.role, 'member');
  await expectStatus(origin, 'other tenant cannot read organization', path, outsider.token, 403);
  assert.equal((await call(origin, `${path}/teams`, { method: 'POST', token: member.token, body: { name: 'Unauthorized team' } })).response.status, 403);
  const drafts = [];
  for (let i = 0; i < 2; i++) drafts.push(await db.order.create({ data: { code: `ORG-${randomUUID()}`, customerId, serviceId, title: 'Organization draft', briefDescription: 'Private payer details', createdAt: new Date('2023-01-01T00:00:00Z') } }));
  const attach = (draft, extra = {}, access = token.customer) => call(origin, `${path}/orders`, { method: 'POST', token: access, body: { orderId: draft.id, teamId: team.id, version: draft.version, note: 'Share summary with my team', ...extra } });
  assert.equal((await attach(drafts[0], { teamId: otherTeam.id })).response.status, 400);
  assert.equal((await attach(drafts[0], {}, member.token)).response.status, 404, 'Membership does not transfer ownership of another payer draft.');
  const race = await Promise.all(drafts.map(draft => attach(draft)));
  assert.deepEqual(race.map(row => row.response.status).sort(), [201,400], 'Only one draft fits the subscription quota, even with old createdAt dates.');
  const attached = drafts.find(draft => race.some(row => row.payload?.id === draft.id));
  assert.ok(attached);
  await expectStatus(origin, 'team member cannot read payer private order details', `/customer/orders/${attached.id}`, member.token, 404);
  await db.order.create({ data: { code: `PRIVATE-${randomUUID()}`, customerId, serviceId, title: 'Other team summary', briefDescription: 'Private details', organizationId: org.id, organizationTeamId: privateTeam.id, organizationAttachedAt: new Date() } });
  const memberOrders = await ok(origin, `${path}/orders`, { token: member.token });
  assert.equal(memberOrders.total, 1);
  assert.deepEqual(Object.keys(memberOrders.items[0]).sort(), ['id','code','title','status','createdAt','organizationTeamId'].sort());
  assert.equal((await ok(origin, `${path}/orders`, { token: token.customer })).total, 2);
  const ownerMembership = (await ok(origin, path, { token: token.customer })).membership;
  assert.equal((await call(origin, `${path}/members/${ownerMembership.id}`, { method: 'PATCH', token: token.customer, body: { role: 'member', status: 'revoked', note: 'Cannot remove last owner' } })).response.status, 400);
  await ok(origin, `${path}/transfer-owner`, { method: 'POST', token: token.customer, body: { memberId: invite.id, note: 'Transfer to consenting active member' } });
  assert.equal((await ok(origin, path, { token: member.token })).membership.role, 'owner');
  await ok(origin, `${path}/members/${ownerMembership.id}`, { method: 'PATCH', token: member.token, body: { role: 'manager', status: 'revoked', note: 'Remove old organization member' } });
  await expectStatus(origin, 'revocation removes tenant access immediately', path, token.customer, 403);
  await ok(origin, `/admin/organizations/${org.id}/subscription/cancel`, { method: 'POST', token: token.finance, body: { version: 1, note: 'Cancel test contract entitlement' } });
  assert.equal((await call(origin, `${path}/teams`, { method: 'POST', token: member.token, body: { name: 'After cancellation' } })).response.status, 400);
  assert.equal((await ok(origin, path, { token: member.token })).subscription.active, false);
  assert.equal(await db.ledgerEntry.count(), ledgerBefore, 'Enterprise entitlement activation must never silently debit wallets.');
  assert.ok(await db.auditLog.count({ where: { entityId: org.id, action: { startsWith: 'organization.' } } }) >= 10);
  console.log('Organizations passed: consent, tenant/team isolation, financial ownership, quota concurrency, owner transfer, revocation, subscription versions and no hidden charges.');
 } finally { await db.$disconnect(); }
}
