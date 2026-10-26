import { BadRequestException } from '@nestjs/common';
import {
  addSlaBusinessMinutes,
  isMeaningfulHumanReply,
  readSlaCalendar,
} from './sla-calendar';

describe('versioned Tehran first-response calendar', () => {
  const calendar = readSlaCalendar(null, []);
  it.each([
    ['2026-10-24T05:30:00.000Z', '2026-10-24T09:30:00.000Z'], // Saturday 09 to 13
    ['2026-10-29T12:30:00.000Z', '2026-10-31T07:30:00.000Z'], // Thursday 16 + 4 => Saturday 11
    ['2026-10-30T08:30:00.000Z', '2026-10-31T09:30:00.000Z'], // Friday off
    ['2026-10-24T04:00:00.000Z', '2026-10-24T09:30:00.000Z'], // before open
    ['2026-10-24T14:29:59.500Z', '2026-10-25T09:29:59.500Z'], // exact seconds retained
    ['2026-12-31T13:30:00.000Z', '2027-01-02T08:30:00.000Z'], // year boundary
  ])('preserves civil time/seconds at %s', (start, expected) => {
    expect(addSlaBusinessMinutes(new Date(start), calendar).toISOString()).toBe(
      expected,
    );
  });
  it('snapshots holidays and supports changed policy only for future tickets', () => {
    const changed = readSlaCalendar(
      {
        ...calendar,
        version: 2,
        holidays: ['2026-10-24'],
        firstResponseBusinessMinutes: 60,
      },
      [],
    );
    expect(
      addSlaBusinessMinutes(
        new Date('2026-10-24T05:30Z'),
        changed,
      ).toISOString(),
    ).toBe('2026-10-25T06:30:00.000Z');
    expect(calendar.version).toBe(1);
    expect(calendar.holidays).toEqual([]);
  });
  it.each([
    { workDays: [] },
    { workDays: [5, 5] },
    { startMinute: 1080 },
    { timezone: 'UTC' },
    { version: 0 },
    { holidays: ['2026-02-30'] },
    { holidays: ['2026-99-99'] },
  ])('rejects malformed or unusable calendar %j', (override) => {
    expect(() => readSlaCalendar({ ...calendar, ...override }, [])).toThrow(
      BadRequestException,
    );
  });
  it('does not count whitespace or punctuation as meaningful human reply', () => {
    expect(isMeaningfulHumanReply(' ... ')).toBe(false);
    expect(isMeaningfulHumanReply('در حال بررسی هستیم')).toBe(true);
  });
});
