import { createHash } from 'node:crypto';

/** Fixed-size, domain-separated material: bcrypt must not truncate long names
 * or credentials at its 72-byte input limit. No plaintext snapshot is stored. */
export function registrationProof(
  phone: string,
  fullName: string,
  password: string | undefined,
  code: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'niazat.register.v1',
        phone,
        fullName.trim(),
        password ?? null,
        code,
      ]),
    )
    .digest('base64url');
}
