import { OrderIntake } from '@prisma/client';
import { executionIntakeView, orderIntakeView } from './order-intake';

describe('intake projections', () => {
  const row = {
    orderId: 'order',
    schemaVersion: 1,
    orderVersion: 7,
    sealedAt: new Date(),
    data: {
      version: 1,
      goal: 'هدف',
      brandGuidelines: 'رنگ',
      constraints: 'محدودیت',
      referenceUrls: ['https://example.test/'],
      financialNote: 'private note',
      confidentialityRequested: 'highly_sensitive',
      stagedDeliveryRequested: true,
      addonRequests: ['private extra request'],
    },
  } as unknown as OrderIntake;
  it('does not manufacture data for legacy orders', () => {
    expect(executionIntakeView(null)).toBeNull();
    expect(orderIntakeView(null)).toBeNull();
  });
  it('allows only actual requirements in the assigned executor projection', () => {
    expect(executionIntakeView(row)).toEqual({
      schemaVersion: 1,
      sealedAt: row.sealedAt,
      requirements: {
        goal: 'هدف',
        brandGuidelines: 'رنگ',
        constraints: 'محدودیت',
        referenceUrls: ['https://example.test/'],
      },
    });
  });
  it('retains all customer information for the separate owner/ops projection', () => {
    expect(orderIntakeView(row)).toEqual({
      schemaVersion: 1,
      orderVersion: 7,
      sealedAt: row.sealedAt,
      data: row.data,
    });
  });
  it('fails closed on malformed stored data instead of spreading unknown keys', () => {
    expect(() =>
      executionIntakeView({
        ...row,
        data: { version: 1, secret: 'not allowed' },
      }),
    ).toThrow();
  });
});
