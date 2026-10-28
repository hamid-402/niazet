import { cohortRetention, forecastOrders } from './bi-metrics';
describe('business intelligence definitions', () => {
  it('does not fabricate forecasts from sparse history', () => {
    expect(forecastOrders([4, 9, 2])).toMatchObject({
      available: false,
      nextWeek: null,
    });
  });
  it('includes zero-order weeks and uses only the latest eight complete observations', () => {
    expect(forecastOrders([500, 0, 0, 0, 0, 0, 0, 0, 8])).toMatchObject({
      available: true,
      nextWeek: 1,
      lower: 0,
    });
    expect(forecastOrders([2, 2, 2, 2])).toMatchObject({
      nextWeek: 2,
      lower: 2,
      upper: 2,
    });
  });
  it('distinguishes privacy suppression and immature cohorts from measured zero retention', () => {
    expect(cohortRetention(4, 2, true)).toBeNull();
    expect(cohortRetention(10, 0, false)).toBeNull();
    expect(cohortRetention(10, 0, true)).toBe(0);
    expect(cohortRetention(10, 3, true)).toBe(30);
  });
});
