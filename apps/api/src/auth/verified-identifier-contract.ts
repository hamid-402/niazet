import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';

/** A lookup key, NEVER evidence that an address belongs to a user. */
export function normalizeVerifiedEmailAddress(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('ایمیل معتبر نیست.');
  const address = value.trim();
  if (
    address.length > 254 ||
    /[^\x21-\x7e]/.test(address) ||
    !isEmail(address, {
      allow_utf8_local_part: false,
      allow_display_name: false,
      require_tld: true,
    })
  )
    throw new BadRequestException('ایمیل معتبر نیست.');
  // This is an explicit application lookup convention, not an assertion that
  // every mail provider treats the local part case-insensitively. Conflicting
  // legacy accounts must be rejected by the binding transaction, never merged.
  return address.toLowerCase();
}

export function parsePasswordIdentifier(
  value: unknown,
): { kind: 'phone'; phone: string } | { kind: 'email'; email: string } {
  if (typeof value !== 'string')
    throw new BadRequestException('شناسه ورود معتبر نیست.');
  const input = value.trim();
  if (input.includes('@'))
    return { kind: 'email', email: normalizeVerifiedEmailAddress(input) };
  const phone = input.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  });
  if (!/^09\d{9}$/.test(phone))
    throw new BadRequestException('شناسه ورود معتبر نیست.');
  return { kind: 'phone', phone };
}
