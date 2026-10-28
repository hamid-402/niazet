import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderWorkflowService } from './order-workflow.service';
import { isCancellable, isTransitionAllowed } from '../order-state-machine';

describe('Z1 common order transition boundary', () => {
  function fixture(status: OrderStatus = 'draft') {
    const row = {
      id: 'order',
      customerId: 'owner',
      status,
      version: 3,
      finalPrice: 100,
      currency: 'IRT',
    } as Order;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const history = jest.fn().mockResolvedValue({});
    const audit = jest.fn().mockResolvedValue({});
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue(row),
        updateMany,
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...row, status: 'submitted', version: 4 }),
      },
      orderStatusHistory: { create: history },
      auditLog: { create: audit },
      orderAssignment: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new OrderWorkflowService({} as PrismaService);
    return {
      service,
      tx: tx as unknown as Prisma.TransactionClient,
      updateMany,
      history,
      audit,
    };
  }
  it('preserves all 20 states and checks every ordered pair against the explicit D4 graph', () => {
    const expected: Record<string, string[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['pending_triage', 'cancelled'],
      pending_triage: ['triaging', 'cancelled'],
      triaging: ['pending_quote', 'quoted', 'cancelled'],
      pending_quote: ['quoted', 'cancelled'],
      quoted: ['pending_payment', 'cancelled'],
      pending_payment: ['paid', 'cancelled'],
      paid: ['assigned', 'cancelled'],
      assigned: ['in_progress', 'cancelled'],
      in_progress: ['submitted_for_qc', 'cancelled', 'disputed'],
      submitted_for_qc: ['qc_in_review'],
      qc_in_review: ['qc_rejected', 'ready_for_customer_review'],
      qc_rejected: ['in_progress'],
      ready_for_customer_review: ['delivered'],
      delivered: ['confirmed', 'revision_requested', 'disputed'],
      revision_requested: ['in_progress'],
      disputed: ['in_progress', 'cancelled', 'closed', 'confirmed'],
      confirmed: ['closed'],
      cancelled: [],
      closed: [],
    };
    expect(Object.values(OrderStatus)).toHaveLength(20);
    for (const from of Object.values(OrderStatus))
      for (const to of Object.values(OrderStatus))
        expect(isTransitionAllowed(from, to)).toBe(expected[from].includes(to));
    for (const from of Object.values(OrderStatus))
      expect(isCancellable(from)).toBe(
        from !== 'disputed' && expected[from].includes('cancelled'),
      );
  });
  it('records CAS, history and audit for an owned human command', async () => {
    const f = fixture();
    await f.service.transition(
      'order',
      'submitted',
      'customer',
      'owner',
      'start',
      {},
      f.tx,
    );
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: 'order', status: 'draft', version: 3 },
      data: { status: 'submitted', version: { increment: 1 } },
    });
    expect(f.history).toHaveBeenCalledTimes(1);
    expect(f.audit).toHaveBeenCalledTimes(1);
  });
  it('rejects scalar and nested ownership/history/payment overrides before any update', async () => {
    for (const key of [
      'id',
      'customerId',
      'customer',
      'status',
      'version',
      'statusHistory',
      'payments',
      'escrowHolds',
      'refunds',
      'invoices',
    ]) {
      const f = fixture();
      await expect(
        f.service.transition(
          'order',
          'submitted',
          'customer',
          'owner',
          'test',
          { [key]: {} },
          f.tx,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(f.updateMany).not.toHaveBeenCalled();
    }
  });
  it('does not impersonate another customer or an unassigned executor', async () => {
    const f = fixture();
    await expect(
      f.service.transition(
        'order',
        'submitted',
        'customer',
        'foreign',
        'test',
        {},
        f.tx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const e = fixture('assigned');
    await expect(
      e.service.transition(
        'order',
        'in_progress',
        'executor',
        'foreign',
        'test',
        {},
        e.tx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(e.updateMany).not.toHaveBeenCalled();
  });
  it('rejects paid without financial proof and disputed without resolution command', async () => {
    const f = fixture('pending_payment');
    await expect(
      f.service.transition('order', 'paid', 'system', null, 'test', {}, f.tx),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.updateMany).not.toHaveBeenCalled();
    const d = fixture('disputed');
    await expect(
      d.service.transition(
        'order',
        'closed',
        'admin',
        'admin',
        'test',
        {},
        d.tx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('does not append history/audit after a lost optimistic lock', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.transition(
        'order',
        'submitted',
        'customer',
        'owner',
        'test',
        {},
        f.tx,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.history).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
});
