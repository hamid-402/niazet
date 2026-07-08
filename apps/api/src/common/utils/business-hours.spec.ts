import { addBusinessHours } from './business-hours';

describe('addBusinessHours', () => {
  it('adds hours within the same working day', () => {
    const start = new Date('2026-07-11T10:00:00'); // شنبه (working day)
    const result = addBusinessHours(start, 3);
    expect(result.getHours()).toBe(13);
    expect(result.getDate()).toBe(start.getDate());
  });

  it('rolls over to the next working day after hours', () => {
    const start = new Date('2026-07-11T16:00:00'); // شنبه ۱۶:۰۰
    const result = addBusinessHours(start, 4); // 2 ساعت تا پایان روز + ۲ ساعت روز بعد
    expect(result.getHours()).toBe(11);
  });

  it('skips Thursday/Friday weekend', () => {
    // 2026-07-16 پنجشنبه است؛ نتیجه باید در شنبه (روز ۶) باشد، نه در تعطیلات.
    const thursday = new Date('2026-07-16T17:00:00');
    const result = addBusinessHours(thursday, 2);
    expect(result.getDay()).not.toBe(4);
    expect(result.getDay()).not.toBe(5);
    expect(result.getDay()).toBe(6);
  });
});
