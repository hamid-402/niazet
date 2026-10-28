export const TEHRAN_TIME_ZONE = 'Asia/Tehran';
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

export function tehranDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TEHRAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function tehranHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TEHRAN_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
}

export function startOfCurrentTehranMonthUtc(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return new Date(Date.UTC(year, month - 1, 1) - TEHRAN_OFFSET_MS);
}

export function addTehranBusinessHours(
  start: Date,
  hours: number,
  holidays: ReadonlySet<string> = new Set(),
) {
  if (hours < 0) throw new RangeError('Business hours cannot be negative.');
  let cursor = new Date(start);
  let remaining = hours;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: TEHRAN_TIME_ZONE,
      weekday: 'short',
    }).format(cursor);
    if (weekday !== 'Fri' && !holidays.has(tehranDateKey(cursor)))
      remaining -= 1;
  }
  return cursor;
}
