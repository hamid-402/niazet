const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const WORKING_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR;
// جمعه (۵) و پنجشنبه (۴) در تقویم کاری ایران تعطیل در نظر گرفته شده‌اند.
const WEEKEND_DAYS = [4, 5];

/**
 * محاسبه SLA بر اساس ساعات کاری، نه ساعت تقویمی (سند v4 §۱۷.۳).
 * پیاده‌سازی ساده اما صحیح: هر روز غیرتعطیل فقط ۹ ساعت کاری (۹ تا ۱۸) دارد.
 */
export function addBusinessHours(start: Date, hoursToAdd: number): Date {
  const cursor = new Date(start);
  let remaining = hoursToAdd;

  if (isWeekend(cursor) || cursor.getHours() >= WORK_END_HOUR) {
    moveToNextWorkdayStart(cursor);
  } else if (cursor.getHours() < WORK_START_HOUR) {
    cursor.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  while (remaining > 0) {
    const hoursLeftToday = WORK_END_HOUR - cursor.getHours() - cursor.getMinutes() / 60;

    if (remaining <= hoursLeftToday) {
      cursor.setTime(cursor.getTime() + remaining * 60 * 60 * 1000);
      remaining = 0;
    } else {
      remaining -= hoursLeftToday;
      moveToNextWorkdayStart(cursor);
    }
  }

  return cursor;
}

function isWeekend(date: Date): boolean {
  return WEEKEND_DAYS.includes(date.getDay());
}

function moveToNextWorkdayStart(date: Date): void {
  do {
    date.setDate(date.getDate() + 1);
  } while (isWeekend(date));
  date.setHours(WORK_START_HOUR, 0, 0, 0);
}

export function slaTargetHoursForPriority(priority: 'low' | 'normal' | 'high' | 'urgent'): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 8;
    case 'normal':
      return WORKING_HOURS_PER_DAY * 1;
    case 'low':
    default:
      return WORKING_HOURS_PER_DAY * 3;
  }
}
