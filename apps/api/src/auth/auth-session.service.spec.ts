import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';

describe('AuthSessionService session management', () => {
  const findMany = jest.fn<
    Promise<Array<{ id: string; createdAt: Date }>>,
    []
  >();
  let lastUpdateInput: unknown;
  const updateMany = jest.fn((input: unknown) => {
    lastUpdateInput = input;
    return Promise.resolve({ count: 0 });
  });
  const prisma = {
    session: { findMany, updateMany },
  } as unknown as PrismaService;
  const service = new AuthSessionService(prisma, {} as AuthTokenService);

  beforeEach(() => {
    jest.clearAllMocks();
    lastUpdateInput = undefined;
    updateMany.mockImplementation((input: unknown) => {
      lastUpdateInput = input;
      return Promise.resolve({ count: 0 });
    });
  });

  it('marks only the access-token session as current', async () => {
    findMany.mockResolvedValue([
      { id: 'current', createdAt: new Date() },
      { id: 'other', createdAt: new Date() },
    ]);

    await expect(service.listActive('user-1', 'current')).resolves.toEqual([
      expect.objectContaining({ id: 'current', isCurrent: true }),
      expect.objectContaining({ id: 'other', isCurrent: false }),
    ]);
  });

  it('revokes only the requested session owned by the user', async () => {
    updateMany.mockImplementation((input: unknown) => {
      lastUpdateInput = input;
      return Promise.resolve({ count: 1 });
    });

    await expect(service.revoke('user-1', 'session-2')).resolves.toEqual({
      message: 'نشست انتخاب‌شده باطل شد.',
    });
    expect(lastUpdateInput).toMatchObject({
      where: { id: 'session-2', userId: 'user-1', revokedAt: null },
    });
    expect(
      (
        lastUpdateInput as {
          data: { revokedAt: unknown };
        }
      ).data.revokedAt,
    ).toBeInstanceOf(Date);
  });

  it('rejects foreign or already revoked sessions', async () => {
    await expect(service.revoke('user-1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('keeps the current session when revoking every other session', async () => {
    updateMany.mockImplementation((input: unknown) => {
      lastUpdateInput = input;
      return Promise.resolve({ count: 3 });
    });

    await expect(service.revokeOthers('user-1', 'current')).resolves.toEqual({
      message: 'تمام نشست‌های دیگر باطل شدند.',
      revokedCount: 3,
    });
    expect(lastUpdateInput).toMatchObject({
      where: {
        userId: 'user-1',
        id: { not: 'current' },
        revokedAt: null,
      },
    });
    expect(
      (
        lastUpdateInput as {
          data: { revokedAt: unknown };
        }
      ).data.revokedAt,
    ).toBeInstanceOf(Date);
  });

  it('does not perform a bulk revocation without a current session id', async () => {
    await expect(service.revokeOthers('user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
});
