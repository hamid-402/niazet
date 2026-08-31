import { NotFoundException } from '@nestjs/common';
import { OrderQueryService } from './order-query.service';

describe('OrderQueryService executor confidentiality', () => {
  it('uses an allowlisted projection without financial or storage fields', async () => {
    type FieldProjection = { select: Record<string, boolean> };
    type ExecutorQuery = {
      include?: unknown;
      select: Record<string, unknown> & {
        serviceLine: FieldProjection;
        files: FieldProjection;
        statusHistory: FieldProjection;
        milestones: FieldProjection;
        reports: { where: { authorUserId: string } };
        messages: { where: { visibility: string } };
      };
    };
    let capturedQuery: ExecutorQuery | undefined;
    const orderFindUnique = jest.fn((query: ExecutorQuery) => {
      capturedQuery = query;
      return Promise.resolve({ id: 'order-1' });
    });
    const prisma = {
      orderAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
      order: { findUnique: orderFindUnique },
    };
    const service = new OrderQueryService(prisma as never);

    await service.findOneForExecutor('executor-1', 'order-1');

    expect(capturedQuery).toBeDefined();
    const query = capturedQuery as unknown as ExecutorQuery;
    expect(query.include).toBeUndefined();
    expect(query.select).not.toHaveProperty('customerId');
    expect(query.select).not.toHaveProperty('budgetHint');
    expect(query.select).not.toHaveProperty('finalPrice');
    expect(query.select).not.toHaveProperty('packageSnapshot');
    expect(query.select.serviceLine.select).not.toHaveProperty('basePrice');
    expect(query.select.files.select).not.toHaveProperty('storageKey');
    expect(query.select.files.select).not.toHaveProperty('checksum');
    expect(query.select.statusHistory.select).not.toHaveProperty(
      'financialEffectAmount',
    );
    expect(query.select.milestones.select).not.toHaveProperty('amount');
    expect(query.select.reports.where).toEqual({
      authorUserId: 'executor-1',
    });
    expect(query.select.messages.where).toEqual({
      visibility: 'customer_visible',
    });
  });

  it('returns not-found instead of revealing whether an unassigned order exists', async () => {
    const prisma = {
      orderAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      order: { findUnique: jest.fn() },
    };
    const service = new OrderQueryService(prisma as never);

    await expect(
      service.findOneForExecutor('executor-1', 'other-order'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
