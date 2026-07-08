import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilityType, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Enforces the 4 official roles (customer, executor, support, admin).
 * A user whose primary role is `customer` but who was granted the
 * `executor` capability (dual-role, see architecture v4 §4.3) may also
 * access routes annotated with @Roles('executor').
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('دسترسی شما کافی نیست.');
    }

    const hasDirectRole = requiredRoles.includes(user.role);
    const hasCapabilityRole = requiredRoles.some(
      (role) =>
        (role === CapabilityType.customer || role === CapabilityType.executor) &&
        user.capabilities.includes(role as unknown as CapabilityType),
    );

    if (hasDirectRole || hasCapabilityRole) {
      return true;
    }

    throw new ForbiddenException('دسترسی شما کافی نیست.');
  }
}
