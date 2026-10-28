import { ConfigService } from '@nestjs/config';
import { customerPrivateData } from './customer-private-data';

describe('owner-only additive private data export', () => {
  const config = (email = true, intake = true) =>
    new ConfigService({
      ZEUS_VERIFIED_EMAIL_ENABLED: email,
      ZEUS_CUSTOMER_INTAKE_ENABLED: intake,
    });
  it('does not touch any new table before the additive migration is enabled', async () => {
    await expect(
      customerPrivateData({} as never, config(false, false), 'owner'),
    ).resolves.toEqual({});
  });
  it('scopes every new query to the actual owner and whitelists identity fields', async () => {
    const prisma = {
      emailLoginIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
      customerOnboardingState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderIntake: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await customerPrivateData(prisma as never, config(), 'owner');
    expect(prisma.emailLoginIdentity.findUnique).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      select: { emailNormalized: true, verifiedAt: true },
    });
    expect(prisma.customerOnboardingState.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner' } }),
    );
    expect(prisma.orderIntake.findMany).toHaveBeenCalledWith({
      where: { order: { customerId: 'owner' } },
      orderBy: { orderId: 'asc' },
    });
  });
  it('does not access disabled email tables when only intake is enabled', async () => {
    const prisma = {
      customerOnboardingState: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderIntake: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(
      customerPrivateData(prisma as never, config(false, true), 'owner'),
    ).resolves.toEqual({ customerOnboarding: null, orderIntakes: [] });
  });
});
