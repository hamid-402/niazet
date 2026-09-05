import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminScope, CapabilityType, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { ADMIN_SCOPES_KEY } from '../decorators/admin-scopes.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AdminScopeGuard } from './admin-scope.guard';
import { RolesGuard } from './roles.guard';

const baseUser: AuthenticatedUser = {
  id: 'user-id',
  role: UserRole.customer,
  adminScope: null,
  capabilities: [],
  fullName: 'کاربر تست',
  phone: '09120000000',
  email: null,
};

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => contextFor,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('access policy matrix', () => {
  it('allows routes without role or scope metadata, including before authentication', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextFor())).toBe(true);
    expect(new AdminScopeGuard(reflector).canActivate(contextFor())).toBe(true);
  });

  it('denies a missing identity when access metadata is present', () => {
    const roleReflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.customer]),
    } as unknown as Reflector;
    const scopeReflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AdminScope.ops_admin]),
    } as unknown as Reflector;
    expect(() =>
      new RolesGuard(roleReflector).canActivate(contextFor()),
    ).toThrow(ForbiddenException);
    expect(() =>
      new AdminScopeGuard(scopeReflector).canActivate(contextFor()),
    ).toThrow(ForbiddenException);
  });

  it.each(
    Object.values(UserRole).flatMap((actual) =>
      Object.values(UserRole).map(
        (required) => [actual, required, actual === required] as const,
      ),
    ),
  )(
    'applies direct-role policy actual=%s required=%s expected=%s',
    (actual, required, expected) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([required]),
      } as unknown as Reflector;
      const invoke = () =>
        new RolesGuard(reflector).canActivate(
          contextFor({ ...baseUser, role: actual, capabilities: [] }),
        );
      if (expected) expect(invoke()).toBe(true);
      else expect(invoke).toThrow(ForbiddenException);
    },
  );

  it.each(
    Object.values(AdminScope).flatMap((actual) =>
      Object.values(AdminScope).map(
        (required) =>
          [
            actual,
            required,
            actual === AdminScope.super_admin || actual === required,
          ] as const,
      ),
    ),
  )(
    'applies admin-scope policy actual=%s required=%s expected=%s',
    (actual, required, expected) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([required]),
      } as unknown as Reflector;
      const invoke = () =>
        new AdminScopeGuard(reflector).canActivate(
          contextFor({ ...baseUser, role: UserRole.admin, adminScope: actual }),
        );
      if (expected) expect(invoke()).toBe(true);
      else expect(invoke).toThrow(ForbiddenException);
    },
  );

  it.each([
    UserRole.customer,
    UserRole.executor,
    UserRole.support,
    UserRole.admin,
  ])('allows the matching direct role: %s', (role) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([role]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextFor({ ...baseUser, role }))).toBe(true);
  });

  it.each([
    [CapabilityType.customer, UserRole.customer],
    [CapabilityType.executor, UserRole.executor],
  ])('allows %s capability to satisfy %s role', (capability, role) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([role]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(
      guard.canActivate(
        contextFor({
          ...baseUser,
          role: UserRole.support,
          capabilities: [capability],
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [UserRole.customer, UserRole.admin],
    [UserRole.executor, UserRole.support],
    [UserRole.support, UserRole.customer],
    [UserRole.admin, UserRole.executor],
  ])('denies %s from a %s-only route', (actual, required) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([required]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(contextFor({ ...baseUser, role: actual })),
    ).toThrow(ForbiddenException);
  });

  it('never treats an admin capability as a role escalation', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.admin]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() =>
      guard.canActivate(
        contextFor({
          ...baseUser,
          capabilities: [CapabilityType.executor],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([AdminScope.ops_admin, AdminScope.finance_admin])(
    'allows the explicitly required admin scope: %s',
    (scope) => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([scope]),
      } as unknown as Reflector;
      const guard = new AdminScopeGuard(reflector);
      expect(
        guard.canActivate(
          contextFor({
            ...baseUser,
            role: UserRole.admin,
            adminScope: scope,
          }),
        ),
      ).toBe(true);
    },
  );

  it('allows super admin without weakening role checks', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockImplementation((key: string) =>
          key === ADMIN_SCOPES_KEY ? [AdminScope.ops_admin] : undefined,
        ),
    } as unknown as Reflector;
    const guard = new AdminScopeGuard(reflector);
    expect(
      guard.canActivate(
        contextFor({
          ...baseUser,
          role: UserRole.admin,
          adminScope: AdminScope.super_admin,
        }),
      ),
    ).toBe(true);
    expect(ROLES_KEY).toBeDefined();
  });

  it('denies a mismatched or missing admin scope', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AdminScope.finance_admin]),
    } as unknown as Reflector;
    const guard = new AdminScopeGuard(reflector);
    expect(() =>
      guard.canActivate(
        contextFor({
          ...baseUser,
          role: UserRole.admin,
          adminScope: AdminScope.ops_admin,
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(baseUser))).toThrow(
      ForbiddenException,
    );
  });
});
