import { subscriptionIsActive, requireMembership } from './organization-policy';
describe('organization boundaries', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const valid = {
    status: 'active',
    startsAt: new Date(now.getTime() - 1000),
    endsAt: new Date(now.getTime() + 1000),
  };
  it('enforces an exclusive subscription end and status', () => {
    expect(subscriptionIsActive(valid, now)).toBe(true);
    expect(subscriptionIsActive({ ...valid, endsAt: now }, now)).toBe(false);
    expect(
      subscriptionIsActive(
        { ...valid, startsAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(false);
    expect(subscriptionIsActive({ ...valid, status: 'cancelled' }, now)).toBe(
      false,
    );
    expect(subscriptionIsActive(null, now)).toBe(false);
  });
  it.each([
    null,
    { status: 'invited', role: 'owner' },
    { status: 'revoked', role: 'owner' },
    { status: 'active', role: 'member' },
  ])('rejects unauthorized owner operations: %p', async (member) => {
    const tx = {
      organizationMember: { findUnique: jest.fn().mockResolvedValue(member) },
    };
    await expect(
      requireMembership(tx as never, 'org', 'user', ['owner']),
    ).rejects.toThrow();
  });
  it('checks the exact organization/user membership', async () => {
    const tx = {
      organizationMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'active', role: 'owner' }),
      },
    };
    await expect(
      requireMembership(tx as never, 'org', 'user', ['owner']),
    ).resolves.toMatchObject({ role: 'owner' });
    expect(tx.organizationMember.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: { organizationId: 'org', userId: 'user' },
      },
    });
  });
});
