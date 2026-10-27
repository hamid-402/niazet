import { BadRequestException } from '@nestjs/common';
import { readPolicyArray, readPolicyRecord } from './policy-json';

export interface DeliveryCalendar {
  version: number;
  timezone: 'Asia/Tehran';
  workDays: readonly number[];
  holidays: readonly string[];
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const MINUTE = 60_000;
const MAX_DURATION_MINUTES = 525_600;

function invalid(): never {
  throw new BadRequestException('تاریخ، زمان یا تقویم تحویل معتبر نیست.');
}

function instant(value: Date): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.getTime();
}

function parseDay(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000-')
  )
    invalid();
  const date = new Date(value + 'T00:00:00Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid();
  return date;
}

function localParts(value: Date) {
  instant(value);
  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function tehranDay(value: Date): string {
  const parts = localParts(value);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  parseDay(day);
  return day;
}

/** Resolve civil time with IANA Tehran rules, never the host's timezone/offset. */
export function tehranDayMinute(day: string, minute: number): Date {
  const date = parseDay(day);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) invalid();
  const target = date.getTime() + minute * MINUTE;
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = localParts(new Date(candidate));
    const civil =
      parseDay(`${parts.year}-${parts.month}-${parts.day}`).getTime() +
      Number(parts.hour) * 60 * MINUTE +
      Number(parts.minute) * MINUTE +
      Number(parts.second) * 1000;
    const difference = target - civil;
    if (difference === 0) return new Date(candidate);
    candidate += difference;
  }
  // Nonexistent civil instants are not silently normalized.
  invalid();
}

/** Delivery calendar has no implicit dependency on the support SLA calendar. */
export function readDeliveryCalendar(value: unknown): DeliveryCalendar {
  const calendar = readPolicyRecord(value);
  const fields = ['version', 'timezone', 'workDays', 'holidays'];
  if (
    Object.keys(calendar).length !== fields.length ||
    Object.keys(calendar).some((key) => !fields.includes(key))
  )
    invalid();
  const workDays = readPolicyArray(calendar.workDays, 7);
  const holidayDays = readPolicyArray(calendar.holidays, 3660);
  if (
    !Number.isInteger(calendar.version) ||
    Number(calendar.version) < 1 ||
    Number(calendar.version) > 2_147_483_647 ||
    calendar.timezone !== 'Asia/Tehran' ||
    workDays.length < 1 ||
    workDays.some(
      (day: unknown) =>
        typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(workDays).size !== workDays.length ||
    new Set(holidayDays).size !== holidayDays.length
  )
    invalid();
  const holidays = holidayDays
    .map((day: unknown) => {
      parseDay(day);
      return String(day);
    })
    .sort();
  return Object.freeze({
    version: Number(calendar.version),
    timezone: 'Asia/Tehran',
    workDays: Object.freeze(
      (workDays as number[]).slice().sort((a, b) => a - b),
    ),
    holidays: Object.freeze(holidays),
  });
}

/** Candidate window, NOT a reservation or a promise. DB capacity is separate. */
export function calculateSameDayWindow(
  now: Date,
  eligible: boolean,
  value: unknown,
) {
  const timestamp = instant(now);
  if (typeof eligible !== 'boolean') invalid();
  const calendar = readDeliveryCalendar(value);
  const day = tehranDay(now);
  const context = {
    deliveryDay: day,
    asOf: new Date(timestamp),
    calendarSnapshot: calendar,
    capacityChecked: false as const,
    createsCommitment: false as const,
  };
  if (!eligible)
    return {
      ...context,
      available: false as const,
      reason: 'ineligible_service' as const,
    };
  if (
    !calendar.workDays.includes(parseDay(day).getUTCDay()) ||
    calendar.holidays.includes(day)
  )
    return {
      ...context,
      available: false as const,
      reason: 'non_working_day' as const,
    };
  const cutoff = tehranDayMinute(day, 14 * 60);
  if (timestamp >= cutoff.getTime())
    return {
      ...context,
      available: false as const,
      reason: 'cutoff_passed' as const,
    };
  return {
    ...context,
    available: true as const,
    holdExpiresAt: new Date(
      Math.min(timestamp + 15 * MINUTE, cutoff.getTime()),
    ),
    deadlineAt: tehranDayMinute(day, 21 * 60),
  };
}

/** Time predicate only; it cannot validate payment proof, ownership or capacity. */
export function isWithinReservationInterval(
  verifiedAt: Date,
  createdAt: Date,
  expiresAt: Date,
) {
  const time = instant(verifiedAt),
    start = instant(createdAt),
    end = instant(expiresAt);
  if (end <= start) invalid();
  return time >= start && time < end;
}

/** Explicit elapsed-minute policy. Never infer an urgent duration from its rate. */
export function calculateElapsedDeadline(
  start: Date,
  minutes: number | null,
): Date | null {
  const time = instant(start);
  if (minutes === null) return null;
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MAX_DURATION_MINUTES
  )
    invalid();
  const result = new Date(time + minutes * MINUTE);
  instant(result);
  return result;
}
