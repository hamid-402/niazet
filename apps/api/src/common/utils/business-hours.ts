import { tehranDateKey } from './tehran-time';

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const WORKING_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR;
const WEEKEND_DAYS = new Set([4, 5]); // Thursday and Friday
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function toTehranWallClock(instant: Date) {
  return new Date(instant.getTime() + TEHRAN_OFFSET_MS);
}

function fromTehranWallClock(wallClock: Date) {
  return new Date(wallClock.getTime() - TEHRAN_OFFSET_MS);
}

function isNonWorkingDay(wallClock: Date, holidays: ReadonlySet<string>) {
  return (
    WEEKEND_DAYS.has(wallClock.getUTCDay()) ||
    holidays.has(tehranDateKey(fromTehranWallClock(wallClock)))
  );
}

function moveToNextWorkdayStart(
  wallClock: Date,
  holidays: ReadonlySet<string>,
) {
  do {
    wallClock.setUTCDate(wallClock.getUTCDate() + 1);
  } while (isNonWorkingDay(wallClock, holidays));
  wallClock.setUTCHours(WORK_START_HOUR, 0, 0, 0);
}

/** SLA is calculated in Asia/Tehran, 09:00–18:00, excluding weekends/holidays. */
export function addBusinessHours(
  start: Date,
  hoursToAdd: number,
  holidays: ReadonlySet<string> = new Set(),
) {
  if (!Number.isFinite(hoursToAdd) || hoursToAdd < 0) {
    throw new RangeError('Business hours must be a non-negative number.');
  }
  const cursor = toTehranWallClock(start);
  let remaining = hoursToAdd;

  if (
    isNonWorkingDay(cursor, holidays) ||
    cursor.getUTCHours() >= WORK_END_HOUR
  ) {
    moveToNextWorkdayStart(cursor, holidays);
  } else if (cursor.getUTCHours() < WORK_START_HOUR) {
    cursor.setUTCHours(WORK_START_HOUR, 0, 0, 0);
  }

  while (remaining > 0) {
    const hoursLeft =
      WORK_END_HOUR - cursor.getUTCHours() - cursor.getUTCMinutes() / 60;
    if (remaining <= hoursLeft) {
      cursor.setTime(cursor.getTime() + remaining * 60 * 60 * 1000);
      remaining = 0;
    } else {
      remaining -= hoursLeft;
      moveToNextWorkdayStart(cursor, holidays);
    }
  }
  return fromTehranWallClock(cursor);
}

export function slaTargetHoursForPriority(
  priority: 'low' | 'normal' | 'high' | 'urgent',
) {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 8;
    case 'normal':
      return WORKING_HOURS_PER_DAY;
    case 'low':
    default:
      return WORKING_HOURS_PER_DAY * 3;
  }
}
