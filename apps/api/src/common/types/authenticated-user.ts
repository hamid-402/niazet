import { AdminScope, CapabilityType, UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  sessionId?: string;
  role: UserRole;
  adminScope: AdminScope | null;
  capabilities: CapabilityType[];
  fullName: string;
  phone: string;
  email: string | null;
}
