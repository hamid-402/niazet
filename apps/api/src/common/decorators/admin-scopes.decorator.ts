import { SetMetadata } from '@nestjs/common';
import { AdminScope } from '@prisma/client';

export const ADMIN_SCOPES_KEY = 'adminScopes';

/**
 * Restricts an admin-only route to one or more admin_scope values.
 * super_admin always passes regardless of the scopes listed here
 * (see AdminScopeGuard), matching the "قواعد غیرقابل مذاکره" rule
 * that super_admin has access to everything.
 */
export const AdminScopes = (...scopes: AdminScope[]) => SetMetadata(ADMIN_SCOPES_KEY, scopes);
