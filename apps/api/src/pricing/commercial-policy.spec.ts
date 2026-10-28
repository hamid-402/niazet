import { BadRequestException } from '@nestjs/common';
import { readCommercialPolicy } from './commercial-policy';

const valid = () => ({
  calendar: {
    version: 1,
    timezone: 'Asia/Tehran',
    workDays: [6, 0, 1, 2, 3, 4],
    holidays: [],
  },
  normalMinutes: 1440,
  urgentMinutes: 480,
  sameDayEnabled: true,
  quoteTtlMinutes: 30,
  requiredSkills: ['design'],
  formula: null,
});
describe('Z2 commercial policy validates complete bounded contracts', () => {
  it('uses explicit durations without deriving them from the surcharge', () => {
    const source = valid(),
      before = JSON.stringify(source),
      result = readCommercialPolicy(source);
    expect(result.normalMinutes).toBe(1440);
    expect(result.urgentMinutes).toBe(480);
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    { normalMinutes: 0 },
    { normalMinutes: null },
    { normalMinutes: 525601 },
    { urgentMinutes: 1441 },
    { urgentMinutes: '480' },
    { sameDayEnabled: 'true' },
    { quoteTtlMinutes: 0 },
    { quoteTtlMinutes: 1441 },
    { quoteTtlMinutes: 1.5 },
    { requiredSkills: ['design', 'design'] },
    { requiredSkills: ['*'] },
    { requiredSkills: Array(1) },
    { formula: {} },
    { calendar: {} },
    { eval: 'anything' },
  ])('rejects invalid/missing/unbounded settings %#', (change) => {
    expect(() => readCommercialPolicy({ ...valid(), ...change })).toThrow(
      BadRequestException,
    );
  });
  it('rejects missing fields and copy-isolates calendar/skill arrays', () => {
    expect(() => readCommercialPolicy({})).toThrow(BadRequestException);
    const source = valid(),
      result = readCommercialPolicy(source);
    source.requiredSkills.push('editing');
    source.calendar.workDays.length = 0;
    expect(result.requiredSkills).toEqual(['design']);
    expect(result.calendar.workDays).toHaveLength(6);
  });
});
