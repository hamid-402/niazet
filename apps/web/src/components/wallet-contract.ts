export const MAX_WALLET_AMOUNT = 2_000_000_000;
export function parseWalletAmount(value: string): number | null {
  const normalized = value.trim().replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[,٬]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_WALLET_AMOUNT ? amount : null;
}
