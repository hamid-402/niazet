import { BadRequestException } from '@nestjs/common';
import {
  calculateElapsedDeadline,
  calculateSameDayWindow,
  isWithinReservationInterval,
  readDeliveryCalendar,
  tehranDay,
  tehranDayMinute,
} from './delivery-window';

function calendar() {
  return {
    version: 3,
    timezone: 'Asia/Tehran',
    workDays: [6, 0, 1, 2, 3, 4],
    holidays: [] as string[],
  };
}
const local = (time: string) => new Date('2026-10-27T' + time + '+03:30');

describe('Z2 explicit Tehran delivery candidate windows', () => {
  it('uses IANA civil Tehran time and the local date across the UTC day boundary', () => {
    expect(tehranDay(new Date('2026-10-26T21:00:00Z'))).toBe('2026-10-27');
    expect(tehranDayMinute('2026-10-27', 14 * 60).toISOString()).toBe(
      '2026-10-27T10:30:00.000Z',
    );
    expect(tehranDayMinute('2026-10-27', 21 * 60).toISOString()).toBe(
      '2026-10-27T17:30:00.000Z',
    );
  });

  it.each(['13:44:00.000', '13:45:00.000', '13:59:59.999'])(
    'caps the 15-minute hold at cutoff for %s',
    (time) => {
      const now = local(time),
        result = calculateSameDayWindow(now, true, calendar());
      expect(result.available).toBe(true);
      if (!result.available) throw new Error('Expected available candidate');
      expect(result.holdExpiresAt.getTime()).toBe(
        Math.min(now.getTime() + 900_000, local('14:00:00.000').getTime()),
      );
      expect(result.deadlineAt).toEqual(local('21:00:00.000'));
      expect(result.capacityChecked).toBe(false);
      expect(result.createsCommitment).toBe(false);
    },
  );

  it.each(['14:00:00.000', '14:00:00.001', '21:00:00.000'])(
    'never admits a same-day candidate at/after cutoff %s',
    (time) => {
      expect(
        calculateSameDayWindow(local(time), true, calendar()),
      ).toMatchObject({ available: false, reason: 'cutoff_passed' });
    },
  );

  it('rejects Friday, registered holiday and ineligible services without inventing another delivery day', () => {
    expect(
      calculateSameDayWindow(
        new Date('2026-10-30T10:00:00+03:30'),
        true,
        calendar(),
      ),
    ).toMatchObject({
      available: false,
      reason: 'non_working_day',
      deliveryDay: '2026-10-30',
    });
    expect(
      calculateSameDayWindow(local('10:00:00'), true, {
        ...calendar(),
        holidays: ['2026-10-27'],
      }),
    ).toMatchObject({ available: false, reason: 'non_working_day' });
    expect(
      calculateSameDayWindow(local('10:00:00'), false, calendar()),
    ).toMatchObject({ available: false, reason: 'ineligible_service' });
  });

  it('preserves a copied calendar revision when the operator changes its source', () => {
    const source = calendar(),
      before = JSON.stringify(source),
      result = calculateSameDayWindow(local('10:00:00'), true, source);
    expect(JSON.stringify(source)).toBe(before);
    source.version = 4;
    source.holidays.push('2026-10-27');
    source.workDays.length = 0;
    expect(result.calendarSnapshot.version).toBe(3);
    expect(result.calendarSnapshot.holidays).toEqual([]);
    expect(result.calendarSnapshot.workDays).toHaveLength(6);
    expect(Object.isFrozen(result.calendarSnapshot.holidays)).toBe(true);
  });

  it.each([
    null,
    {},
    { version: '3' },
    { version: 0 },
    { timezone: 'UTC' },
    { workDays: [] },
    { workDays: [6, 6] },
    { workDays: [7] },
    { workDays: ['6'] },
    { holidays: ['2026-02-30'] },
    { holidays: ['2026-10-27', '2026-10-27'] },
    { code: 'anything' },
  ])('fails closed for absent/malformed policy %#', (changes) => {
    const input =
      changes === null || Object.keys(changes).length === 0
        ? changes
        : { ...calendar(), ...changes };
    expect(() => readDeliveryCalendar(input)).toThrow(BadRequestException);
  });

  it.each(['2026-02-30', '2026-13-01', '27-10-2026', '2026-1-1'])(
    'rejects normalized or ambiguous dates %s',
    (date) => {
      expect(() => tehranDayMinute(date, 840)).toThrow(BadRequestException);
    },
  );

  it.each([-1, 1440, 1.5, NaN, Infinity])(
    'rejects invalid local minute %s',
    (minute) => {
      expect(() => tehranDayMinute('2026-10-27', minute)).toThrow(
        BadRequestException,
      );
    },
  );

  it('treats reservation validity as half-open, not as payment authorization', () => {
    const start = local('13:45:00.000'),
      end = local('14:00:00.000');
    expect(isWithinReservationInterval(start, start, end)).toBe(true);
    expect(
      isWithinReservationInterval(new Date(end.getTime() - 1), start, end),
    ).toBe(true);
    expect(
      isWithinReservationInterval(new Date(start.getTime() - 1), start, end),
    ).toBe(false);
    expect(isWithinReservationInterval(end, start, end)).toBe(false);
    expect(isWithinReservationInterval(local('14:00:00.001'), start, end)).toBe(
      false,
    );
    expect(() => isWithinReservationInterval(start, end, start)).toThrow(
      BadRequestException,
    );
    expect(() =>
      isWithinReservationInterval(new Date('invalid'), start, end),
    ).toThrow(BadRequestException);
  });

  it('requires an explicit duration; unknown stays null and no urgent multiplier is invented', () => {
    const now = local('13:00:00.000');
    expect(calculateElapsedDeadline(now, null)).toBeNull();
    expect(calculateElapsedDeadline(now, 60)).toEqual(local('14:00:00.000'));
    expect(now).toEqual(local('13:00:00.000'));
    for (const minutes of [0, -1, 1.5, NaN, Infinity, 525_601])
      expect(() => calculateElapsedDeadline(now, minutes)).toThrow(
        BadRequestException,
      );
    expect(() =>
      calculateSameDayWindow(new Date('invalid'), true, calendar()),
    ).toThrow(BadRequestException);
  });

  it('rejects sparse arrays, inherited calendars and getters without executing them', () => {
    const getter = jest.fn(() => calendar().workDays);
    const withGetter = { ...calendar() };
    Object.defineProperty(withGetter, 'workDays', {
      get: getter,
      enumerable: true,
    });
    for (const input of [
      withGetter,
      Object.create(calendar()),
      { ...calendar(), workDays: Array(1) },
      { ...calendar(), holidays: Array(1) },
      { ...calendar(), [Symbol('x')]: 1 },
    ]) {
      expect(() => readDeliveryCalendar(input)).toThrow(BadRequestException);
    }
    expect(getter).not.toHaveBeenCalled();
  });
});
