import { BadRequestException } from '@nestjs/common';

export interface SlaCalendar {
  version: number;
  timezone: 'Asia/Tehran';
  workDays: number[];
  startMinute: number;
  endMinute: number;
  holidays: string[];
  firstResponseBusinessMinutes: number;
}

export function readSlaCalendar(
  value: unknown,
  legacyHolidays: unknown,
): SlaCalendar {
  const fallback = {
    version: 1,
    timezone: 'Asia/Tehran',
    workDays: [6, 0, 1, 2, 3, 4],
    startMinute: 540,
    endMinute: 1080,
    holidays: Array.isArray(legacyHolidays) ? legacyHolidays : [],
    firstResponseBusinessMinutes: 240,
  };
  const source: unknown = value ?? fallback;
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new BadRequestException('تقویم SLA معتبر نیست.');
  const c = source as Record<string, unknown>;
  const integer = (v: unknown, min: number, max: number): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (
    !integer(c.version, 1, 2147483647) ||
    c.timezone !== 'Asia/Tehran' ||
    !Array.isArray(c.workDays) ||
    !c.workDays.length ||
    !c.workDays.every((d) => integer(d, 0, 6)) ||
    new Set(c.workDays).size !== c.workDays.length ||
    !integer(c.startMinute, 0, 1439) ||
    !integer(c.endMinute, 1, 1440) ||
    c.endMinute <= c.startMinute ||
    !integer(c.firstResponseBusinessMinutes, 1, 525600) ||
    !Array.isArray(c.holidays) ||
    c.holidays.length > 3660 ||
    !c.holidays.every(
      (d) =>
        typeof d === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        Number.isFinite(new Date(d + 'T00:00:00Z').getTime()) &&
        new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d,
    )
  )
    throw new BadRequestException(
      'تنظیمات نسخه، روز و ساعت تقویم SLA معتبر نیست.',
    );
  return {
    version: c.version,
    timezone: 'Asia/Tehran',
    workDays: c.workDays.slice(),
    startMinute: c.startMinute,
    endMinute: c.endMinute,
    holidays: c.holidays.map((day: unknown) => String(day)),
    firstResponseBusinessMinutes: c.firstResponseBusinessMinutes,
  };
}

/** Modern Tehran civil offset; never rewrites an earlier ticket deadline. */
export function addSlaBusinessMinutes(start: Date, calendar: SlaCalendar) {
  if (!Number.isFinite(start.getTime()))
    throw new RangeError('Invalid SLA start');
  const offset = 210 * 60_000,
    day = 86400_000;
  const cursor = new Date(start.getTime() + offset);
  const holidays = new Set(calendar.holidays),
    workDays = new Set(calendar.workDays);
  let remaining = calendar.firstResponseBusinessMinutes * 60_000;
  // Bound pathological calendars; never spin forever on malformed input.
  for (let searched = 0; searched < 4000; searched++) {
    const midnight = Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth(),
      cursor.getUTCDate(),
    );
    const open = midnight + calendar.startMinute * 60_000,
      close = midnight + calendar.endMinute * 60_000;
    if (
      workDays.has(cursor.getUTCDay()) &&
      !holidays.has(cursor.toISOString().slice(0, 10)) &&
      cursor.getTime() < close
    ) {
      cursor.setTime(Math.max(cursor.getTime(), open));
      const available = close - cursor.getTime();
      if (remaining <= available)
        return new Date(cursor.getTime() + remaining - offset);
      remaining -= available;
    }
    cursor.setTime(midnight + day);
  }
  throw new BadRequestException('تقویم در بازهٔ مجاز ظرفیت محاسبه SLA ندارد.');
}

export function isMeaningfulHumanReply(body: string) {
  return (body.trim().match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3;
}
