import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExecutorService } from './executor.service';

describe('ExecutorService execution workflow', () => {
  const profile = { id: 'profile-1', userId: 'executor-1' };

  function setup() {
    const tx = {
      orderAssignment: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      executionChecklistItem: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      executorProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExecutorService(prisma as never, {} as never);
    return { service, prisma, tx };
  }

  it('records acceptance, snapshots criteria and writes an audit event', async () => {
    const { service, tx } = setup();
    tx.orderAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      acceptedAt: null,
      order: {
        status: 'assigned',
        acceptanceCriteria: [
          { id: 'criterion-1', description: 'خروجی قابل ویرایش باشد' },
        ],
      },
      executionChecklistItems: [],
    });
    tx.orderAssignment.findUniqueOrThrow.mockResolvedValue({
      id: 'assignment-1',
      acceptedAt: new Date(),
      executionChecklistItems: [],
    });

    await service.acceptOrder('executor-1', 'order-1');

    expect(tx.executionChecklistItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          assignmentId: 'assignment-1',
          acceptanceCriterionId: 'criterion-1',
          label: 'خروجی قابل ویرایش باشد',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.orderAssignment.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('does not expose acceptance for an unrelated order', async () => {
    const { service, tx } = setup();
    tx.orderAssignment.findFirst.mockResolvedValue(null);

    await expect(service.acceptOrder('executor-1', 'order-2')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('requires acceptance before checklist changes', async () => {
    const { service, tx } = setup();
    tx.orderAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      acceptedAt: null,
      order: { status: 'assigned' },
    });

    await expect(
      service.updateChecklistItem('executor-1', 'order-1', 'checklist-1', true),
    ).rejects.toThrow(BadRequestException);
  });
});
