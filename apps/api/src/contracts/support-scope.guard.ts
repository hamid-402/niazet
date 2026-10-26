import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
@Injectable()
export class SupportScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (
      !user ||
      (user.role !== 'support' &&
        !(
          user.role === 'admin' &&
          (user.adminScope === 'ops_admin' || user.adminScope === 'super_admin')
        ))
    )
      throw new ForbiddenException('دامنهٔ مجاز پشتیبانی لازم است.');
    return true;
  }
}
