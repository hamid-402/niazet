import { Prisma } from '@prisma/client';
import { assertFixedRegistrationEligibility } from './fixed-registration-eligibility';
import { snapshotServiceForm } from '../service-form';

describe('fixed registration dynamic boundary', () => {
  function fixture() {
    const service = {
      id: 'service',
      slug: 'fixed',
      title: 'Fixed',
      isActive: true,
      pricingModel: 'fixed',
      basePrice: 100,
      packages: [] as Array<{
        id: string;
        isActive: boolean;
        price: number | null;
      }>,
      formFields: [],
    };
    const policy = {
      config: {
        calendar: {
          version: 1,
          timezone: 'Asia/Tehran',
          workDays: [0, 1, 2, 3, 4, 6],
          holidays: [],
        },
        normalMinutes: 1440,
        urgentMinutes: 480,
        sameDayEnabled: true,
        quoteTtlMinutes: 30,
        requiredSkills: [],
        formula: null,
      },
    };
    const order = {
      id: 'order',
      serviceId: service.id,
      title: 'Valid order',
      briefDescription: 'Valid customer requirements',
      submittedAt: new Date(),
      finalPrice: null,
      quotedAt: null,
      packageId: null,
      formResponses: snapshotServiceForm(service, [], {}, true),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      serviceLine: { findUnique: jest.fn().mockResolvedValue(service) },
      commercialPolicy: { findFirst: jest.fn().mockResolvedValue(policy) },
      payment: { count: jest.fn().mockResolvedValue(0) },
      commercialState: { count: jest.fn().mockResolvedValue(0) },
      orderMilestone: { count: jest.fn().mockResolvedValue(0) },
      orderFile: { count: jest.fn().mockResolvedValue(0) },
    };
    const run = () =>
      assertFixedRegistrationEligibility(
        tx as unknown as Prisma.TransactionClient,
        order as never,
      );
    return { service, order, tx, run };
  }
  it('accepts only a submitted fixed service with a valid matching form and policy', async () => {
    await expect(fixture().run()).resolves.toBeUndefined();
  });
  it.each([
    'payment',
    'commercialState',
    'orderMilestone',
    'orderFile',
  ] as const)(
    'rejects existing %s without a state/financial write',
    async (field) => {
      const f = fixture();
      f.tx[field].count.mockResolvedValue(1);
      await expect(f.run()).rejects.toThrow();
    },
  );
  it.each(['manual_quote', 'formula'])(
    'does not auto-triage %s',
    async (model) => {
      const f = fixture();
      f.service.pricingModel = model;
      await expect(f.run()).rejects.toThrow();
    },
  );
  it('rejects missing policy, old unknown forms, inactive catalog and changed service snapshots', async () => {
    const noPolicy = fixture();
    noPolicy.tx.commercialPolicy.findFirst.mockResolvedValue(null);
    await expect(noPolicy.run()).rejects.toThrow();
    const unknown = fixture();
    unknown.order.formResponses = null as never;
    await expect(unknown.run()).rejects.toThrow();
    const inactive = fixture();
    inactive.service.isActive = false;
    await expect(inactive.run()).rejects.toThrow();
    const changed = fixture();
    changed.service.title = 'Changed';
    await expect(changed.run()).rejects.toThrow();
  });
  it.each([0, -1, 1.5, 2000000001, NaN])(
    'rejects nonpayable fixed base %s',
    async (base) => {
      const f = fixture();
      f.service.basePrice = base;
      await expect(f.run()).rejects.toThrow();
    },
  );
});
