import {
  addTehranBusinessHours,
  startOfCurrentTehranMonthUtc,
  tehranDateKey,
} from './tehran-time';

describe('Tehran time policy', () => {
  it('uses Tehran for date boundaries', () => {
    expect(tehranDateKey(new Date('2026-08-12T21:00:00.000Z'))).toBe(
      '2026-08-13',
    );
    expect(
      startOfCurrentTehranMonthUtc(
        new Date('2026-08-13T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-07-31T20:30:00.000Z');
  });

  it('does not consume SLA hours on Friday or configured holidays', () => {
    const result = addTehranBusinessHours(
      new Date('2026-08-13T19:30:00.000Z'),
      2,
      new Set(['2026-08-15']),
    );
    expect(tehranDateKey(result)).toBe('2026-08-16');
  });
});
