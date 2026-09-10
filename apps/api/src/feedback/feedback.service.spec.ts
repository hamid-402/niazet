import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackService } from './feedback.service';

describe('FeedbackService tracking contract', () => {
  const feedbackFindUnique = jest.fn();
  const orderFindUnique = jest.fn();
  const feedbackCreate = jest.fn();
  const auditCreate = jest.fn();
  const transaction = jest.fn((work: (tx: unknown) => unknown) =>
    work({
      feedback: { create: feedbackCreate },
      auditLog: { create: auditCreate },
      outboxEvent: { create: jest.fn() },
      executorProfile: { update: jest.fn() },
    }),
  );
  const prisma = {
    feedback: { findUnique: feedbackFindUnique },
    order: { findUnique: orderFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new FeedbackService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    feedbackFindUnique.mockResolvedValue(null);
  });

  it('requires a rating for rating feedback', async () => {
    await expect(
      service.create(
        'customer-1',
        'order-1',
        { targetType: 'order', feedbackType: 'rating' },
        'idem-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a meaningful comment for complaints', async () => {
    await expect(
      service.create(
        'customer-1',
        'order-1',
        {
          targetType: 'order',
          feedbackType: 'complaint',
          comment: 'کم',
        },
        'idem-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the original feedback for an idempotent replay', async () => {
    const existing = {
      id: 'feedback-1',
      orderId: 'order-1',
      customerId: 'customer-1',
      code: 'FBK-EXISTING',
    };
    feedbackFindUnique.mockResolvedValue(existing);

    await expect(
      service.create(
        'customer-1',
        'order-1',
        { targetType: 'order', feedbackType: 'rating', rating: 5 },
        'idem-existing',
      ),
    ).resolves.toBe(existing);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it('creates a human reference code and binds order feedback to the order', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'order-1',
      code: 'ORD-1',
      customerId: 'customer-1',
      status: OrderStatus.delivered,
    });
    feedbackCreate.mockImplementation(
      (input: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'feedback-1', ...input.data }),
    );
    auditCreate.mockResolvedValue({ id: 'audit-1' });

    const result = await service.create(
      'customer-1',
      'order-1',
      {
        targetType: 'order',
        feedbackType: 'rating',
        rating: 5,
        satisfactionPercent: 100,
      },
      'idem-new',
    );

    expect(result).toMatchObject({
      targetInternalId: 'order-1',
      idempotencyKey: 'idem-new',
    });
    expect((result as { code: string }).code).toMatch(/^FBK-[A-Z0-9]+$/);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
