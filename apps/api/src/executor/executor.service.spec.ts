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

describe('ExecutorService staff operations', () => {
  const actor = {
    id: 'ops-1',
    role: 'admin',
    adminScope: 'ops_admin',
    capabilities: [],
    fullName: 'مدیر عملیات',
    phone: '09120000002',
    email: null,
  } as const;

  it('stores a capacity snapshot and marks an available executor over-capacity', async () => {
    let capacityInput:
      | {
          data: {
            executorProfileId: string;
            capacityPercent: number;
            activeOrders: number;
          };
        }
      | undefined;
    const tx = {
      executorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          userId: 'executor-1',
          status: 'active',
          capacityPercent: 40,
        }),
        update: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      orderAssignment: { count: jest.fn().mockResolvedValue(3) },
      staffCapacitySnapshot: {
        create: jest.fn((input: NonNullable<typeof capacityInput>) => {
          capacityInput = input;
        }),
      },
      staffRiskAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'risk-1',
          riskType: 'over_capacity',
          severity: 'high',
          status: 'active',
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      executorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          displayAlias: 'مجری تست',
          capacityPercent: 100,
        }),
      },
      orderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      staffPerformanceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExecutorService(prisma as never, {} as never);

    await service.setCapacity(
      'profile-1',
      100,
      'تکمیل ظرفیت',
      actor as never,
      '127.0.0.1',
    );

    expect(tx.executorProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { capacityPercent: 100, status: 'over_capacity' },
    });
    expect(capacityInput?.data.executorProfileId).toBe('profile-1');
    expect(capacityInput?.data.capacityPercent).toBe(100);
    expect(capacityInput?.data.activeOrders).toBe(3);
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('revokes sessions whenever staff account access changes', async () => {
    let sessionInput:
      | {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: unknown };
        }
      | undefined;
    let auditInput:
      { data: { action: string; sensitivity: string } } | undefined;
    const tx = {
      user: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'executor-1' }),
      },
      userCapability: { upsert: jest.fn(), deleteMany: jest.fn() },
      session: {
        updateMany: jest.fn((input: NonNullable<typeof sessionInput>) => {
          sessionInput = input;
        }),
      },
      auditLog: {
        create: jest.fn((input: NonNullable<typeof auditInput>) => {
          auditInput = input;
        }),
      },
    };
    const prisma = {
      executorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          userId: 'executor-1',
          user: { status: 'active', capabilities: [] },
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExecutorService(prisma as never, {} as never);

    await service.updateAccess(
      'profile-1',
      {
        userStatus: 'suspended',
        customerCapability: true,
        note: 'تعلیق موقت تا بررسی',
      },
      actor as never,
      '127.0.0.1',
    );

    expect(tx.userCapability.upsert).toHaveBeenCalled();
    expect(sessionInput?.where).toEqual({
      userId: 'executor-1',
      revokedAt: null,
    });
    expect(sessionInput?.data.revokedAt).toBeInstanceOf(Date);
    expect(auditInput?.data.action).toBe('staff.access_changed');
    expect(auditInput?.data.sensitivity).toBe('critical');
  });

  it('rejects duplicate skill assignments before replacing existing skills', async () => {
    const prisma = {
      executorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          skills: [],
        }),
      },
    };
    const service = new ExecutorService(prisma as never, {} as never);

    await expect(
      service.updateSkills(
        'profile-1',
        {
          skills: [
            { skillId: 'skill-1', level: 2 },
            { skillId: 'skill-1', level: 4 },
          ],
          note: 'ثبت مهارت‌ها',
        },
        actor as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts one performance snapshot per executor and UTC day', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'snapshot-1',
      periodEnd: new Date('2026-08-29T00:00:00.000Z'),
    });
    const tx = {
      executorProfile: { update: jest.fn() },
      staffPerformanceSnapshot: { upsert },
      staffRiskAlert: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      executorProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      orderAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      qcReview: { findMany: jest.fn().mockResolvedValue([]) },
      feedback: { findMany: jest.fn().mockResolvedValue([]) },
      staffPerformanceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExecutorService(prisma as never, {} as never);

    await service.recalculatePerformance(
      'profile-1',
      new Date('2026-08-29T12:00:00.000Z'),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          executorProfileId_periodEnd: {
            executorProfileId: 'profile-1',
            periodEnd: new Date('2026-08-29T00:00:00.000Z'),
          },
        },
      }),
    );
  });
});
