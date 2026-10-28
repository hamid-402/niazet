import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import { normalizeVerifiedEmailAddress } from './verified-identifier-contract';

export interface VerifiedEmailLoginClaim {
  identityId: string;
  userId: string;
  emailNormalized: string;
  revision: number;
}
export interface VerifiedEmailSessionProof extends VerifiedEmailLoginClaim {
  // Internal-only: bound to the hash whose password was actually verified.
  // Never accepted from a DTO, returned, or written to Audit/family metadata.
  credentialHash: string;
}
export function verifiedEmailEnabled(config: ConfigService): boolean {
  const enabled = config.get<string | boolean>('ZEUS_VERIFIED_EMAIL_ENABLED');
  return enabled === true || enabled === 'true';
}
export function requireVerifiedEmail(config: ConfigService) {
  if (!verifiedEmailEnabled(config))
    throw new ServiceUnavailableException(
      'ورود با ایمیل هنوز در این محیط پذیرفته و فعال نشده است.',
    );
}
const denied = () => new UnauthorizedException('ایمیل یا رمز عبور معتبر نیست.');

export async function assertVerifiedEmailProof(
  tx: Prisma.TransactionClient,
  userId: string,
  proof: VerifiedEmailSessionProof,
) {
  if (
    !proof ||
    proof.userId !== userId ||
    !proof.identityId ||
    !Number.isSafeInteger(proof.revision) ||
    proof.revision < 1 ||
    typeof proof.credentialHash !== 'string' ||
    !proof.credentialHash
  )
    throw denied();
  let email: string;
  try {
    email = normalizeVerifiedEmailAddress(proof.emailNormalized);
  } catch {
    throw denied();
  }
  if (email !== proof.emailNormalized) throw denied();
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
  const owner = await tx.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, status: true },
  });
  const identity = await tx.emailLoginIdentity.findUnique({
    where: { id: proof.identityId },
  });
  if (
    !owner ||
    owner.status !== UserStatus.active ||
    owner.passwordHash !== proof.credentialHash ||
    !identity ||
    identity.userId !== userId ||
    identity.emailNormalized !== email ||
    identity.revision !== proof.revision
  )
    throw denied();
  try {
    if (normalizeVerifiedEmailAddress(owner.email) !== email) throw denied();
  } catch {
    throw denied();
  }
  return identity;
}

type EmailSession = {
  familyId: string;
  userId: string;
  user: { email: string | null };
};
/** The marker survives refresh rotation and cleanup of the original session. */
export async function emailFamilyAllowed(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  session: EmailSession,
): Promise<boolean> {
  const rows = await tx.$queryRaw<
    Array<{
      userId: string;
      emailNormalized: string;
      revokedAt: Date | null;
      identityId: string | null;
      identityUserId: string | null;
      identityEmail: string | null;
      boundRevision: number;
      currentRevision: number | null;
    }>
  >`
    SELECT f.user_id AS "userId", f.email_normalized AS "emailNormalized", f.revoked_at AS "revokedAt",
      i.id AS "identityId", i.user_id AS "identityUserId", i.email_normalized AS "identityEmail", f.identity_revision AS "boundRevision", i.revision AS "currentRevision"
    FROM email_login_families f LEFT JOIN email_login_identities i ON i.id=f.identity_id WHERE f.family_id=${session.familyId}`;
  if (!rows.length) return true; // original mobile/password/OTP family
  const row = rows[0];
  if (
    row.revokedAt ||
    !row.identityId ||
    row.userId !== session.userId ||
    row.identityUserId !== session.userId ||
    row.identityEmail !== row.emailNormalized ||
    row.boundRevision !== row.currentRevision
  )
    return false;
  try {
    return (
      normalizeVerifiedEmailAddress(session.user.email) === row.emailNormalized
    );
  } catch {
    return false;
  }
}

export async function listIdentityAwareSessions(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  userId: string,
) {
  return tx.$queryRaw<
    Array<{
      id: string;
      userAgent: string | null;
      ipAddress: string | null;
      createdAt: Date;
      expiresAt: Date;
    }>
  >`
    SELECT s.id, s.user_agent AS "userAgent", s.ip_address AS "ipAddress", s.created_at AS "createdAt", s.expires_at AS "expiresAt"
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN email_login_families f ON f.family_id=s.family_id
    LEFT JOIN email_login_identities i ON i.id=f.identity_id
    WHERE s.user_id=${userId} AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP
      AND (f.family_id IS NULL OR (f.revoked_at IS NULL AND f.user_id=s.user_id AND i.user_id=s.user_id
        AND i.email_normalized=f.email_normalized AND i.revision=f.identity_revision AND lower(btrim(u.email))=f.email_normalized))
    ORDER BY s.created_at DESC`;
}
