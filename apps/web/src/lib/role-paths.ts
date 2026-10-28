import type { AuthUser } from './types';

export function roleHomePath(user: AuthUser): string {
  if (user.role === 'admin') {
    if (user.adminScope === 'finance_admin') return '/admin/finance';
    return '/admin';
  }
  if (user.role === 'support') return '/support/tickets';
  if (user.role === 'executor') return '/executor';
  return '/dashboard';
}
