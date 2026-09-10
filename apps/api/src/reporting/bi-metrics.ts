export function forecastOrders(weeks: number[]) {
  if (weeks.length < 4)
    return {
      available: false as const,
      reason: 'insufficient_history',
      nextWeek: null,
      lower: null,
      upper: null,
    };
  const recent = weeks.slice(-8);
  const mean = recent.reduce((sum, count) => sum + count, 0) / recent.length;
  const deviation = Math.sqrt(
    recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(1, recent.length - 1),
  );
  return {
    available: true as const,
    reason: null,
    nextWeek: Math.round(mean),
    lower: Math.max(0, Math.floor(mean - 2 * deviation)),
    upper: Math.ceil(mean + 2 * deviation),
  };
}

export function cohortRetention(
  denominator: number,
  retained: number,
  complete: boolean,
  minimum = 5,
) {
  // Small cohorts and unobserved windows must never look like 0% retention.
  return denominator < minimum || !complete
    ? null
    : Math.round((retained / denominator) * 10000) / 100;
}
