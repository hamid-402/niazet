import { NotFoundException } from '@nestjs/common';
import { OrderQueryService } from './order-query.service';

describe('OrderQueryService executor confidentiality', () => {
  it('returns not-found when a customer asks for another customer order', async () => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', customerId: 'customer-2' }) },
    };
    const service = new OrderQueryService(prisma as never);
    await expect(service.findOneForCustomer('customer-1', 'order-1')).rejects.toThrow(NotFoundException);
  });

  it('scopes customer and executor lists to their ownership relation', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { order: { findMany } };
    const service = new OrderQueryService(prisma as never);
    await service.listForCustomer('customer-1', { status: 'paid', skip: 0, take: 20 });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ customerId: 'customer-1', status: 'paid' });
    await service.listForExecutor('executor-1', { skip: 0, take: 20 });
    expect(findMany.mock.calls[1][0].where).toEqual({
      assignments: { some: { unassignedAt: null, executorProfile: { userId: 'executor-1' } } },
    });
  });

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
