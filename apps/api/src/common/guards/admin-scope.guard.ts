import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminScope } from '@prisma/client';
import { ADMIN_SCOPES_KEY } from '../decorators/admin-scopes.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * super_admin always has access (architecture v4 §4.2 / §27: super_admin
 * has full control over every module). ops_admin/finance_admin only pass
 * when explicitly listed via @AdminScopes(...).
 */
@Injectable()
export class AdminScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<AdminScope[]>(ADMIN_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user || !user.adminScope) {
      throw new ForbiddenException('دسترسی مدیریتی شما کافی نیست.');
    }

    if (user.adminScope === AdminScope.super_admin) {
      return true;
    }

    if (requiredScopes.includes(user.adminScope)) {
      return true;
    }

    throw new ForbiddenException('دسترسی مدیریتی شما کافی نیست.');
  }
}
