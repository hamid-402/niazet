/** Generates short, human-friendly, non-guessable reference codes (e.g. ORD-4F82A1). */
export function generateReferenceCode(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${time}${random}`;
}
