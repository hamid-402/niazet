import { addBusinessHours } from './business-hours';
import { tehranDateKey } from './tehran-time';

function tehranHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
}

describe('addBusinessHours', () => {
  it('adds hours within the same Tehran working day', () => {
    const start = new Date('2026-07-11T06:30:00Z'); // 10:00 Tehran
    expect(tehranHour(addBusinessHours(start, 3))).toBe(13);
  });

  it('rolls over at 18:00 Tehran', () => {
    const start = new Date('2026-07-11T12:30:00Z'); // 16:00 Tehran
    expect(tehranHour(addBusinessHours(start, 4))).toBe(11);
  });

  it('skips Thursday, Friday and configured holidays', () => {
    const start = new Date('2026-07-15T13:30:00Z'); // Wednesday 17:00 Tehran
    const result = addBusinessHours(start, 2, new Set(['2026-07-18']));
    expect(tehranDateKey(result)).toBe('2026-07-19');
    expect(tehranHour(result)).toBe(10);
  });
});
