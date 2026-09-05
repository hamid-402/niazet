import { Prisma } from '@prisma/client';

/**
 * Public/admin-safe user fields. Password hashes and authentication internals
 * must never be returned from a controller-facing Prisma query.
 */
export const SAFE_USER_SELECT = {
  id: true,
  role: true,
  adminScope: true,
  status: true,
  fullName: true,
  displayAlias: true,
  email: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
