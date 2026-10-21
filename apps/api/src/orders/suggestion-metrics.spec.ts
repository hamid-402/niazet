import { suggestedPrice, suggestionScore } from './suggestion-metrics';
describe('human-reviewed suggestions', () => {
  it('prioritizes reviewed catalog price without claiming a final quote', () => {
    expect(suggestedPrice(500, [1, 2, 3, 4, 5])).toEqual({
      amount: 500,
      source: 'current_catalog',
      samples: null,
    });
  });
  it('requires five valid completed samples for historical pricing', () => {
    expect(suggestedPrice(null, [1, 2, 3, 4, 0, NaN])).toMatchObject({
      amount: null,
    });
  });
  it('uses a robust median, not a high outlier', () => {
    expect(suggestedPrice(null, [10, 20, 30, 40, 99999]).amount).toBe(30);
  });
  it('bounds ranking and penalizes capacity/risk while rewarding skill', () => {
    const good = {
      skillLevel: 5,
      capacityPercent: 0,
      qcPassRate: 100,
      onTimeRate: 100,
      riskScore: 0,
    };
    expect(suggestionScore(good)).toBe(100);
    expect(
      suggestionScore({ ...good, capacityPercent: 90, riskScore: 100 }),
    ).toBeLessThan(suggestionScore(good));
    expect(suggestionScore({ ...good, skillLevel: 1 })).toBeLessThan(
      suggestionScore(good),
    );
  });
});
