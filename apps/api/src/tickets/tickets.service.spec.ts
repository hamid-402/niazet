import { ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

describe('TicketsService support ownership', () => {
  const support = {
    id: 'support-1',
    role: 'support',
    adminScope: null,
    capabilities: [],
    fullName: 'پشتیبان یک',
    phone: '09120000004',
    email: null,
  } as AuthenticatedUser;

  function setup(ticket: {
    id: string;
    assignedToUserId: string | null;
    status: 'open' | 'assigned';
    orderId?: string | null;
    customerId?: string;
    code?: string;
  }) {
    const tx = {
      ticket: { update: jest.fn().mockResolvedValue(ticket) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: support.id }) },
      ticketMessage: { create: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const notifications = { notifyUser: jest.fn() };
    return {
      service: new TicketsService(prisma as never, notifications as never),
      prisma,
      tx,
    };
  }

  it('does not let a support user assign a ticket to another user id', async () => {
    const { service } = setup({
      id: 'ticket-1',
      assignedToUserId: null,
      status: 'open',
    });

    await expect(
      service.assign('ticket-1', 'support-2', support),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires claiming an unassigned ticket before replying', async () => {
    const { service } = setup({
      id: 'ticket-1',
      assignedToUserId: null,
      status: 'open',
    });

    await expect(
      service.reply(support, 'ticket-1', { body: 'پاسخ آزمایشی' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('claims a ticket for the current support user and audits it', async () => {
    const { service, tx } = setup({
      id: 'ticket-1',
      assignedToUserId: null,
      status: 'open',
    });

    await service.assign('ticket-1', support.id, support);

    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { assignedToUserId: support.id, status: 'assigned' },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
