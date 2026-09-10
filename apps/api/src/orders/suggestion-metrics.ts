export function suggestionScore(input: {
  skillLevel: number;
  capacityPercent: number;
  qcPassRate: number;
  onTimeRate: number;
  riskScore: number;
}) {
  const clamp = (n: number, max = 100) =>
    Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
  return Math.round(
    clamp(input.skillLevel, 5) * 8 +
      (100 - clamp(input.capacityPercent)) * 0.25 +
      clamp(input.qcPassRate) * 0.15 +
      clamp(input.onTimeRate) * 0.15 +
      (100 - clamp(input.riskScore)) * 0.05,
  );
}
export function suggestedPrice(
  catalogPrice: number | null | undefined,
  completedPrices: number[],
) {
  if (catalogPrice && Number.isSafeInteger(catalogPrice) && catalogPrice > 0)
    return { amount: catalogPrice, source: 'current_catalog', samples: null };
  const prices = completedPrices
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length < 5)
    return {
      amount: null,
      source: 'insufficient_data',
      samples: prices.length,
    };
  const middle = Math.floor(prices.length / 2);
  return {
    amount:
      prices.length % 2
        ? prices[middle]
        : Math.round((prices[middle - 1] + prices[middle]) / 2),
    source: 'recent_completed_median',
    samples: prices.length,
  };
}
