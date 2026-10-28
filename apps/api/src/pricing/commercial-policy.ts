import { BadRequestException } from '@nestjs/common';
import { readDeliveryCalendar } from './delivery-window';
import { readLinearPriceFormula } from './formula-price';
import { readPolicyArray, readPolicyRecord } from './policy-json';

export function readCommercialPolicy(raw: unknown) {
  const p = readPolicyRecord(raw);
  const names = [
    'calendar',
    'normalMinutes',
    'urgentMinutes',
    'sameDayEnabled',
    'quoteTtlMinutes',
    'requiredSkills',
    'formula',
  ];
  if (
    Object.keys(p).length !== names.length ||
    Object.keys(p).some((k) => !names.includes(k))
  )
    throw new BadRequestException('فیلد سیاست تجاری معتبر نیست.');
  const duration = (value: unknown, maximum: number) => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > maximum
    )
      throw new BadRequestException('مدت سیاست تجاری معتبر نیست.');
    return value;
  };
  if (typeof p.sameDayEnabled !== 'boolean')
    throw new BadRequestException('وضعیت همان‌روز معتبر نیست.');
  const requiredSkills = readPolicyArray(p.requiredSkills, 8).map((value) => {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value))
      throw new BadRequestException('شناسهٔ مهارت معتبر نیست.');
    return value;
  });
  if (new Set(requiredSkills).size !== requiredSkills.length)
    throw new BadRequestException('مهارت تکراری است.');
  const normalMinutes = duration(p.normalMinutes, 525600);
  const urgentMinutes = duration(p.urgentMinutes, 525600);
  if (urgentMinutes > normalMinutes)
    throw new BadRequestException('مهلت فوری نباید از مهلت عادی بیشتر باشد.');
  return {
    calendar: readDeliveryCalendar(p.calendar),
    normalMinutes,
    urgentMinutes,
    sameDayEnabled: p.sameDayEnabled,
    quoteTtlMinutes: duration(p.quoteTtlMinutes, 1440),
    requiredSkills: requiredSkills.sort(),
    formula: p.formula === null ? null : readLinearPriceFormula(p.formula),
  };
}
