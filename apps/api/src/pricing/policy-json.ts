import { BadRequestException } from '@nestjs/common';

function invalid(): never {
  throw new BadRequestException('دادهٔ تنظیمات محاسبه معتبر نیست.');
}

/** Accept inert JSON-shaped data, not getters, symbols or inherited values. */
export function readPolicyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  if (
    Reflect.ownKeys(value).length > 64 ||
    Object.getOwnPropertySymbols(value).length
  )
    invalid();
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      invalid();
  }
  return value as Record<string, unknown>;
}

export function readPolicyArray(value: unknown, maximum: number): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length ||
    Object.keys(value).length !== value.length
  )
    invalid();
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      !descriptor.enumerable
    )
      invalid();
  }
  return value;
}
